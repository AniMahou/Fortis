import {
  CHUNK_HEADER_BYTES,
  ChunkingError,
  Reassembler,
  chunk,
  createMsgIdGenerator,
} from '../chunking';

const bytes = (length: number, seed = 0) =>
  new Uint8Array(length).map((_, i) => (i * 31 + seed) & 0xff);

/** The realistic legacy-BLE frame size: 31 - flags - mfg header - magic. */
const LEGACY_FRAME = 23;

describe('chunk', () => {
  it('fits a payload into a single frame when there is room', () => {
    const frames = chunk(bytes(10), LEGACY_FRAME, 7);
    expect(frames).toHaveLength(1);
    expect(frames[0]![0]).toBe(7); // msgId
    expect(frames[0]![1]).toBe(0); // seq
    expect(frames[0]![2]).toBe(1); // total
  });

  it('splits a realistic 113-byte packet across legacy frames', () => {
    // The minimum signed VOX packet. 20 data bytes per frame at this size.
    const frames = chunk(bytes(113), LEGACY_FRAME, 0);
    expect(frames).toHaveLength(6);
    expect(frames.every(f => f.length <= LEGACY_FRAME)).toBe(true);
  });

  it('never exceeds maxFrameBytes', () => {
    for (const size of [24, 31, 64, 251]) {
      const frames = chunk(bytes(500), size, 1);
      expect(frames.every(f => f.length <= size)).toBe(true);
    }
  });

  it('stamps every frame with the same msgId and total', () => {
    const frames = chunk(bytes(200), LEGACY_FRAME, 42);
    expect(frames.every(f => f[0] === 42)).toBe(true);
    expect(frames.every(f => f[2] === frames.length)).toBe(true);
    expect(frames.map(f => f[1])).toEqual(frames.map((_, i) => i));
  });

  it('leaves the last frame short rather than padding it', () => {
    // Padding would mean the receiver could not tell payload from filler
    // without a length field costing a byte in every frame.
    const frames = chunk(bytes(21), LEGACY_FRAME, 0);
    expect(frames).toHaveLength(2);
    expect(frames[1]!.length).toBe(CHUNK_HEADER_BYTES + 1);
  });

  it('rejects a frame size that cannot hold the header', () => {
    expect(() => chunk(bytes(10), CHUNK_HEADER_BYTES, 0)).toThrow(ChunkingError);
    expect(() => chunk(bytes(10), 0, 0)).toThrow(ChunkingError);
  });

  it('rejects an empty payload', () => {
    expect(() => chunk(new Uint8Array(0), LEGACY_FRAME, 0)).toThrow(
      ChunkingError,
    );
  });

  it('rejects a msgId that does not fit in a byte', () => {
    expect(() => chunk(bytes(10), LEGACY_FRAME, 256)).toThrow(ChunkingError);
    expect(() => chunk(bytes(10), LEGACY_FRAME, -1)).toThrow(ChunkingError);
  });

  it('rejects a payload needing more than 255 frames', () => {
    // `total` is one byte. Failing loudly here beats silently truncating a
    // message on the air.
    expect(() => chunk(bytes(20_000), LEGACY_FRAME, 0)).toThrow(
      /over the 255-frame limit/,
    );
  });
});

