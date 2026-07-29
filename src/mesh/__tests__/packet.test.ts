import {
  createPacket,
  canonicalize,
  decrementTtl,
  isExpired,
  serializePacket,
  deserializePacket,
  InvalidPacketError,
  MAX_TTL,
} from '../packet';

const fakeSign = (data: string) => `SIG(${data.length})`;

describe('createPacket', () => {
  it('defaults ttl to MAX_TTL when not provided', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 'sender-1',
      payload: { message: 'hello' },
      sign: fakeSign,
      id: 'pkt-1',
    });
    expect(packet.ttl).toBe(MAX_TTL);
  });

  it('uses the provided ttl and timestamp when given', () => {
    const packet = createPacket({
      type: 'sos',
      senderId: 'sender-1',
      payload: {},
      sign: fakeSign,
      id: 'pkt-2',
      ttl: 2,
      timestamp: 1000,
    });
    expect(packet.ttl).toBe(2);
    expect(packet.timestamp).toBe(1000);
  });

  it('signs the canonical form, not the raw payload object', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 'sender-1',
      payload: { message: 'hi' },
      sign: fakeSign,
      id: 'pkt-3',
      timestamp: 5000,
    });
    const expectedCanonical = canonicalize({
      id: 'pkt-3',
      type: 'text',
      senderId: 'sender-1',
      ttl: MAX_TTL,
      timestamp: 5000,
      payload: { message: 'hi' },
    });
    expect(packet.signature).toBe(fakeSign(expectedCanonical));
  });
});

describe('canonicalize', () => {
  it('produces identical output regardless of payload key order', () => {
    const a = canonicalize({
      id: 'x',
      type: 'danger',
      senderId: 's',
      ttl: 3,
      timestamp: 1,
      payload: { lat: 1, lng: 2, kind: 'tear_gas' },
    });
    const b = canonicalize({
      id: 'x',
      type: 'danger',
      senderId: 's',
      ttl: 3,
      timestamp: 1,
      payload: { kind: 'tear_gas', lng: 2, lat: 1 },
    });
    expect(a).toBe(b);
  });

  it('produces different output when any field differs', () => {
    const base = {
      id: 'x',
      type: 'text' as const,
      senderId: 's',
      ttl: 3,
      timestamp: 1,
      payload: { message: 'a' },
    };
    const changed = canonicalize({ ...base, payload: { message: 'b' } });
    const original = canonicalize(base);
    expect(changed).not.toBe(original);
  });

  it('ignores ttl, because every relay mutates it', () => {
    // Without this, a packet verifies at its origin and fails everywhere
    // after the first hop — see the regression test in relay.test.ts.
    const base = {
      id: 'x',
      type: 'text' as const,
      senderId: 's',
      ttl: 5,
      timestamp: 1,
      payload: { message: 'a' },
    };
    expect(canonicalize({ ...base, ttl: 1 })).toBe(canonicalize(base));
  });

  it('still distinguishes every immutable field', () => {
    const base = {
      id: 'x',
      type: 'text' as const,
      senderId: 's',
      ttl: 3,
      timestamp: 1,
      payload: { message: 'a' },
    };
    const original = canonicalize(base);
    expect(canonicalize({ ...base, id: 'y' })).not.toBe(original);
    expect(canonicalize({ ...base, senderId: 't' })).not.toBe(original);
    expect(canonicalize({ ...base, timestamp: 2 })).not.toBe(original);
    expect(canonicalize({ ...base, type: 'sos' })).not.toBe(original);
  });
});

describe('decrementTtl / isExpired', () => {
  it('decrements ttl by exactly 1 and leaves other fields untouched', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 's',
      payload: {},
      sign: fakeSign,
      id: 'pkt-4',
      ttl: 3,
    });
    const next = decrementTtl(packet);
    expect(next.ttl).toBe(2);
    expect(next.id).toBe(packet.id);
    expect(next.signature).toBe(packet.signature);
  });

  it('reports expired once ttl reaches 0', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 's',
      payload: {},
      sign: fakeSign,
      id: 'pkt-5',
      ttl: 1,
    });
    const next = decrementTtl(packet);
    expect(isExpired(next)).toBe(true);
  });

  it('is not expired while ttl is still positive', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 's',
      payload: {},
      sign: fakeSign,
      id: 'pkt-6',
      ttl: 2,
    });
    expect(isExpired(packet)).toBe(false);
  });
});

describe('serializePacket / deserializePacket round-trip', () => {
  it('reproduces an identical packet after serialize -> deserialize', () => {
    const packet = createPacket({
      type: 'sos',
      senderId: 'sender-9',
      payload: { lat: 23.73, lng: 90.39 },
      sign: fakeSign,
      id: 'pkt-7',
      timestamp: 12345,
    });
    const roundTripped = deserializePacket(serializePacket(packet));
    expect(roundTripped).toEqual(packet);
  });

  it('rejects invalid JSON', () => {
    expect(() => deserializePacket('not json{{')).toThrow(InvalidPacketError);
  });

  it('rejects a packet missing a required field', () => {
    const broken = JSON.stringify({ id: 'x', type: 'text', senderId: 's' });
    expect(() => deserializePacket(broken)).toThrow(InvalidPacketError);
  });

  it('rejects an unknown packet type', () => {
    const packet = createPacket({
      type: 'text',
      senderId: 's',
      payload: {},
      sign: fakeSign,
      id: 'pkt-8',
    });
    const tampered = { ...packet, type: 'not_a_real_type' };
    expect(() => deserializePacket(JSON.stringify(tampered))).toThrow(
      InvalidPacketError
    );
  });
});
