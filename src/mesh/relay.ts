/**
 * Relay logic: given a packet a phone just heard over BLE, decide whether to
 * show it to the user and/or rebroadcast it so it keeps hopping across the
 * mesh. This is the module most likely to have a subtle bug that only shows
 * up live (infinite rebroadcast storms, duplicate messages on screen) — which
 * is exactly why it's isolated here with zero BLE/UI dependencies and fully
 * unit tested.
 */

import { MeshPacket, decrementTtl, isExpired } from './packet';

export interface RelayDecision {
  /** Show this packet to the local user (feed, SOS alert, map pin, etc.) */
  shouldDisplay: boolean;
  /** Rebroadcast this packet so it continues hopping across the mesh */
  shouldRebroadcast: boolean;
  /** The packet to actually send, if shouldRebroadcast is true (ttl already decremented) */
  packetToSend?: MeshPacket;
}

export class RelayState {
  /** packet id -> first-seen timestamp (ms) */
  private seen: Map<string, number> = new Map();

  /**
   * How long we remember an id before forgetting it. Forgetting matters:
   * without it, `seen` grows forever on a phone left running for hours in
   * a crowd. It's safe to forget after a while because a packet that's
   * still circulating that long is stale anyway.
   */
  constructor(private readonly seenTtlMs: number = 10 * 60 * 1000) {}

  private pruneExpired(now: number): void {
    for (const [id, seenAt] of this.seen) {
      if (now - seenAt > this.seenTtlMs) {
        this.seen.delete(id);
      }
    }
  }

  /**
   * Call this for every packet received over BLE, from any peer.
   * `now` is injectable purely so tests don't depend on wall-clock time.
   */
  handleIncoming(packet: MeshPacket, now: number = Date.now()): RelayDecision {
    this.pruneExpired(now);

    const alreadySeen = this.seen.has(packet.id);
    if (alreadySeen) {
      // Critical: never rebroadcast or re-display a duplicate. This is the
      // single check that prevents a rebroadcast storm across a crowded mesh.
      return { shouldDisplay: false, shouldRebroadcast: false };
    }

    this.seen.set(packet.id, now);

    const decremented = decrementTtl(packet);
    if (isExpired(decremented)) {
      // Still show it locally — the message reached this phone and its user
      // should see it — but it dies here and travels no further.
      return { shouldDisplay: true, shouldRebroadcast: false };
    }

    return {
      shouldDisplay: true,
      shouldRebroadcast: true,
      packetToSend: decremented,
    };
  }

  /** Used by panic wipe: forget everything this phone has relayed. */
  reset(): void {
    this.seen.clear();
  }

  /** Exposed for tests / debugging only. */
  get seenCount(): number {
    return this.seen.size;
  }
}
