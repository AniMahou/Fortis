/**
 * Splitting mesh packets across BLE advertisement frames, and putting them
 * back together.
 *
 * This is CONTEXT.md risk #2 made concrete. A legacy BLE advertisement is 31
 * bytes total; after the mandatory flags structure and the manufacturer-data
 * header, about 23 are usable. A signed VOX packet is at least 113 bytes. So
 * on any device without BLE 5 extended advertising, a packet has to travel as
 * a handful of frames and be reassembled on the far side.
 *
 * The property that shapes this module: **BLE advertising repeats.** A phone
 * does not "send" a frame once — it broadcasts the same bytes continuously,
 * many times a second, until the data is changed. The receiver therefore sees
 * every frame tens of times, out of order relative to other senders, and
 * interleaved with frames from every other node in range.
 *
 * So `Reassembler.accept` is idempotent, order-independent, and bounded. Those
 * are not defensive extras; they are the normal case.
 *
 * No React Native imports, so all of it is tested on a laptop.
 */

/** msgId (1) + seq (1) + total (1). */
export const CHUNK_HEADER_BYTES = 3;

/** `total` is one byte, so a message cannot exceed 255 frames. */
export const MAX_FRAMES = 255;

export class ChunkingError extends Error {}

/**
 * Splits `data` into frames that each fit in `maxFrameBytes`.
 *
 * `msgId` groups the frames. It is only 8 bits, so two messages in flight at
 * the same moment can collide — that is deliberate, because the alternative
 * costs a byte per frame and the failure is already caught downstream: a
 * mis-reassembled packet fails signature verification and is dropped. Spending
 * 5% of the payload budget to detect what a signature check catches for free
 * would be the wrong trade.
 */
export function chunk(
  data: Uint8Array,
  maxFrameBytes: number,
  msgId: number,
): Uint8Array[] {
  if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= CHUNK_HEADER_BYTES) {
    throw new ChunkingError(
      `maxFrameBytes must exceed the ${CHUNK_HEADER_BYTES}-byte header, got ${maxFrameBytes}`,
    );
  }
  if (data.length === 0) {
    throw new ChunkingError('refusing to chunk an empty payload');
  }
  if (!Number.isInteger(msgId) || msgId < 0 || msgId > 255) {
    throw new ChunkingError(`msgId must be 0..255, got ${msgId}`);
  }

  const dataPerFrame = maxFrameBytes - CHUNK_HEADER_BYTES;
  const total = Math.ceil(data.length / dataPerFrame);

  if (total > MAX_FRAMES) {
    throw new ChunkingError(
      `payload of ${data.length} bytes needs ${total} frames, over the ${MAX_FRAMES}-frame limit`,
    );
  }

  const frames: Uint8Array[] = [];
  for (let seq = 0; seq < total; seq++) {
    const slice = data.subarray(seq * dataPerFrame, (seq + 1) * dataPerFrame);
    const frame = new Uint8Array(CHUNK_HEADER_BYTES + slice.length);
    frame[0] = msgId;
    frame[1] = seq;
    frame[2] = total;
    frame.set(slice, CHUNK_HEADER_BYTES);
    frames.push(frame);
  }
  return frames;
}

interface Partial {
  total: number;
  received: Map<number, Uint8Array>;
  firstSeenAt: number;
}

export interface ReassemblerOptions {
  /**
   * How long to hold an incomplete message before discarding it. A sender that
   * walks out of range mid-message never finishes, and without this the
   * fragments accumulate for as long as the app is open.
   */
  ttlMs?: number;
  /**
   * Hard cap on concurrent partial messages. In a dense crowd — the scenario
   * this app is for — a phone can hear from a great many nodes at once, and an
   * unbounded map is a memory leak with a crash at the end of it.
   */
  maxPartials?: number;
}

