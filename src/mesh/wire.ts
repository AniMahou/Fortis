/**
 * Compact binary encoding for mesh packets.
 *
 * `serializePacket` in packet.ts produces JSON, which is right for debugging
 * and for the WiFi transport, but a signed VOX packet as JSON is 400-600
 * bytes. At ~20 usable bytes per legacy BLE advertisement frame that is 25-30
 * frames, six or seven seconds of airtime for one message. This format gets
 * the same packet to 113 bytes plus payload — six frames, about a second.
 *
 * The layout, all big-endian:
 *
 *   offset  size  field
 *   0       1     format version
 *   1       1     packet type
 *   2       8     packet id
 *   10      32    senderId — the sender's Ed25519 public key, raw
 *   42      1     ttl
 *   43      6     timestamp, ms since epoch
 *   49      64    signature, raw
 *   113     …     payload, shape depends on type
 *
 * Two things are worth understanding about this.
 *
 * **senderId is the public key.** Not a UUID that refers to one. Carrying the
 * key is unavoidable — a receiver has no server to look it up from, and cannot
 * verify a signature without it. Making the identifier *be* the key rather
 * than shipping both costs nothing and removes a whole class of bug: there is
 * no way to claim someone else's senderId while signing with your own key,
 * because they are the same 32 bytes. See docs/DECISIONS.md D7.
 *
 * **Encoding must round-trip exactly.** The signature covers `canonicalize()`
 * from packet.ts, a JSON string. A receiver decodes the binary, rebuilds the
 * packet object, re-derives that JSON and checks the signature against it. If
 * decoding produced 23.8103123 where the sender signed 23.81031234, every
 * signature would fail. That is why coordinates are quantised before signing
 * (see payloads.ts) and why the round-trip is property-tested.
 */

import {decodeBase64, decodeUTF8, encodeBase64, encodeUTF8} from 'tweetnacl-util';
import {DANGER_KINDS, type DangerKind} from './payloads';
import {InvalidPacketError, type MeshPacket, type PacketType} from './packet';

export const WIRE_VERSION = 1;

export const HEADER_BYTES = 113;

const PACKET_ID_BYTES = 8;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;
const TIMESTAMP_BYTES = 6;

const TYPE_TO_CODE: Record<PacketType, number> = {
  text: 0,
  sos: 1,
  danger: 2,
  safe: 3,
};

const CODE_TO_TYPE: Record<number, PacketType> = {
  0: 'text',
  1: 'sos',
  2: 'danger',
  3: 'safe',
};

export class WireFormatError extends InvalidPacketError {}

// ------------------------------------------------------------------ helpers

function hexToBytes(hex: string, expectedBytes: number): Uint8Array {
  if (hex.length !== expectedBytes * 2 || !/^[0-9a-f]+$/.test(hex)) {
    throw new WireFormatError(
      `expected ${expectedBytes * 2} lowercase hex chars, got "${hex}"`,
    );
  }
  const out = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function base64ToBytes(value: string, expectedBytes: number, field: string) {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(value);
  } catch {
    throw new WireFormatError(`${field} is not valid base64`);
  }
  if (bytes.length !== expectedBytes) {
    throw new WireFormatError(
      `${field} must be ${expectedBytes} bytes, got ${bytes.length}`,
    );
  }
  return bytes;
}

class Writer {
  private readonly parts: number[] = [];

  u8(value: number): void {
    this.parts.push(value & 0xff);
  }

  u16(value: number): void {
    this.parts.push((value >>> 8) & 0xff, value & 0xff);
  }

