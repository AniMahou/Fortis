import nacl from 'tweetnacl';
import {decodeUTF8, encodeBase64} from 'tweetnacl-util';
import {sign, verify} from '../../crypto/sign';
import {canonicalize, type MeshPacket} from '../packet';
import {
  buildDangerPacket,
  buildSafePacket,
  buildSosPacket,
  buildTextPacket,
} from '../payloads';
import {
  HEADER_BYTES,
  WIRE_VERSION,
  WireFormatError,
  decodePacket,
  encodePacket,
  newPacketId,
} from '../wire';

const keyPair = nacl.sign.keyPair();
const senderId = encodeBase64(keyPair.publicKey);
const signer = (canonical: string) => sign(canonical, keyPair.secretKey);

const params = (id = 'a1b2c3d4e5f60718') => ({
  senderId,
  id,
  sign: signer,
  timestamp: 1_722_268_800_000, // 2024-07-29, during the blackout
});

/** Encode, decode, and confirm nothing changed. */
function roundTrip(packet: MeshPacket): MeshPacket {
  return decodePacket(encodePacket(packet));
}

describe('round-tripping', () => {
  it('preserves a text packet exactly', () => {
    const packet = buildTextPacket('Medical camp at Gate 3', params());
    expect(roundTrip(packet)).toEqual(packet);
  });

  it('preserves an SOS packet exactly', () => {
    const packet = buildSosPacket(
      {lat: 23.7808, lng: 90.4142, accuracy: 12, stale: false},
      params(),
    );
    expect(roundTrip(packet)).toEqual(packet);
  });

  it('preserves a danger packet with a note', () => {
    const packet = buildDangerPacket(
      {lat: 23.7381, lng: 90.3956, kind: 'tear_gas', note: 'Shahbagh, avoid'},
      params(),
    );
    expect(roundTrip(packet)).toEqual(packet);
  });

  it('preserves a danger packet without a note', () => {
    const packet = buildDangerPacket(
      {lat: 23.7381, lng: 90.3956, kind: 'police'},
      params(),
    );
    const decoded = roundTrip(packet);
    expect(decoded).toEqual(packet);
    expect('note' in decoded.payload).toBe(false);
  });

  it('preserves a safe packet with and without coordinates', () => {
    const withCoords = buildSafePacket({lat: 23.7, lng: 90.4}, params());
    expect(roundTrip(withCoords)).toEqual(withCoords);

    const without = buildSafePacket(null, params());
    expect(roundTrip(without)).toEqual(without);
  });

  it('preserves Bangla text', () => {
    // The users this is for are writing in Bangla. Each character is 3 bytes
    // in UTF-8, so a codec that counted characters would corrupt this.
    const packet = buildTextPacket('গেট ৩-এ চিকিৎসা শিবির', params());
    expect(roundTrip(packet)).toEqual(packet);
  });

  it('preserves emoji, which are outside the basic plane', () => {
    const packet = buildTextPacket('🚨 tear gas 🚨', params());
    expect(roundTrip(packet)).toEqual(packet);
  });

  it.each([
    ['southern and western hemispheres', -33.8688, -151.2093],
    ['the equator and prime meridian', 0, 0],
    ['extreme south', -89.9999999, -179.9999999],
    ['extreme north', 89.9999999, 179.9999999],
    ['Dhaka', 23.8103, 90.4125],
  ])('preserves coordinates: %s', (_label, lat, lng) => {
    const packet = buildDangerPacket({lat, lng, kind: 'medical'}, params());
    const decoded = roundTrip(packet);
    expect(decoded.payload.lat).toBe(packet.payload.lat);
    expect(decoded.payload.lng).toBe(packet.payload.lng);
  });
});

describe('signature survival', () => {
  // The property the whole design hangs on. A receiver decodes the binary,
  // re-derives the canonical JSON, and checks the signature against it. If the
  // round-trip changed a single number, every packet would look forged.
  it('a decoded packet still verifies against the sender key', () => {
    const packets = [
      buildTextPacket('Intersection at TSC is clear', params()),
      buildSosPacket(
        {lat: 23.8103, lng: 90.4125, accuracy: 8, stale: true},
        params(),
      ),
      buildDangerPacket(
        {lat: 23.7381, lng: 90.3956, kind: 'gunfire', note: 'ছড়িয়ে দাও'},
        params(),
      ),
      buildSafePacket({lat: 23.7, lng: 90.4}, params()),
    ];

    for (const packet of packets) {
      const decoded = decodePacket(encodePacket(packet));
      const {signature, ...unsigned} = decoded;
      expect(verify(canonicalize(unsigned), signature, keyPair.publicKey)).toBe(
        true,
      );
    }
  });

  it('rejects a packet whose payload was altered in transit', () => {
    const packet = buildDangerPacket(
      {lat: 23.7381, lng: 90.3956, kind: 'tear_gas'},
      params(),
    );
    const encoded = encodePacket(packet);
    // Flip the danger kind byte — the last-but-one byte of this packet.
    encoded[encoded.length - 2] = 1;

    const decoded = decodePacket(encoded);
    const {signature, ...unsigned} = decoded;

    expect(verify(canonicalize(unsigned), signature, keyPair.publicKey)).toBe(
      false,
    );
  });

  it('cannot be re-signed under a different identity without changing senderId', () => {
    // senderId IS the public key, so there is no way to claim someone else's
    // identity while signing with your own — they are the same 32 bytes.
    const attacker = nacl.sign.keyPair();
    const packet = buildTextPacket('trust me', {
      senderId: encodeBase64(attacker.publicKey),
      id: 'ffffffffffffffff',
      sign: canonical => sign(canonical, attacker.secretKey),
    });

    const decoded = roundTrip(packet);
    expect(decoded.senderId).toBe(encodeBase64(attacker.publicKey));
    // It verifies as the attacker, which is the point: it cannot verify as
    // anyone else.
    const {signature, ...unsigned} = decoded;
    expect(verify(canonicalize(unsigned), signature, keyPair.publicKey)).toBe(
      false,
    );
  });
});

