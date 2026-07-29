/**
 * The mesh, assembled.
 *
 * Sits between a `MeshTransport` and the UI, and owns the decisions that make
 * a pile of radios into a network: what to trust, what to show, what to pass
 * on, and who is out there.
 *
 * One transport carries every kind of packet — that is CONTEXT.md's core
 * architectural idea, and it is why there is a single `handleMessage` path
 * here rather than one per feature. A phone that can relay a chat message
 * relays an SOS the same way, because to this module they differ only by a
 * type byte.
 *
 * No React Native imports, so the whole thing is testable against the
 * loopback transport.
 */

import {decodeBase64} from 'tweetnacl-util';
import type {VoxConfig} from '../config/schema';
import {verify} from '../crypto/sign';
import {InvalidPacketError, canonicalize, type MeshPacket} from './packet';
import {
  buildDangerPacket,
  buildSafePacket,
  buildSosPacket,
  buildTextPacket,
  type DangerKind,
} from './payloads';
import {RelayState} from './relay';
import type {
  MeshTransport,
  TransportMessage,
  TransportStatus,
} from './transport';
import {decodePacket, encodePacket, newPacketId} from './wire';

export interface MeshIdentity {
  /** base64 of the Ed25519 public key. This is also the packet's senderId. */
  senderId: string;
  publicKey: Uint8Array;
  sign(canonical: string): string;
}

export interface ReceivedPacket {
  packet: MeshPacket;
  /** Relays crossed. 0 means heard directly from the sender. */
  hopCount: number;
  rssi: number | null;
  receivedAt: number;
}

export interface PeerInfo {
  senderId: string;
  lastSeenAt: number;
  lastRssi: number | null;
  packetsHeard: number;
  /** Fewest hops this peer has ever been heard at. 0 means in direct range. */
  minHopCount: number;
}

export type DropReason =
  /** Not a decodable packet — noise, a foreign protocol, or corruption. */
  | 'malformed'
  /** Decoded, but the signature does not match the sender's key. */
  | 'bad_signature'
  /** Our own packet, heard back from a relay. */
  | 'own'
  /** Already seen; relay.ts stops it here to prevent a rebroadcast storm. */
  | 'duplicate';

export interface MeshListener {
  onPacket?(received: ReceivedPacket): void;
  onPeersChanged?(peers: PeerInfo[]): void;
  onStatus?(status: TransportStatus): void;
  /** Surfaced in the debug overlay — useful evidence that validation is real. */
  onDropped?(reason: DropReason, detail: string): void;
}

export interface MeshServiceDeps {
  transport: MeshTransport;
  identity: MeshIdentity;
  config: VoxConfig;
  randomBytes(length: number): Uint8Array;
  now?(): number;
  relay?: RelayState;
}

export interface MeshCounters {
  sent: number;
  received: number;
  relayed: number;
  dropped: Record<DropReason, number>;
}

export class MeshService {
  private readonly transport: MeshTransport;
  private readonly identity: MeshIdentity;
  private readonly config: VoxConfig;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly now: () => number;
  private readonly relay: RelayState;

  private readonly listeners = new Set<MeshListener>();
  private readonly peers = new Map<string, PeerInfo>();
  private unsubscribeTransport: (() => void) | null = null;

  private counters: MeshCounters = {
    sent: 0,
    received: 0,
    relayed: 0,
    dropped: {malformed: 0, bad_signature: 0, own: 0, duplicate: 0},
  };

  constructor(deps: MeshServiceDeps) {
    this.transport = deps.transport;
    this.identity = deps.identity;
    this.config = deps.config;
    this.randomBytes = deps.randomBytes;
    this.now = deps.now ?? Date.now;
    this.relay = deps.relay ?? new RelayState(deps.config.relaySeenTtlMs);
  }

