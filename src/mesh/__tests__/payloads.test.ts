import nacl from 'tweetnacl';
import {encodeBase64} from 'tweetnacl-util';
import {sign, verify} from '../../crypto/sign';
import {MAX_TTL, canonicalize} from '../packet';
import {
  MAX_NOTE_BYTES,
  MAX_TEXT_BYTES,
  PayloadError,
  buildDangerPacket,
  buildSafePacket,
  buildSosPacket,
  buildTextPacket,
  quantiseCoord,
} from '../payloads';
import {decodePacket, encodePacket} from '../wire';

const keyPair = nacl.sign.keyPair();
const params = {
  senderId: encodeBase64(keyPair.publicKey),
  id: '0011223344556677',
  sign: (canonical: string) => sign(canonical, keyPair.secretKey),
  timestamp: 1_722_268_800_000,
};

describe('quantiseCoord', () => {
  it('rounds to seven decimal places', () => {
    expect(quantiseCoord(23.81031234567)).toBe(23.8103123);
    expect(quantiseCoord(-90.41259999)).toBe(-90.4126);
  });

  it('is idempotent', () => {
    const once = quantiseCoord(23.81031234567);
    expect(quantiseCoord(once)).toBe(once);
  });

  it('rejects non-finite input rather than producing NaN on the wire', () => {
    expect(() => quantiseCoord(NaN)).toThrow(RangeError);
    expect(() => quantiseCoord(Infinity)).toThrow(RangeError);
  });
});

describe('quantisation happens before signing', () => {
  // The bug this prevents: sign 23.81031234567, transmit 23.8103123, and the
  // receiver re-derives a different canonical string and rejects a real SOS as
  // forged. Every builder must round first, so what is signed is exactly what
  // the wire can carry.
  it.each([
    ['SOS', () => buildSosPacket({lat: 23.81031234567, lng: 90.41259876543, accuracy: 12.7, stale: false}, params)],
    ['danger', () => buildDangerPacket({lat: 23.81031234567, lng: 90.41259876543, kind: 'tear_gas'}, params)],
    ['safe', () => buildSafePacket({lat: 23.81031234567, lng: 90.41259876543}, params)],
  ])('%s survives encode/decode and still verifies', (_label, buildPacket) => {
    const packet = buildPacket();
    const decoded = decodePacket(encodePacket(packet));

    expect(decoded).toEqual(packet);

    const {signature, ...unsigned} = decoded;
    expect(verify(canonicalize(unsigned), signature, keyPair.publicKey)).toBe(
      true,
    );
  });

  it('rounds accuracy to an integer, since sub-metre GPS precision is noise', () => {
    const packet = buildSosPacket(
      {lat: 23.7, lng: 90.4, accuracy: 12.7, stale: false},
      params,
    );
    expect(packet.payload.accuracy).toBe(13);
  });
});

describe('buildTextPacket', () => {
  it('trims surrounding whitespace', () => {
    expect(buildTextPacket('  hello  ', params).payload.text).toBe('hello');
  });

  it('refuses an empty or whitespace-only message', () => {
    expect(() => buildTextPacket('', params)).toThrow(PayloadError);
    expect(() => buildTextPacket('   ', params)).toThrow(PayloadError);
  });

  it('enforces the byte limit in bytes, not characters', () => {
    // Bangla is 3 bytes per character in UTF-8. A character-based limit would
    // let a "60 character" message become a 180-byte packet — nine extra BLE
    // frames of airtime.
    const bangla = 'ক'.repeat(61); // 183 bytes
    expect(() => buildTextPacket(bangla, params)).toThrow(/over the 180-byte/);
    expect(() => buildTextPacket('a'.repeat(MAX_TEXT_BYTES), params)).not.toThrow();
  });

  it('defaults to the standard TTL', () => {
    expect(buildTextPacket('hi', params).ttl).toBe(MAX_TTL);
  });
});

describe('buildDangerPacket', () => {
  it('omits an empty note rather than storing one', () => {
    // The canonical form and the wire encoding must agree on whether the field
    // exists at all — an empty string and an absent field are different JSON.
    const packet = buildDangerPacket(
      {lat: 23.7, lng: 90.4, kind: 'police', note: '   '},
      params,
    );
    expect('note' in packet.payload).toBe(false);
  });

  it('rejects an unknown danger kind', () => {
    expect(() =>
      buildDangerPacket(
        // @ts-expect-error deliberately invalid
        {lat: 23.7, lng: 90.4, kind: 'aliens'},
        params,
      ),
    ).toThrow(/unknown danger kind/);
  });

  it('enforces the note byte limit', () => {
    expect(() =>
      buildDangerPacket(
        {lat: 23.7, lng: 90.4, kind: 'fire', note: 'x'.repeat(MAX_NOTE_BYTES + 1)},
        params,
      ),
    ).toThrow(/over the 60-byte/);
  });
});

describe('coordinate validation', () => {
  it.each([
    ['latitude above 90', 91, 0],
    ['latitude below -90', -91, 0],
    ['longitude above 180', 0, 181],
    ['longitude below -180', 0, -181],
    ['NaN latitude', NaN, 0],
  ])('rejects %s', (_label, lat, lng) => {
    expect(() =>
      buildSosPacket({lat, lng, accuracy: 5, stale: false}, params),
    ).toThrow(PayloadError);
  });

  it('accepts the exact boundaries', () => {
    expect(() =>
      buildDangerPacket({lat: 90, lng: 180, kind: 'medical'}, params),
    ).not.toThrow();
    expect(() =>
      buildDangerPacket({lat: -90, lng: -180, kind: 'medical'}, params),
    ).not.toThrow();
  });
});

describe('buildSafePacket', () => {
  it('allows an "I am safe" signal with no location attached', () => {
    // Telling people you are alive should not require telling them where you
    // are — those are different disclosures.
    const packet = buildSafePacket(null, params);
    expect(packet.payload).toEqual({});
    expect(decodePacket(encodePacket(packet))).toEqual(packet);
  });
});
