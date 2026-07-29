/**
 * The transport seam.
 *
 * FALLBACKS.md's whole argument for keeping packet.ts and relay.ts
 * transport-agnostic was that switching from Plan A (BLE) to Plan B (WiFi hub)
 * should be a new file, not a rewrite. This interface is where that promise is
 * kept — `meshService.ts` above it never learns which one it is talking to.
 *
 * A transport deals in **whole serialised packets**, not frames. BLE has to
 * fragment those across 23-byte advertisements and reassemble them; WiFi does
 * not. That is the transport's own business, and hiding it here is what keeps
 * the difference between the two plans from leaking upward.
 */

import type {TransportKind} from '../config/schema';

export interface TransportMessage {
  /** One complete serialised packet, reassembled if the transport had to. */
  data: Uint8Array;
  /** BLE signal strength in dBm. Null on transports that have no notion of it. */
  rssi: number | null;
  receivedAt: number;
}

export type TransportState =
  | 'idle'
  | 'starting'
  | 'ready'
  /** Running, but not at full capability — e.g. scanning but unable to advertise. */
  | 'degraded'
  | 'error';

export interface TransportStatus {
  state: TransportState;
  /** True when packets can actually move. */
  ready: boolean;
  /**
   * Human-readable reason, shown in the UI. Specific beats reassuring:
   * "Bluetooth is off" tells someone what to do, "not connected" does not.
   */
  detail: string | null;
  /**
   * Usable bytes per frame, for diagnostics. Null where fragmentation does not
   * apply.
   */
  maxFrameBytes: number | null;
}

export interface TransportListener {
  onMessage?(message: TransportMessage): void;
  onStatus?(status: TransportStatus): void;
}

export interface MeshTransport {
  readonly kind: TransportKind;
  readonly status: TransportStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Broadcasts one serialised packet to everyone in range. */
  send(data: Uint8Array): Promise<void>;
  subscribe(listener: TransportListener): () => void;
}

/**
 * Listener bookkeeping, shared by all three transports.
 *
 * A listener that throws must not take down the transport or stop the other
 * listeners — a rendering bug in one screen should not stop SOS packets from
 * reaching the map.
 */
export class TransportEmitter {
  private readonly listeners = new Set<TransportListener>();

  subscribe(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitMessage(message: TransportMessage): void {
    for (const listener of [...this.listeners]) {
      try {
        listener.onMessage?.(message);
      } catch {
        // Swallowed deliberately — see the class comment.
      }
    }
  }

  emitStatus(status: TransportStatus): void {
    for (const listener of [...this.listeners]) {
      try {
        listener.onStatus?.(status);
      } catch {
        // As above.
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export const IDLE_STATUS: TransportStatus = {
  state: 'idle',
  ready: false,
  detail: null,
  maxFrameBytes: null,
};