  // --------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    if (this.unsubscribeTransport) return;
    this.unsubscribeTransport = this.transport.subscribe({
      onMessage: message => this.handleMessage(message),
      onStatus: status => this.emit(l => l.onStatus?.(status)),
    });
    await this.transport.start();
  }

  async stop(): Promise<void> {
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    await this.transport.stop();
  }

  subscribe(listener: MeshListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Forgets every peer and every seen-packet id. Called by panic wipe — data
   * still on screen after a wipe would be the most visible possible failure.
   */
  reset(): void {
    this.relay.reset();
    this.peers.clear();
    this.counters = {
      sent: 0,
      received: 0,
      relayed: 0,
      dropped: {malformed: 0, bad_signature: 0, own: 0, duplicate: 0},
    };
    this.emitPeers();
  }

  // -------------------------------------------------------------- sending

  async sendText(text: string): Promise<MeshPacket> {
    return this.broadcast(buildTextPacket(text, this.packetParams()));
  }

  async sendSos(fix: {
    lat: number;
    lng: number;
    accuracy: number;
    stale: boolean;
  }): Promise<MeshPacket> {
    return this.broadcast(buildSosPacket(fix, this.packetParams()));
  }

  async sendDanger(report: {
    lat: number;
    lng: number;
    kind: DangerKind;
    note?: string;
  }): Promise<MeshPacket> {
    return this.broadcast(buildDangerPacket(report, this.packetParams()));
  }

  async sendSafe(
    fix: {lat: number; lng: number} | null,
  ): Promise<MeshPacket> {
    return this.broadcast(buildSafePacket(fix, this.packetParams()));
  }

  private packetParams() {
    return {
      senderId: this.identity.senderId,
      id: newPacketId(this.randomBytes),
      sign: (canonical: string) => this.identity.sign(canonical),
      ttl: this.config.meshMaxTtl,
      timestamp: this.now(),
    };
  }

  private async broadcast(packet: MeshPacket): Promise<MeshPacket> {
    await this.transport.send(encodePacket(packet));
    this.counters.sent += 1;
    return packet;
  }

  // ------------------------------------------------------------- receiving

  private handleMessage(message: TransportMessage): void {
    let packet: MeshPacket;
    try {
      packet = decodePacket(message.data);
    } catch (err) {
      this.drop(
        'malformed',
        err instanceof InvalidPacketError ? err.message : String(err),
      );
      return;
    }

    // Our own packet, echoed back by a relay. Not an error — it is proof the
    // mesh is working — but there is nothing to show or pass on.
    if (packet.senderId === this.identity.senderId) {
      this.drop('own', packet.id);
      return;
    }

    // Verify BEFORE the de-duplication check, deliberately. The relay marks
    // every id it sees as seen; if forged packets got that far, an attacker
    // could burn the ids of real messages and have them silently discarded as
    // duplicates when they arrived.
    let senderKey: Uint8Array;
    try {
      senderKey = decodeBase64(packet.senderId);
    } catch {
      this.drop('malformed', 'senderId is not valid base64');
      return;
    }
    if (senderKey.length !== 32) {
      this.drop('malformed', `senderId is ${senderKey.length} bytes, not 32`);
      return;
    }

    const {signature, ...unsigned} = packet;
    if (!verify(canonicalize(unsigned), signature, senderKey)) {
      this.drop('bad_signature', packet.id);
      return;
    }

    // Clamp the hop budget to our own configured maximum. ttl is not covered
    // by the signature (it cannot be — every relay changes it), so a hostile
    // node can inflate it to keep a packet bouncing far longer than its sender
    // intended. Clamping on receive bounds that to this device's own policy.
    const clamped: MeshPacket =
      packet.ttl > this.config.meshMaxTtl
        ? {...packet, ttl: this.config.meshMaxTtl}
        : packet;

    const receivedAt = this.now();
    const hopCount = Math.max(0, this.config.meshMaxTtl - clamped.ttl);
    const decision = this.relay.handleIncoming(clamped, receivedAt);

    // Peer bookkeeping happens even for duplicates, and before the early
    // return. A second copy of a packet arriving by a shorter route is not
    // redundant — it is the only evidence that the sender has come closer.
    // Skipping it would mean a peer could never be seen to move back into
    // direct range once we had already heard them via a relay.
    this.touchPeer(packet.senderId, message.rssi, hopCount, receivedAt, {
      isDuplicate: !decision.shouldDisplay,
    });

    if (!decision.shouldDisplay) {
      this.drop('duplicate', packet.id);
      return;
    }

    this.counters.received += 1;

    this.emit(l =>
      l.onPacket?.({
        packet: clamped,
        hopCount,
        rssi: message.rssi,
        receivedAt,
      }),
    );

    if (decision.shouldRebroadcast && decision.packetToSend) {
      this.counters.relayed += 1;
      // Fire and forget. A failed rebroadcast must not stop the packet being
      // shown to this user, who may be the person it was meant for.
      void this.transport.send(encodePacket(decision.packetToSend)).catch(() => {
        this.counters.relayed -= 1;
      });
    }
  }

  private drop(reason: DropReason, detail: string): void {
    this.counters.dropped[reason] += 1;
    this.emit(l => l.onDropped?.(reason, detail));
  }

  // ------------------------------------------------------------------ peers

  private touchPeer(
    senderId: string,
    rssi: number | null,
    hopCount: number,
    at: number,
    options: {isDuplicate: boolean},
  ): void {
    const existing = this.peers.get(senderId);
    this.peers.set(senderId, {
      senderId,
      // Link facts — true of any verified copy, however many we have seen.
      lastSeenAt: at,
      lastRssi: rssi,
      minHopCount: Math.min(existing?.minHopCount ?? Infinity, hopCount),
      // Message count, so it stays a count of distinct things this peer said
      // rather than of how noisy the rebroadcast storm was.
      packetsHeard:
        (existing?.packetsHeard ?? 0) + (options.isDuplicate ? 0 : 1),
    });
    this.emitPeers();
  }

  /**
   * Peers heard from recently enough to still count as nearby.
   *
   * This is the honest number behind the dashboard's device count. CONTEXT.md
   * is explicit that the mockup's "47 DEVICES" is a placeholder and not a
   * target — if two phones are in range, this returns 2, and the dashboard
   * says 2.
   */
  activePeers(at: number = this.now()): PeerInfo[] {
    const cutoff = at - this.config.peerTimeoutMs;
    const active: PeerInfo[] = [];
    for (const [senderId, peer] of this.peers) {
      if (peer.lastSeenAt < cutoff) {
        this.peers.delete(senderId);
        continue;
      }
      active.push(peer);
    }
    return active.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  get stats(): MeshCounters {
    return {...this.counters, dropped: {...this.counters.dropped}};
  }

  get status(): TransportStatus {
    return this.transport.status;
  }

  /**
   * The active transport, for the diagnostics overlay only. Feature code must
   * go through this service — reaching past it would put transport-specific
   * knowledge back into the UI, which is the coupling the interface exists to
   * prevent.
   */
  get activeTransport(): MeshTransport {
    return this.transport;
  }

  private emitPeers(): void {
    const peers = this.activePeers();
    this.emit(l => l.onPeersChanged?.(peers));
  }

  private emit(fn: (listener: MeshListener) => void): void {
    for (const listener of [...this.listeners]) {
      try {
        fn(listener);
      } catch {
        // One misbehaving screen must not stop packets reaching the others.
      }
    }
  }
}
