/**
 * An in-process mesh, for development and for testing multi-hop relay without
 * a radio.
 *
 * This is not just a stub. `LoopbackBus` models **reachability**, so a test can
 * build A—B—C where A and C cannot hear each other and assert that a message
 * still gets from A to C by hopping through B. That is the single most
 * important behaviour in the whole project (CONTEXT.md Phase 2), and it is the
 * one thing a laptop genuinely can verify — the BLE spike proves the radio
 * works, but the relay logic on top of it is provable here.
 *
 * It also backs `VOX_MESH_TRANSPORT=loopback`, which lets the full UI be
 * driven on an emulator with no Bluetooth at all.
 */

import type {TransportKind} from '../config/schema';
import {
  IDLE_STATUS,
  TransportEmitter,
  type MeshTransport,
  type TransportListener,
  type TransportStatus,
} from './transport';

export interface LoopbackOptions {
  /** Label used in reachability rules and diagnostics. */
  nodeId: string;
  bus: LoopbackBus;
  /** Simulated one-way delivery delay, in ms. */
  latencyMs?: number;
  /** 0..1 chance a delivery is silently dropped, to model a lossy radio. */
  lossRate?: number;
}

export class LoopbackBus {
  private readonly nodes = new Map<string, LoopbackTransport>();
  /** `${from}->${to}` entries that are explicitly blocked. */
  private readonly blocked = new Set<string>();
  /** Injectable so tests are deterministic. */
  random: () => number = Math.random;

  attach(node: LoopbackTransport): void {
    this.nodes.set(node.nodeId, node);
  }

  detach(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  /**
   * Cuts the link between two nodes in both directions — how a test builds a
   * topology where relaying is the only way through.
   */
  disconnect(a: string, b: string): void {
    this.blocked.add(`${a}->${b}`);
    this.blocked.add(`${b}->${a}`);
  }

  connect(a: string, b: string): void {
    this.blocked.delete(`${a}->${b}`);
    this.blocked.delete(`${b}->${a}`);
  }

  canReach(from: string, to: string): boolean {
    return !this.blocked.has(`${from}->${to}`);
  }

  broadcast(from: string, data: Uint8Array): void {
    for (const [nodeId, node] of this.nodes) {
      // A radio does not hear its own broadcast.
      if (nodeId === from) continue;
      if (!this.canReach(from, nodeId)) continue;
      node.deliver(data);
    }
  }

  reset(): void {
    this.nodes.clear();
    this.blocked.clear();
  }

  get nodeCount(): number {
    return this.nodes.size;
  }
}

export class LoopbackTransport implements MeshTransport {
  readonly kind: TransportKind = 'loopback';
  readonly nodeId: string;

  private readonly emitter = new TransportEmitter();
  private readonly bus: LoopbackBus;
  private readonly latencyMs: number;
  private readonly lossRate: number;
  private currentStatus: TransportStatus = IDLE_STATUS;
  private running = false;
  private readonly pending = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: LoopbackOptions) {
    this.nodeId = options.nodeId;
    this.bus = options.bus;
    this.latencyMs = options.latencyMs ?? 0;
    this.lossRate = options.lossRate ?? 0;
  }

  get status(): TransportStatus {
    return this.currentStatus;
  }

  async start(): Promise<void> {
    this.running = true;
    this.bus.attach(this);
    this.setStatus({
      state: 'ready',
      ready: true,
      detail: `Loopback node ${this.nodeId}`,
      // Matches what BLE 5 extended advertising typically reports, so payload
      // sizing behaves the same in development as on hardware.
      maxFrameBytes: 251,
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.bus.detach(this.nodeId);
    for (const timer of this.pending) clearTimeout(timer);
    this.pending.clear();
    this.setStatus(IDLE_STATUS);
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.running) {
      throw new Error('LoopbackTransport.send called before start()');
    }
    // Copy, so a caller reusing its buffer cannot mutate what is in flight.
    // The real transports get this for free by serialising through the bridge.
    this.bus.broadcast(this.nodeId, data.slice());
  }

  subscribe(listener: TransportListener): () => void {
    return this.emitter.subscribe(listener);
  }

  /** Called by the bus. Not part of MeshTransport. */
  deliver(data: Uint8Array): void {
    if (!this.running) return;
    if (this.lossRate > 0 && this.bus.random() < this.lossRate) return;

    const emit = () => {
      this.emitter.emitMessage({
        data,
        rssi: null,
        receivedAt: Date.now(),
      });
    };

    if (this.latencyMs <= 0) {
      emit();
      return;
    }
    const timer = setTimeout(() => {
      this.pending.delete(timer);
      emit();
    }, this.latencyMs);
    this.pending.add(timer);
  }

  private setStatus(status: TransportStatus): void {
    this.currentStatus = status;
    this.emitter.emitStatus(status);
  }
}
