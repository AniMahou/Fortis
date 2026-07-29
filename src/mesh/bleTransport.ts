/**
 * Plan A — the real BLE broadcast mesh.
 *
 * Deliberately thin. Everything with a decision in it lives in modules that
 * can be tested on a laptop:
 *
 *   chunking.ts        splitting packets into frames, and reassembling them
 *   frameScheduler.ts  what goes on the air next, and in what order
 *   meshService.ts     what to trust, show and pass on
 *
 * What is left here is the part no test runner can exercise, because there is
 * no radio inside one: starting the advertiser, driving the frame timer, and
 * translating native events. It is excluded from coverage for that reason and
 * verified by the manual checklist in TESTING.md instead.
 *
 * Read docs/BLE_SPIKE.md before trusting this on real hardware. It is Phase 1
 * in CONTEXT.md and it is a hard stop.
 */

import {decodeBase64, encodeBase64} from 'tweetnacl-util';
import type {VoxConfig} from '../config/schema';
import type {EmitterSubscription} from 'react-native';
import {
  getCapabilities,
  onFrame,
  onState,
  setPayload,
  startAdvertising,
  startScanning,
  stopAdvertising,
  stopScanning,
  type BleCapabilities,
} from '../native/VoxMesh';
import {CHUNK_HEADER_BYTES, Reassembler, chunk, createMsgIdGenerator} from './chunking';
import {FrameScheduler, PRIORITY, type Priority} from './frameScheduler';
import {
  IDLE_STATUS,
  TransportEmitter,
  type MeshTransport,
  type TransportListener,
  type TransportStatus,
} from './transport';

/**
 * Fallback frame size if the adapter reports something implausible. 23 is the
 * honest legacy figure: 31 bytes total, minus 3 for the mandatory flags
 * structure, minus 4 for the manufacturer-data header and company id, minus
 * the magic byte.
 */
const LEGACY_FALLBACK_BYTES = 23;

export class BleTransport implements MeshTransport {
  readonly kind = 'ble' as const;

  private readonly emitter = new TransportEmitter();
  private readonly scheduler = new FrameScheduler();
  private readonly reassembler: Reassembler;
  private readonly nextMsgId = createMsgIdGenerator();
  private readonly config: VoxConfig;

  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private frameSubscription: EmitterSubscription | null = null;
  private stateSubscription: EmitterSubscription | null = null;
  private capabilities: BleCapabilities | null = null;
  private currentStatus: TransportStatus = IDLE_STATUS;
  /** Avoids re-sending identical bytes to the radio on an idle timer tick. */
  private lastPayload: string | null = null;

  constructor(config: VoxConfig) {
    this.config = config;
    this.reassembler = new Reassembler();
  }

  get status(): TransportStatus {
    return this.currentStatus;
  }

  private get frameBytes(): number {
    const reported = this.capabilities?.maxPayloadBytes ?? 0;
    // Anything at or below the chunk header is unusable — treat an implausible
    // report as "assume legacy" rather than dividing by zero later.
    return reported > CHUNK_HEADER_BYTES ? reported : LEGACY_FALLBACK_BYTES;
  }

