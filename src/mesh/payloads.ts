/**
 * Typed payloads for each packet type, and the quantisation that makes them
 * safe to send in binary.
 *
 * The subtle part is `quantiseCoord`. Coordinates travel as 32-bit integers of
 * degrees × 10⁷ (about 1cm of precision), which is what keeps an SOS small
 * enough to fit in a couple of BLE frames. But a packet's signature is taken
 * over `canonicalize()` in packet.ts, which is JSON — so if a payload were
 * signed with 23.810312345 and encoded as 23.8103123, the receiver would
 * reconstruct a different number, re-derive a different canonical string, and
 * reject a perfectly good SOS as forged.
 *
 * So coordinates are quantised at *creation* time, before signing. The value
 * that gets signed is exactly the value the wire can carry. Every builder here
 * does that, which is why packets should be built through these functions
 * rather than by calling createPacket directly.
 */

import {decodeUTF8} from 'tweetnacl-util';
import {createPacket, type MeshPacket, type PacketType} from './packet';

/** Matches the hazard vocabulary in docs/design/screens/safety_map. */
export const DANGER_KINDS = [
  'tear_gas',
  'police',
  'gunfire',
  'medical',
  'blocked',
  'fire',
] as const;

export type DangerKind = (typeof DANGER_KINDS)[number];

export interface TextPayload {
  text: string;
}

export interface SosPayload {
  lat: number;
  lng: number;
  /** Metres, rounded — sub-metre precision is noise from a phone GPS. */
  accuracy: number;
  /** True when the fix was last-known rather than fresh. */
  stale: boolean;
}

export interface DangerPayload {
  lat: number;
  lng: number;
  kind: DangerKind;
  /** Optional free text. Costs a frame or two, so it is genuinely optional. */
  note?: string;
}

export interface SafePayload {
  lat?: number;
  lng?: number;
}

export type VoxPayload =
  | TextPayload
  | SosPayload
  | DangerPayload
  | SafePayload;

/** Degrees × 10⁷ fits in an int32 and resolves to roughly 1cm. */
export const COORD_SCALE = 1e7;

/**
 * Rounds a coordinate to exactly what the wire format can represent.
 *
 * Must be applied before signing — see the module header for what happens if
 * it is not.
 */
export function quantiseCoord(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`coordinate must be finite, got ${value}`);
  }
  return Math.round(value * COORD_SCALE) / COORD_SCALE;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Longest text the UI accepts. 180 bytes is ~10 legacy BLE frames. */
export const MAX_TEXT_BYTES = 180;
export const MAX_NOTE_BYTES = 60;

export class PayloadError extends Error {}

function utf8Length(value: string): number {
  // Counting bytes rather than characters matters because Bangla is 3 bytes
  // per character in UTF-8 — a "60 character" limit would quietly become a
  // 180-byte packet, nine extra BLE frames of airtime.
  //
  // tweetnacl-util rather than TextEncoder: TextEncoder is not guaranteed to
  // exist in every Hermes build, and this is already a dependency.
  return decodeUTF8(value).length;
}

interface BuildParams {
  senderId: string;
  id: string;
  sign: (canonical: string) => string;
  ttl?: number;
  timestamp?: number;
}

function build(
  type: PacketType,
  payload: Record<string, unknown>,
  params: BuildParams,
): MeshPacket {
  return createPacket({
    type,
    payload,
    senderId: params.senderId,
    id: params.id,
    sign: params.sign,
    ...(params.ttl !== undefined ? {ttl: params.ttl} : {}),
    ...(params.timestamp !== undefined ? {timestamp: params.timestamp} : {}),
  });
}

export function buildTextPacket(
  text: string,
  params: BuildParams,
): MeshPacket {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new PayloadError('refusing to broadcast an empty message');
  }
  if (utf8Length(trimmed) > MAX_TEXT_BYTES) {
    throw new PayloadError(
      `message is ${utf8Length(trimmed)} bytes, over the ${MAX_TEXT_BYTES}-byte limit`,
    );
  }
  return build('text', {text: trimmed}, params);
}

export function buildSosPacket(
  fix: {lat: number; lng: number; accuracy: number; stale: boolean},
  params: BuildParams,
): MeshPacket {
  assertCoords(fix.lat, fix.lng);
  return build(
    'sos',
    {
      lat: quantiseCoord(fix.lat),
      lng: quantiseCoord(fix.lng),
      accuracy: Math.max(0, Math.min(65535, Math.round(fix.accuracy))),
      stale: fix.stale,
    },
    params,
  );
}

export function buildDangerPacket(
  report: {lat: number; lng: number; kind: DangerKind; note?: string},
  params: BuildParams,
): MeshPacket {
  assertCoords(report.lat, report.lng);
  if (!DANGER_KINDS.includes(report.kind)) {
    throw new PayloadError(`unknown danger kind: ${report.kind}`);
  }
  const note = report.note?.trim();
  if (note !== undefined && utf8Length(note) > MAX_NOTE_BYTES) {
    throw new PayloadError(
      `note is ${utf8Length(note)} bytes, over the ${MAX_NOTE_BYTES}-byte limit`,
    );
  }
  return build(
    'danger',
    {
      lat: quantiseCoord(report.lat),
      lng: quantiseCoord(report.lng),
      kind: report.kind,
      // Omitted rather than empty, so the canonical form and the wire encoding
      // agree on whether the field exists at all.
      ...(note !== undefined && note !== '' ? {note} : {}),
    },
    params,
  );
}

export function buildSafePacket(
  fix: {lat: number; lng: number} | null,
  params: BuildParams,
): MeshPacket {
  if (fix === null) return build('safe', {}, params);
  assertCoords(fix.lat, fix.lng);
  return build(
    'safe',
    {lat: quantiseCoord(fix.lat), lng: quantiseCoord(fix.lng)},
    params,
  );
}

function assertCoords(lat: number, lng: number): void {
  if (!isValidLatitude(lat)) {
    throw new PayloadError(`latitude out of range: ${lat}`);
  }
  if (!isValidLongitude(lng)) {
    throw new PayloadError(`longitude out of range: ${lng}`);
  }
}