describe('Reassembler', () => {
  it('rebuilds a message from its frames', () => {
    const original = bytes(113);
    const reassembler = new Reassembler();
    const frames = chunk(original, LEGACY_FRAME, 3);

    let result: Uint8Array | null = null;
    for (const frame of frames) {
      result = reassembler.accept(frame, 1000);
    }

    expect(result).not.toBeNull();
    expect(Array.from(result!)).toEqual(Array.from(original));
  });

  it('returns null until the final frame arrives', () => {
    const reassembler = new Reassembler();
    const frames = chunk(bytes(113), LEGACY_FRAME, 0);

    for (const frame of frames.slice(0, -1)) {
      expect(reassembler.accept(frame, 1000)).toBeNull();
    }
    expect(reassembler.accept(frames.at(-1)!, 1000)).not.toBeNull();
  });

  it('rebuilds correctly when frames arrive out of order', () => {
    // Normal on a mesh: frames from one sender interleave with everything
    // else in range and are not delivered in order.
    const original = bytes(113, 9);
    const reassembler = new Reassembler();
    const frames = chunk(original, LEGACY_FRAME, 0);
    const shuffled = [...frames].reverse();

    let result: Uint8Array | null = null;
    for (const frame of shuffled) {
      result = reassembler.accept(frame, 1000) ?? result;
    }

    expect(Array.from(result!)).toEqual(Array.from(original));
  });

  it('ignores repeated frames, which BLE produces constantly', () => {
    // The single most important property here. A BLE advertiser rebroadcasts
    // the same bytes many times a second; every frame is seen dozens of times.
    const original = bytes(113);
    const reassembler = new Reassembler();
    const frames = chunk(original, LEGACY_FRAME, 0);

    let completions = 0;
    for (let repeat = 0; repeat < 20; repeat++) {
      for (const frame of frames) {
        if (reassembler.accept(frame, 1000)) completions++;
      }
    }

    // Exactly one completion, not twenty.
    expect(completions).toBe(1);
    expect(reassembler.pendingCount).toBe(0);
  });

  it('handles two senders interleaved', () => {
    const a = bytes(80, 1);
    const b = bytes(90, 2);
    const reassembler = new Reassembler();
    const framesA = chunk(a, LEGACY_FRAME, 10);
    const framesB = chunk(b, LEGACY_FRAME, 20);

    const results: Uint8Array[] = [];
    const maxLength = Math.max(framesA.length, framesB.length);
    for (let i = 0; i < maxLength; i++) {
      if (framesA[i]) {
        const out = reassembler.accept(framesA[i]!, 1000);
        if (out) results.push(out);
      }
      if (framesB[i]) {
        const out = reassembler.accept(framesB[i]!, 1000);
        if (out) results.push(out);
      }
    }

    expect(results).toHaveLength(2);
    const recovered = results.map(r => Array.from(r));
    expect(recovered).toContainEqual(Array.from(a));
    expect(recovered).toContainEqual(Array.from(b));
  });

  it('does not let two senders on the same msgId suppress each other', () => {
    // Why delivery suppression is keyed on content rather than msgId. The id
    // is 8 bits and every sender has its own counter, so two nodes in range
    // land on the same number routinely. Suppressing by id would silently
    // drop a stranger's message because someone else got there first.
    const a = bytes(60, 1);
    const b = bytes(60, 2);
    const reassembler = new Reassembler();

    const delivered: Uint8Array[] = [];
    for (const frame of chunk(a, LEGACY_FRAME, 5)) {
      const out = reassembler.accept(frame, 1000);
      if (out) delivered.push(out);
    }
    for (const frame of chunk(b, LEGACY_FRAME, 5)) {
      const out = reassembler.accept(frame, 1500);
      if (out) delivered.push(out);
    }

    expect(delivered).toHaveLength(2);
    expect(Array.from(delivered[0]!)).toEqual(Array.from(a));
    expect(Array.from(delivered[1]!)).toEqual(Array.from(b));
  });

  it('re-delivers the same content once the suppression window passes', () => {
    // A genuinely re-sent message much later is new information, not a repeat.
    const original = bytes(60);
    const reassembler = new Reassembler({ttlMs: 5000});
    const frames = chunk(original, LEGACY_FRAME, 0);

    const first = frames.map(f => reassembler.accept(f, 1000)).filter(Boolean);
    const tooSoon = frames.map(f => reassembler.accept(f, 3000)).filter(Boolean);
    const later = frames.map(f => reassembler.accept(f, 60_000)).filter(Boolean);

    expect(first).toHaveLength(1);
    expect(tooSoon).toHaveLength(0);
    expect(later).toHaveLength(1);
  });

  it('discards a partial message once its TTL expires', () => {
    // A sender walking out of range mid-message never finishes. Without this
    // the fragments live for as long as the app does.
    const reassembler = new Reassembler({ttlMs: 5000});
    const frames = chunk(bytes(113), LEGACY_FRAME, 0);

    reassembler.accept(frames[0]!, 1000);
    expect(reassembler.pendingCount).toBe(1);

    reassembler.accept(frames[1]!, 20_000);

    // The stale partial was pruned; frame 1 then started a fresh one, which
    // can never complete because frame 0 is gone.
    expect(reassembler.pendingCount).toBe(1);
    let completed: Uint8Array | null = null;
    for (const frame of frames.slice(2)) {
      completed = reassembler.accept(frame, 20_000) ?? completed;
    }
    expect(completed).toBeNull();
  });

  it('bounds memory in a dense crowd', () => {
    // The scenario CONTEXT.md risk #3 describes: many nodes in range at once.
    // An unbounded partials map is a crash waiting to happen.
    const reassembler = new Reassembler({maxPartials: 8});
    for (let msgId = 0; msgId < 50; msgId++) {
      const frames = chunk(bytes(113), LEGACY_FRAME, msgId);
      reassembler.accept(frames[0]!, 1000 + msgId);
    }
    expect(reassembler.pendingCount).toBeLessThanOrEqual(8);
  });

  it('restarts cleanly when an 8-bit msgId wraps onto a new message', () => {
    const reassembler = new Reassembler();
    const first = chunk(bytes(113, 1), LEGACY_FRAME, 5);
    const second = chunk(bytes(40, 2), LEGACY_FRAME, 5); // same id, fewer frames

    reassembler.accept(first[0]!, 1000);
    let result: Uint8Array | null = null;
    for (const frame of second) {
      result = reassembler.accept(frame, 1000) ?? result;
    }

    // The second message completes rather than being corrupted by the
    // leftover frame from the first.
    expect(Array.from(result!)).toEqual(Array.from(bytes(40, 2)));
  });

  it('rejects malformed frames without throwing', () => {
    // These arrive from strangers' phones. A crash in the relay loop is not
    // an acceptable response to a bad frame.
    const reassembler = new Reassembler();
    expect(reassembler.accept(new Uint8Array(0), 1000)).toBeNull();
    expect(reassembler.accept(new Uint8Array([1, 2]), 1000)).toBeNull();
    // total = 0
    expect(reassembler.accept(new Uint8Array([1, 0, 0, 9]), 1000)).toBeNull();
    // seq beyond total
    expect(reassembler.accept(new Uint8Array([1, 5, 2, 9]), 1000)).toBeNull();
    expect(reassembler.pendingCount).toBe(0);
  });

  it('drops everything on reset, for panic wipe', () => {
    const reassembler = new Reassembler();
    const frames = chunk(bytes(113), LEGACY_FRAME, 0);
    reassembler.accept(frames[0]!, 1000);

    reassembler.reset();

    expect(reassembler.pendingCount).toBe(0);
  });

  it.each([1, 20, 113, 500, 4096])(
    'round-trips a %i-byte payload',
    length => {
      const original = bytes(length, length);
      const reassembler = new Reassembler();
      let result: Uint8Array | null = null;
      for (const frame of chunk(original, LEGACY_FRAME, 0)) {
        result = reassembler.accept(frame, 1000) ?? result;
      }
      expect(Array.from(result!)).toEqual(Array.from(original));
    },
  );

  it('round-trips at the extended-advertising frame size too', () => {
    // On BLE 5 hardware a whole packet fits in one frame, which must not be a
    // special case that skips reassembly.
    const original = bytes(200);
    const reassembler = new Reassembler();
    const frames = chunk(original, 251, 0);
    expect(frames).toHaveLength(1);
    expect(Array.from(reassembler.accept(frames[0]!, 1000)!)).toEqual(
      Array.from(original),
    );
  });
});

describe('createMsgIdGenerator', () => {
  it('increments so back-to-back messages never collide', () => {
    const next = createMsgIdGenerator(0);
    expect([next(), next(), next()]).toEqual([0, 1, 2]);
  });

  it('wraps at 255 rather than overflowing the byte', () => {
    const next = createMsgIdGenerator(254);
    expect([next(), next(), next()]).toEqual([254, 255, 0]);
  });
});
