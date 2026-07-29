import nacl from 'tweetnacl';
import {encodeBase64} from 'tweetnacl-util';
import type {ReceivedPacket} from '../../mesh/meshService';
import {sign} from '../../crypto/sign';
import {
  buildDangerPacket,
  buildSosPacket,
  buildTextPacket,
} from '../../mesh/payloads';
import {
  DANGER_PIN_TTL_MS,
  MAX_MESSAGES,
  activeDangerPins,
  appendBounded,
  dangerPinFromPacket,
  formatHopCount,
  mergeDangerPins,
  messageFromOwnPacket,
  messageFromPacket,
  sosFromPacket,
  type DangerPin,
} from '../meshModel';

const keyPair = nacl.sign.keyPair();
const senderId = encodeBase64(keyPair.publicKey);

const params = (id: string, timestamp = 1_722_268_800_000) => ({
  senderId,
  id,
  sign: (canonical: string) => sign(canonical, keyPair.secretKey),
  timestamp,
});

const received = (
  packet: ReturnType<typeof buildTextPacket>,
  hopCount = 0,
  rssi: number | null = -60,
): ReceivedPacket => ({
  packet,
  hopCount,
  rssi,
  receivedAt: packet.timestamp,
});

describe('messageFromPacket', () => {
  it('maps a text packet to a message with its hop count', () => {
    const packet = buildTextPacket('Gate 3 is clear', params('aaaaaaaaaaaaaaaa'));

    const message = messageFromPacket(received(packet, 2))!;

    expect(message).toEqual({
      id: 'aaaaaaaaaaaaaaaa',
      senderId,
      text: 'Gate 3 is clear',
      sentAt: 1_722_268_800_000,
      hopCount: 2,
      mine: false,
      rssi: -60,
    });
  });

  it('ignores non-text packets', () => {
    const sos = buildSosPacket(
      {lat: 23.7, lng: 90.4, accuracy: 10, stale: false},
      params('bbbbbbbbbbbbbbbb'),
    );
    expect(messageFromPacket(received(sos))).toBeNull();
  });
});

describe('messageFromOwnPacket', () => {
  it('marks our own message as mine with no hop count', () => {
    // Our own message has not travelled anywhere yet, and showing "DIRECT" on
    // it would be a claim about a delivery nobody has confirmed.
    const packet = buildTextPacket('sending this', params('cccccccccccccccc'));

    const message = messageFromOwnPacket(packet)!;

    expect(message.mine).toBe(true);
    expect(message.hopCount).toBeNull();
  });
});

describe('dangerPinFromPacket', () => {
  it('maps a danger packet including its note', () => {
    const packet = buildDangerPacket(
      {lat: 23.7381, lng: 90.3956, kind: 'tear_gas', note: 'Shahbagh'},
      params('dddddddddddddddd'),
    );

    const pin = dangerPinFromPacket(received(packet, 1))!;

    expect(pin.kind).toBe('tear_gas');
    expect(pin.note).toBe('Shahbagh');
    expect(pin.lat).toBeCloseTo(23.7381, 6);
    expect(pin.hopCount).toBe(1);
  });

  it('uses null rather than undefined for a missing note', () => {
    const packet = buildDangerPacket(
      {lat: 23.7381, lng: 90.3956, kind: 'police'},
      params('eeeeeeeeeeeeeeee'),
    );
    expect(dangerPinFromPacket(received(packet))!.note).toBeNull();
  });
});

describe('sosFromPacket', () => {
  it('carries the stale flag through, so the UI can say so', () => {
    // Telling someone help is coming to a ten-minute-old position without
    // mentioning that is worse than saying the fix is stale.
    const packet = buildSosPacket(
      {lat: 23.8103, lng: 90.4125, accuracy: 45, stale: true},
      params('ffffffffffffffff'),
    );

    const sos = sosFromPacket(received(packet, 3))!;

    expect(sos.stale).toBe(true);
    expect(sos.accuracy).toBe(45);
    expect(sos.hopCount).toBe(3);
  });
});