export class Reassembler {
  private readonly partials = new Map<number, Partial>();
  /**
   * Content hashes of messages already delivered, so the continuous BLE
   * rebroadcast of a packet is emitted once rather than several times a
   * second.
   *
   * Keyed by content rather than by msgId, which matters: msgId is 8 bits and
   * every sender has its own counter, so two nodes in range will reuse the
   * same id routinely. Suppressing by id would silently drop a stranger's
   * message because someone else happened to be on the same number. Hashing
   * the reassembled bytes suppresses exactly the repeats and nothing else.
   */
  private readonly delivered = new Map<number, number>();
  private readonly ttlMs: number;
  private readonly maxPartials: number;

  constructor(options: ReassemblerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.maxPartials = options.maxPartials ?? 64;
  }

  /**
   * Feeds one received frame in. Returns the complete message when this frame
   * finished one, otherwise null.
   *
   * `now` is injectable so tests do not depend on wall-clock time — the same
   * convention `relay.ts` uses.
   */
  accept(frame: Uint8Array, now: number = Date.now()): Uint8Array | null {
    if (frame.length <= CHUNK_HEADER_BYTES) return null;

    const msgId = frame[0]!;
    const seq = frame[1]!;
    const total = frame[2]!;

    if (total === 0 || seq >= total) return null;

    this.prune(now);

    let partial = this.partials.get(msgId);

    // A different `total` under the same id means the 8-bit id has wrapped
    // onto a new message. Start over rather than blending two messages into
    // one — which would produce a packet that fails verification anyway, but
    // fails it slowly and confusingly.
    if (partial && partial.total !== total) {
      partial = undefined;
      this.partials.delete(msgId);
    }

    if (!partial) {
      if (this.partials.size >= this.maxPartials) {
        this.evictOldest();
      }
      partial = {total, received: new Map(), firstSeenAt: now};
      this.partials.set(msgId, partial);
    }

    // Re-seeing a frame is the normal case, not an error: BLE rebroadcasts the
    // same advertisement continuously. Ignore it and move on.
    if (partial.received.has(seq)) return null;

    partial.received.set(seq, frame.slice(CHUNK_HEADER_BYTES));

    if (partial.received.size !== total) return null;

    this.partials.delete(msgId);
    const message = concatenate(partial, total);

    const hash = fnv1a(message);
    if (this.delivered.has(hash)) return null;
    this.delivered.set(hash, now);
    return message;
  }

  /** Used by panic wipe: drop every half-received message. */
  reset(): void {
    this.partials.clear();
    this.delivered.clear();
  }

  /** Exposed for tests and the debug overlay. */
  get pendingCount(): number {
    return this.partials.size;
  }

  private prune(now: number): void {
    for (const [msgId, partial] of this.partials) {
      if (now - partial.firstSeenAt > this.ttlMs) {
        this.partials.delete(msgId);
      }
    }
    for (const [hash, at] of this.delivered) {
      if (now - at > this.ttlMs) {
        this.delivered.delete(hash);
      }
    }
  }

  private evictOldest(): void {
    let oldestId: number | undefined;
    let oldestAt = Infinity;
    for (const [msgId, partial] of this.partials) {
      if (partial.firstSeenAt < oldestAt) {
        oldestAt = partial.firstSeenAt;
        oldestId = msgId;
      }
    }
    if (oldestId !== undefined) this.partials.delete(oldestId);
  }
}

/**
 * FNV-1a, 32-bit. Not a cryptographic hash and not used as one — this only
 * needs to tell "same bytes as a moment ago" from "different bytes" cheaply.
 * Packet integrity is established by the Ed25519 signature, further up.
 */
function fnv1a(data: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function concatenate(partial: Partial, total: number): Uint8Array {
  let length = 0;
  for (let seq = 0; seq < total; seq++) {
    length += partial.received.get(seq)!.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (let seq = 0; seq < total; seq++) {
    const piece = partial.received.get(seq)!;
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/**
 * Rolling 8-bit message id generator.
 *
 * Sequential rather than random on purpose: consecutive ids guarantee that two
 * messages sent back to back never collide, which is the case that actually
 * happens (a user sending two messages quickly), whereas random ids have a
 * birthday collision at around 20 in-flight messages.
 */
export function createMsgIdGenerator(start = 0): () => number {
  let next = start & 0xff;
  return () => {
    const value = next;
    next = (next + 1) & 0xff;
    return value;
  };
}