  async start(): Promise<void> {
    this.setStatus({
      state: 'starting',
      ready: false,
      detail: 'Starting Bluetooth mesh',
      maxFrameBytes: null,
    });

    const capabilities = await getCapabilities();
    this.capabilities = capabilities;

    if (!capabilities.bluetoothSupported) {
      this.setStatus({
        state: 'error',
        ready: false,
        detail: 'This device has no Bluetooth LE radio',
        maxFrameBytes: null,
      });
      return;
    }
    if (!capabilities.bluetoothEnabled) {
      // Specific beats reassuring: this tells someone what to do about it.
      this.setStatus({
        state: 'error',
        ready: false,
        detail: 'Bluetooth is off — switch it on to join the mesh',
        maxFrameBytes: null,
      });
      return;
    }
    if (capabilities.missingPermissions.length > 0) {
      this.setStatus({
        state: 'error',
        ready: false,
        detail: 'Bluetooth and location permissions are needed to join the mesh',
        maxFrameBytes: null,
      });
      return;
    }

    this.frameSubscription = onFrame(event => {
      let frame: Uint8Array;
      try {
        frame = decodeBase64(event.payload);
      } catch {
        return;
      }
      const complete = this.reassembler.accept(frame);
      if (!complete) return;
      this.emitter.emitMessage({
        data: complete,
        rssi: event.rssi,
        receivedAt: event.timestamp,
      });
    });

    this.stateSubscription = onState(event => {
      // Only surface states that change what the user can do. Routine
      // start/stop chatter would make the status line flicker for no reason.
      if (event.state.endsWith('_error')) {
        this.setStatus({
          ...this.currentStatus,
          state: 'degraded',
          detail: `Bluetooth reported ${event.detail ?? event.state}`,
        });
      }
    });

    await startScanning(this.config.bleManufacturerId);

    // Scanning without advertising is still useful — the device can receive
    // and display, it just cannot relay or originate. Some hardware genuinely
    // cannot advertise, and half a mesh node beats none.
    if (!capabilities.advertisingSupported) {
      this.setStatus({
        state: 'degraded',
        ready: true,
        detail: 'Receive only — this device cannot broadcast over Bluetooth',
        maxFrameBytes: this.frameBytes,
      });
      return;
    }

    await startAdvertising(
      this.config.bleManufacturerId,
      this.config.bleServiceUuid,
    );
    this.startFrameLoop();

    this.setStatus({
      state: 'ready',
      ready: true,
      detail: capabilities.extendedAdvertisingSupported
        ? 'Bluetooth mesh active (BLE 5 extended)'
        : 'Bluetooth mesh active (legacy frames)',
      maxFrameBytes: this.frameBytes,
    });
  }

  async stop(): Promise<void> {
    this.stopFrameLoop();
    this.frameSubscription?.remove();
    this.frameSubscription = null;
    this.stateSubscription?.remove();
    this.stateSubscription = null;
    this.scheduler.clear();
    this.reassembler.reset();
    this.lastPayload = null;
    await Promise.all([stopAdvertising(), stopScanning()]);
    this.setStatus(IDLE_STATUS);
  }

  async send(data: Uint8Array): Promise<void> {
    this.enqueue(data, PRIORITY.normal);
  }

  /**
   * Queue with an explicit priority. `meshService` calls plain `send`; the SOS
   * path uses this so a distress packet is not stuck behind chat.
   */
  sendWithPriority(data: Uint8Array, priority: Priority): void {
    this.enqueue(data, priority);
  }

  private enqueue(data: Uint8Array, priority: Priority): void {
    const frames = chunk(data, this.frameBytes, this.nextMsgId());
    this.scheduler.enqueue(frames, {priority});
  }

  subscribe(listener: TransportListener): () => void {
    return this.emitter.subscribe(listener);
  }

  private startFrameLoop(): void {
    if (this.frameTimer) return;
    this.frameTimer = setInterval(() => {
      const frame = this.scheduler.next();
      if (!frame) return;
      const encoded = encodeBase64(frame);
      if (encoded === this.lastPayload) return;
      this.lastPayload = encoded;
      void setPayload(encoded).catch(() => {
        // A single dropped frame is not worth surfacing — the scheduler is
        // already repeating each one several times, which is the entire
        // delivery strategy on a medium with no acknowledgements.
      });
    }, this.config.bleFrameIntervalMs);
  }

  private stopFrameLoop(): void {
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
  }

  private setStatus(status: TransportStatus): void {
    this.currentStatus = status;
    this.emitter.emitStatus(status);
  }

  /** Exposed for the debug overlay. */
  get diagnostics() {
    return {
      capabilities: this.capabilities,
      frameBytes: this.frameBytes,
      queuedJobs: this.scheduler.pendingJobs,
      queuedFrames: this.scheduler.pendingFrames,
      partialMessages: this.reassembler.pendingCount,
    };
  }
}