describe('size', () => {
  it('keeps an SOS inside a handful of legacy BLE frames', () => {
    const packet = buildSosPacket(
      {lat: 23.8103, lng: 90.4125, accuracy: 10, stale: false},
      params(),
    );
    const encoded = encodePacket(packet);

    expect(encoded.length).toBe(HEADER_BYTES + 11);
    // 20 usable data bytes per legacy frame after the chunk header.
    expect(Math.ceil(encoded.length / 20)).toBeLessThanOrEqual(7);
  });

  it('is dramatically smaller than the JSON encoding', () => {
    const packet = buildTextPacket('Medical camp at Gate 3', params());
    const json = decodeUTF8(JSON.stringify(packet)).length;
    const binary = encodePacket(packet).length;

    expect(binary).toBeLessThan(json / 2);
  });

  it('has a fixed 113-byte header regardless of type', () => {
    const safe = buildSafePacket(null, params());
    expect(encodePacket(safe).length).toBe(HEADER_BYTES + 1);
  });
});

describe('decoding hostile input', () => {
  // These bytes arrive from strangers' phones. Every one of these must fail
  // closed rather than throw somewhere deep in the relay loop.
  const valid = () =>
    encodePacket(buildTextPacket('hello', params()));

  it('rejects an empty buffer', () => {
    expect(() => decodePacket(new Uint8Array(0))).toThrow(WireFormatError);
  });

  it('rejects a truncated packet', () => {
    const encoded = valid();
    expect(() => decodePacket(encoded.slice(0, 50))).toThrow(/truncated/);
  });

  it('rejects an unknown wire version', () => {
    const encoded = valid();
    encoded[0] = 99;
    expect(() => decodePacket(encoded)).toThrow(/unsupported wire version/);
  });

  it('rejects an unknown packet type', () => {
    const encoded = valid();
    encoded[1] = 42;
    expect(() => decodePacket(encoded)).toThrow(/unknown packet type code/);
  });

  it('rejects an unknown danger kind', () => {
    const packet = buildDangerPacket(
      {lat: 23.7, lng: 90.4, kind: 'fire'},
      params(),
    );
    const encoded = encodePacket(packet);
    encoded[encoded.length - 2] = 200;
    expect(() => decodePacket(encoded)).toThrow(/unknown danger kind index/);
  });

  it('rejects trailing bytes rather than ignoring them', () => {
    // Trailing bytes make the canonical form ambiguous, and an ambiguous
    // canonical form means a signature nobody can trust either way.
    const encoded = valid();
    const padded = new Uint8Array(encoded.length + 3);
    padded.set(encoded);
    expect(() => decodePacket(padded)).toThrow(/trailing bytes/);
  });

  it('rejects a text length that runs past the buffer', () => {
    const encoded = valid();
    encoded[HEADER_BYTES] = 250;
    expect(() => decodePacket(encoded)).toThrow(/truncated/);
  });

  it('never throws something other than WireFormatError', () => {
    // Fuzzing the decoder with garbage: the relay loop catches
    // InvalidPacketError, so anything else would crash it.
    for (let seed = 0; seed < 300; seed++) {
      const junk = new Uint8Array(seed % 200).map(
        (_, i) => (i * 7 + seed * 13) & 0xff,
      );
      try {
        decodePacket(junk);
      } catch (err) {
        expect(err).toBeInstanceOf(WireFormatError);
      }
    }
  });
});

describe('encoding validation', () => {
  it('rejects a senderId that is not a 32-byte key', () => {
    const packet = buildTextPacket('x', {...params(), senderId: 'AAAA'});
    expect(() => encodePacket(packet)).toThrow(/senderId must be 32 bytes/);
  });

  it('rejects a malformed packet id', () => {
    const packet = buildTextPacket('x', params('not-hex'));
    expect(() => encodePacket(packet)).toThrow(/hex chars/);
  });

  it('rejects a ttl that will not fit in a byte', () => {
    const packet = {...buildTextPacket('x', params()), ttl: 300};
    expect(() => encodePacket(packet)).toThrow(/ttl must be 0..255/);
  });
});

describe('newPacketId', () => {
  it('produces 16 lowercase hex characters', () => {
    const id = newPacketId(nacl.randomBytes);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('encodes into a packet without loss', () => {
    const id = newPacketId(nacl.randomBytes);
    const packet = buildTextPacket('x', params(id));
    expect(decodePacket(encodePacket(packet)).id).toBe(id);
  });

  it('is different every time', () => {
    const ids = new Set(
      Array.from({length: 200}, () => newPacketId(nacl.randomBytes)),
    );
    expect(ids.size).toBe(200);
  });
});

describe('wire version', () => {
  it('is stamped in the first byte, so future formats can coexist', () => {
    expect(encodePacket(buildTextPacket('x', params()))[0]).toBe(WIRE_VERSION);
  });
});