  i32(value: number): void {
    this.parts.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  /** 48-bit. Written by hand because bit shifts in JS are 32-bit only. */
  u48(value: number): void {
    const high = Math.floor(value / 0x100000000);
    const low = value % 0x100000000;
    this.parts.push((high >>> 8) & 0xff, high & 0xff);
    this.parts.push(
      (low >>> 24) & 0xff,
      (low >>> 16) & 0xff,
      (low >>> 8) & 0xff,
      low & 0xff,
    );
  }

  bytes(value: Uint8Array): void {
    for (const byte of value) this.parts.push(byte);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

class Reader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  private require(count: number, field: string): void {
    if (this.offset + count > this.data.length) {
      throw new WireFormatError(
        `truncated packet: needed ${count} more bytes for ${field}`,
      );
    }
  }

  u8(field: string): number {
    this.require(1, field);
    return this.data[this.offset++]!;
  }

  u16(field: string): number {
    this.require(2, field);
    return (this.data[this.offset++]! << 8) | this.data[this.offset++]!;
  }

  i32(field: string): number {
    this.require(4, field);
    const value =
      ((this.data[this.offset++]! << 24) |
        (this.data[this.offset++]! << 16) |
        (this.data[this.offset++]! << 8) |
        this.data[this.offset++]!) >>
      0;
    // `| 0` would already sign-extend, but being explicit documents that
    // negative coordinates (southern/western hemispheres) are expected here.
    return value | 0;
  }

  u48(field: string): number {
    this.require(TIMESTAMP_BYTES, field);
    const high = (this.data[this.offset++]! << 8) | this.data[this.offset++]!;
    const low =
      this.data[this.offset++]! * 0x1000000 +
      (this.data[this.offset++]! << 16) +
      (this.data[this.offset++]! << 8) +
      this.data[this.offset++]!;
    return high * 0x100000000 + low;
  }

  bytes(count: number, field: string): Uint8Array {
    this.require(count, field);
    const slice = this.data.slice(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }
}

// ------------------------------------------------------------------- encode

export function encodePacket(packet: MeshPacket): Uint8Array {
  const typeCode = TYPE_TO_CODE[packet.type];
  if (typeCode === undefined) {
    throw new WireFormatError(`unknown packet type: ${packet.type}`);
  }
  if (!Number.isInteger(packet.ttl) || packet.ttl < 0 || packet.ttl > 255) {
    throw new WireFormatError(`ttl must be 0..255, got ${packet.ttl}`);
  }
  if (
    !Number.isInteger(packet.timestamp) ||
    packet.timestamp < 0 ||
    packet.timestamp > 0xffffffffffff
  ) {
    throw new WireFormatError(`timestamp out of range: ${packet.timestamp}`);
  }

  const writer = new Writer();
  writer.u8(WIRE_VERSION);
  writer.u8(typeCode);
  writer.bytes(hexToBytes(packet.id, PACKET_ID_BYTES));
  writer.bytes(base64ToBytes(packet.senderId, PUBLIC_KEY_BYTES, 'senderId'));
  writer.u8(packet.ttl);
  writer.u48(packet.timestamp);
  writer.bytes(base64ToBytes(packet.signature, SIGNATURE_BYTES, 'signature'));

  encodePayload(writer, packet.type, packet.payload);
  return writer.finish();
}

function encodePayload(
  writer: Writer,
  type: PacketType,
  payload: Record<string, unknown>,
): void {
  switch (type) {
    case 'text': {
      const text = payload.text;
      if (typeof text !== 'string') {
        throw new WireFormatError('text payload requires a string `text`');
      }
      const encoded = decodeUTF8(text);
      if (encoded.length > 255) {
        throw new WireFormatError(
          `text is ${encoded.length} bytes, over the 255-byte wire limit`,
        );
      }
      writer.u8(encoded.length);
      writer.bytes(encoded);
      return;
    }
    case 'sos': {
      writeCoord(writer, payload.lat, 'lat');
      writeCoord(writer, payload.lng, 'lng');
      const accuracy = payload.accuracy;
      if (typeof accuracy !== 'number' || !Number.isInteger(accuracy)) {
        throw new WireFormatError('sos payload requires an integer `accuracy`');
      }
      writer.u16(Math.max(0, Math.min(0xffff, accuracy)));
      writer.u8(payload.stale === true ? 1 : 0);
      return;
    }
    case 'danger': {
      writeCoord(writer, payload.lat, 'lat');
      writeCoord(writer, payload.lng, 'lng');
      const kindIndex = DANGER_KINDS.indexOf(payload.kind as DangerKind);
      if (kindIndex < 0) {
        throw new WireFormatError(`unknown danger kind: ${payload.kind}`);
      }
      writer.u8(kindIndex);
      const note = payload.note;
      if (note === undefined) {
        writer.u8(0);
      } else {
        if (typeof note !== 'string') {
          throw new WireFormatError('danger `note` must be a string');
        }
        const encoded = decodeUTF8(note);
        if (encoded.length > 255) {
          throw new WireFormatError('danger note exceeds 255 bytes');
        }
        writer.u8(encoded.length);
        writer.bytes(encoded);
      }
      return;
    }
    case 'safe': {
      const hasCoords =
        typeof payload.lat === 'number' && typeof payload.lng === 'number';
      writer.u8(hasCoords ? 1 : 0);
      if (hasCoords) {
        writeCoord(writer, payload.lat, 'lat');
        writeCoord(writer, payload.lng, 'lng');
      }
      return;
    }
  }
}

function writeCoord(writer: Writer, value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WireFormatError(`\`${field}\` must be a finite number`);
  }
  const scaled = Math.round(value * 1e7);
  if (scaled < -2147483648 || scaled > 2147483647) {
    throw new WireFormatError(`\`${field}\` out of range: ${value}`);
  }
  writer.i32(scaled);
}

// ------------------------------------------------------------------- decode

/**
 * Parses a packet off the air.
 *
 * Deliberately paranoid, in the same spirit as `deserializePacket`: these
 * bytes come from strangers' phones, some of which may be hostile and some of
 * which are just buggy. Anything malformed must fail closed here rather than
 * throw somewhere deep in the relay loop.
 */
export function decodePacket(data: Uint8Array): MeshPacket {
  const reader = new Reader(data);

  const version = reader.u8('version');
  if (version !== WIRE_VERSION) {
    throw new WireFormatError(
      `unsupported wire version ${version}, expected ${WIRE_VERSION}`,
    );
  }

  const typeCode = reader.u8('type');
  const type = CODE_TO_TYPE[typeCode];
  if (type === undefined) {
    throw new WireFormatError(`unknown packet type code: ${typeCode}`);
  }

  const id = bytesToHex(reader.bytes(PACKET_ID_BYTES, 'id'));
  const senderId = encodeBase64(reader.bytes(PUBLIC_KEY_BYTES, 'senderId'));
  const ttl = reader.u8('ttl');
  const timestamp = reader.u48('timestamp');
  const signature = encodeBase64(reader.bytes(SIGNATURE_BYTES, 'signature'));

  const payload = decodePayload(reader, type);

  if (reader.remaining !== 0) {
    // Trailing bytes mean the frame was padded, corrupted, or crafted. Any of
    // those makes the canonical form ambiguous, and an ambiguous canonical
    // form means a signature that cannot be trusted either way.
    throw new WireFormatError(
      `${reader.remaining} unexpected trailing bytes after payload`,
    );
  }

  return {id, type, senderId, ttl, timestamp, payload, signature};
}

function decodePayload(
  reader: Reader,
  type: PacketType,
): Record<string, unknown> {
  switch (type) {
    case 'text': {
      const length = reader.u8('text length');
      const text = encodeUTF8(reader.bytes(length, 'text'));
      return {text};
    }
    case 'sos': {
      const lat = readCoord(reader, 'lat');
      const lng = readCoord(reader, 'lng');
      const accuracy = reader.u16('accuracy');
      const stale = reader.u8('stale') === 1;
      return {lat, lng, accuracy, stale};
    }
    case 'danger': {
      const lat = readCoord(reader, 'lat');
      const lng = readCoord(reader, 'lng');
      const kindIndex = reader.u8('kind');
      const kind = DANGER_KINDS[kindIndex];
      if (kind === undefined) {
        throw new WireFormatError(`unknown danger kind index: ${kindIndex}`);
      }
      const noteLength = reader.u8('note length');
      if (noteLength === 0) return {lat, lng, kind};
      const note = encodeUTF8(reader.bytes(noteLength, 'note'));
      return {lat, lng, kind, note};
    }
    case 'safe': {
      const hasCoords = reader.u8('hasCoords') === 1;
      if (!hasCoords) return {};
      return {lat: readCoord(reader, 'lat'), lng: readCoord(reader, 'lng')};
    }
  }
}

function readCoord(reader: Reader, field: string): number {
  // Divide rather than multiply by 1e-7: 1e-7 is not exactly representable in
  // binary floating point, and multiplying by it introduces error that breaks
  // the exact round-trip the signature depends on.
  return reader.i32(field) / 1e7;
}

/**
 * A fresh packet id: 8 random bytes as hex.
 *
 * Eight bytes rather than a full UUID because every byte costs airtime, and
 * the id only has to be unique among packets circulating in one neighbourhood
 * within the de-duplication window. At 2⁶⁴ the chance of a collision there is
 * not worth the extra 8 bytes in every frame.
 */
export function newPacketId(
  randomBytes: (length: number) => Uint8Array,
): string {
  return bytesToHex(randomBytes(PACKET_ID_BYTES));
}
