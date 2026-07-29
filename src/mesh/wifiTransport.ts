/**
 * Plan B — a local WiFi relay, for when the BLE spike does not go cleanly.
 *
 * This is what WarpChat actually did during the July 2024 blackout: a server
 * reachable over BDIX, Bangladesh's local ISP-to-ISP peering backbone, which
 * kept working after the international gateway was cut. Here the same idea in
 * miniature — one phone or laptop hosts a hotspot and runs `npm run hub`,
 * everyone else joins it, and packets fan out through that hub.
 *
 * Less "meshy" than BLE and honest about it: it is a star, not a mesh, and it
 * has a single point of failure. But the claim that matters — **no internet
 * required** — stays completely true, and it is far more reliable to get
 * working under deadline.
 *
 * Everything above this file is unchanged when swapping between plans. That
 * was FALLBACKS.md's whole argument for keeping packet.ts and relay.ts
 * transport-agnostic, and this file is where the bet pays off: no packet
 * logic, no relay logic, just a socket.
 *
 * Packets travel as base64 text frames rather than binary. React Native's
 * WebSocket binary support varies by platform and version, and a transport
 * that silently fails to deliver on one phone is the worst possible outcome
 * for a fallback whose entire job is being dependable.
 */

import {decodeBase64, encodeBase64} from 'tweetnacl-util';
import type {VoxConfig} from '../config/schema';
import {
  IDLE_STATUS,
  TransportEmitter,
  type MeshTransport,
  type TransportListener,
  type TransportStatus,
} from './transport';

/** Backoff between reconnection attempts, in ms. */
const RECONNECT_STEPS = [500, 1000, 2000, 4000, 8000];

export class WifiTransport implements MeshTransport {
  readonly kind = 'wifi' as const;

  private readonly emitter = new TransportEmitter();
  private readonly config: VoxConfig;
  private socket: WebSocket | null = null;
  private currentStatus: TransportStatus = IDLE_STATUS;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedDeliberately = false;

  /**
   * Packets queued while the socket is down. A user pressing SOS during a
   * reconnect must not simply lose it — the whole point of the fallback is
   * that it is dependable.
   */
  private readonly outbox: string[] = [];
  private static readonly MAX_OUTBOX = 64;

  constructor(config: VoxConfig) {
    this.config = config;
  }

  get status(): TransportStatus {
    return this.currentStatus;
  }

  async start(): Promise<void> {
    this.closedDeliberately = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.closedDeliberately = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.outbox.length = 0;
    this.setStatus(IDLE_STATUS);
  }

  async send(data: Uint8Array): Promise<void> {
    const encoded = encodeBase64(data);
    if (this.socket && this.socket.readyState === 1 /* OPEN */) {
      this.socket.send(encoded);
      return;
    }
    if (this.outbox.length >= WifiTransport.MAX_OUTBOX) {
      // Drop the oldest rather than the newest: in an emergency the most
      // recent report is the one worth keeping.
      this.outbox.shift();
    }
    this.outbox.push(encoded);
  }

  subscribe(listener: TransportListener): () => void {
    return this.emitter.subscribe(listener);
  }

  private connect(): void {
    this.setStatus({
      state: 'starting',
      ready: false,
      detail: `Connecting to hub at ${this.config.wifiHubUrl}`,
      maxFrameBytes: null,
    });

    const socket = new WebSocket(this.config.wifiHubUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus({
        state: 'ready',
        ready: true,
        detail: 'Connected to local hub (no internet in use)',
        maxFrameBytes: null,
      });
      this.flushOutbox();
    };

    socket.onmessage = event => {
      const raw = event.data;
      if (typeof raw !== 'string') return;
      let data: Uint8Array;
      try {
        data = decodeBase64(raw);
      } catch {
        return;
      }
      this.emitter.emitMessage({
        data,
        // A WiFi hub has no per-peer signal strength to report, and inventing
        // one would put a fabricated number on the dashboard.
        rssi: null,
        receivedAt: Date.now(),
      });
    };

    socket.onerror = () => {
      this.setStatus({
        state: 'degraded',
        ready: false,
        detail: 'Cannot reach the hub — is the hotspot joined?',
        maxFrameBytes: null,
      });
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.closedDeliberately) return;
      this.scheduleReconnect();
    };
  }

  private flushOutbox(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return;
    while (this.outbox.length > 0) {
      socket.send(this.outbox.shift()!);
    }
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_STEPS[
        Math.min(this.reconnectAttempt, RECONNECT_STEPS.length - 1)
      ]!;
    this.reconnectAttempt += 1;

    this.setStatus({
      state: 'degraded',
      ready: false,
      detail: `Hub unreachable — retrying in ${Math.round(delay / 1000)}s`,
      maxFrameBytes: null,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedDeliberately) this.connect();
    }, delay);
  }

  private setStatus(status: TransportStatus): void {
    this.currentStatus = status;
    this.emitter.emitStatus(status);
  }

  get diagnostics() {
    return {
      hubUrl: this.config.wifiHubUrl,
      queued: this.outbox.length,
      reconnectAttempt: this.reconnectAttempt,
    };
  }
}