describe('appendBounded', () => {
  it('appends in order', () => {
    const list = appendBounded([{id: 'a'}], {id: 'b'}, 10);
    expect(list.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('ignores a duplicate id', () => {
    // relay.ts already drops duplicate packets, but a message appearing twice
    // on screen makes a demo look broken even when the mesh is fine.
    const list = appendBounded([{id: 'a'}, {id: 'b'}], {id: 'a'}, 10);
    expect(list).toHaveLength(2);
  });

  it('drops the oldest past the cap', () => {
    let list: Array<{id: string}> = [];
    for (let i = 0; i < MAX_MESSAGES + 20; i++) {
      list = appendBounded(list, {id: `m${i}`}, MAX_MESSAGES);
    }
    expect(list).toHaveLength(MAX_MESSAGES);
    expect(list[0]!.id).toBe('m20');
    expect(list.at(-1)!.id).toBe(`m${MAX_MESSAGES + 19}`);
  });
});

describe('mergeDangerPins', () => {
  const pin = (
    id: string,
    reportedAt: number,
    overrides: Partial<DangerPin> = {},
  ): DangerPin => ({
    id,
    senderId,
    lat: 23.7381,
    lng: 90.3956,
    kind: 'tear_gas',
    note: null,
    reportedAt,
    hopCount: 0,
    mine: false,
    ...overrides,
  });

  it('adds a pin at a new location', () => {
    const pins = mergeDangerPins([], pin('a', 1000));
    expect(pins).toHaveLength(1);
  });

  it('replaces an older report of the same hazard at the same spot', () => {
    // Otherwise the map accumulates a smear of pins as people re-report the
    // same tear gas at the same junction.
    const pins = mergeDangerPins([pin('a', 1000)], pin('b', 2000));

    expect(pins).toHaveLength(1);
    expect(pins[0]!.id).toBe('b');
  });

  it('keeps the newer report when an older one arrives late', () => {
    // Relayed packets can arrive out of order.
    const pins = mergeDangerPins([pin('b', 2000)], pin('a', 1000));
    expect(pins[0]!.id).toBe('b');
  });

  it('keeps different hazards at the same spot separate', () => {
    // Tear gas and a medical need at the same junction are different facts.
    const pins = mergeDangerPins(
      [pin('a', 1000)],
      pin('b', 1000, {kind: 'medical'}),
    );
    expect(pins).toHaveLength(2);
  });

  it('keeps the same hazard at genuinely different places', () => {
    const pins = mergeDangerPins(
      [pin('a', 1000)],
      pin('b', 1000, {lat: 23.75, lng: 90.4}),
    );
    expect(pins).toHaveLength(2);
  });

  it('treats reports within ~11m as the same place', () => {
    // Two people standing at the same corner will not report identical
    // coordinates.
    const pins = mergeDangerPins(
      [pin('a', 1000)],
      pin('b', 2000, {lat: 23.73811, lng: 90.39561}),
    );
    expect(pins).toHaveLength(1);
    expect(pins[0]!.id).toBe('b');
  });
});

describe('activeDangerPins', () => {
  const at = (reportedAt: number): DangerPin => ({
    id: `p${reportedAt}`,
    senderId,
    lat: 23.7,
    lng: 90.4,
    kind: 'police',
    note: null,
    reportedAt,
    hopCount: 0,
    mine: false,
  });

  it('hides reports older than the TTL', () => {
    // A tear gas report from two hours ago is not information, it is clutter,
    // and showing it as current could send someone the wrong way.
    const now = 10_000_000;
    const pins = [at(now - 1000), at(now - DANGER_PIN_TTL_MS - 1)];

    expect(activeDangerPins(pins, now)).toHaveLength(1);
  });

  it('keeps a report right up to the TTL boundary', () => {
    const now = 10_000_000;
    expect(activeDangerPins([at(now - DANGER_PIN_TTL_MS + 1)], now)).toHaveLength(1);
  });
});

describe('formatHopCount', () => {
  // The single most load-bearing string in the demo. "2 HOPS" on a bubble is
  // the visible proof a message travelled through somebody else's phone, and a
  // relayed message rendering as "DIRECT" would be wrong in the most
  // convincing possible way.
  it.each([
    [0, 'DIRECT'],
    [1, '1 HOP'],
    [2, '2 HOPS'],
    [5, '5 HOPS'],
    [12, '12 HOPS'],
  ])('formats %i as "%s"', (hopCount, expected) => {
    expect(formatHopCount(hopCount)).toBe(expected);
  });

  it('never renders "1 HOPS"', () => {
    // Guards the singular branch. Small, but it undermines a screen whose
    // whole job is looking precise.
    expect(formatHopCount(1)).not.toBe('1 HOPS');
  });

  it('returns null for our own messages', () => {
    // A broadcast mesh has no delivery receipts, so a badge on an outgoing
    // message would claim something nobody confirmed.
    expect(formatHopCount(null)).toBeNull();
  });

  it('treats a nonsensical negative hop count as direct', () => {
    // Cannot happen through meshService, which clamps at zero — but a badge
    // reading "-1 HOPS" would be a memorable thing to have on screen.
    expect(formatHopCount(-3)).toBe('DIRECT');
  });
});
