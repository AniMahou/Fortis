/**
 * Mesh packet schema — the single format that carries every "real" feature
 * (text relay, SOS, danger pin) over the same BLE broadcast channel.
 *
 * Kept deliberately dependency-free (no RN, no BLE libs) so it can be
 * unit-tested on a laptop, long before any phone is involved.
 */

export type PacketType = 'text' | 'sos' | 'danger' | 'safe';

export const MAX_TTL = 5; // max hops a packet will travel before dying out

export interface MeshPacket {
  id: string; // unique per packet, used for de-dupe across the mesh
  type: PacketType;
  senderId: string; // random per-install UUID, never a device identifier
  ttl: number; // hops remaining; decremented by every relaying node
  timestamp: number; // ms epoch, set once at creation, never mutated
  payload: Record<string, unknown>; // shape depends on `type`
  signature: string; // signature over the canonical (pre-signature) fields
}

export type UnsignedPacket = Omit<MeshPacket, 'signature'>;

interface CreatePacketParams {
  type: PacketType;
  senderId: string;
  payload: Record<string, unknown>;
  sign: (canonicalData: string) => string;
  id: string; // caller supplies an id generator (e.g. react-native-uuid) — kept
  // as a required param rather than generated in here, so this module has
  // zero randomness and is trivially deterministic to test.
  ttl?: number;
  timestamp?: number;
}

/**
 * Produces a deterministic string for a packet's content, independent of
 * key insertion order. This is what gets signed, and what a receiver
 * re-derives to verify the signature — so it must never depend on `Date.now()`
 * or object key order.
 *
 * **`ttl` is deliberately excluded.** It is the one field every relaying node
 * mutates: `decrementTtl` changes it on every hop. Including it in the signed
 * form meant a packet verified at its origin and then failed verification at
 * every node after the first, so nothing could ever travel more than one hop —
 * which would have quietly reduced a mesh to a broadcast. A signature can only
 * cover fields that do not change in flight, which is the same reason IP
 * checksums and IPsec both exclude the TTL/hop-limit field.
 *
 * The trade-off: a hostile relay can raise a packet's ttl and make it live
 * longer than its sender intended. That is bounded by receivers clamping
 * incoming ttl to their own configured maximum (see `meshService.ts`), and it
 * is a far smaller problem than multi-hop relay not working at all.
 */
export function canonicalize(packet: UnsignedPacket): string {
  const ordered = {
    id: packet.id,
    payload: sortKeysDeep(packet.payload),
    senderId: packet.senderId,
    timestamp: packet.timestamp,
    type: packet.type,
  };
  return JSON.stringify(ordered);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return value;
}

export function createPacket(params: CreatePacketParams): MeshPacket {
  const unsigned: UnsignedPacket = {
    id: params.id,
    type: params.type,
    senderId: params.senderId,
    ttl: params.ttl ?? MAX_TTL,
    timestamp: params.timestamp ?? Date.now(),
    payload: params.payload,
  };

  return {
    ...unsigned,
    signature: params.sign(canonicalize(unsigned)),
  };
}

export function decrementTtl(packet: MeshPacket): MeshPacket {
  return { ...packet, ttl: packet.ttl - 1 };
}

export function isExpired(packet: MeshPacket): boolean {
  return packet.ttl <= 0;
}

export function serializePacket(packet: MeshPacket): string {
  return JSON.stringify(packet);
}

export class InvalidPacketError extends Error {}

/**
 * Parses + shape-validates a packet coming off the wire (a BLE advertisement
 * payload). Deliberately paranoid: anything malformed from a compromised or
 * buggy peer must fail closed, not throw deep inside the relay logic.
 */
export function deserializePacket(raw: string): MeshPacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidPacketError('not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidPacketError('packet is not an object');
  }

  const p = parsed as Record<string, unknown>;
  const requiredStringFields = ['id', 'type', 'senderId', 'signature'];
  for (const field of requiredStringFields) {
    if (typeof p[field] !== 'string' || p[field] === '') {
      throw new InvalidPacketError(`missing or invalid field: ${field}`);
    }
  }
  if (typeof p.ttl !== 'number' || !Number.isFinite(p.ttl)) {
    throw new InvalidPacketError('missing or invalid field: ttl');
  }
  if (typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp)) {
    throw new InvalidPacketError('missing or invalid field: timestamp');
  }
  if (typeof p.payload !== 'object' || p.payload === null) {
    throw new InvalidPacketError('missing or invalid field: payload');
  }
  const validTypes: PacketType[] = ['text', 'sos', 'danger', 'safe'];
  if (!validTypes.includes(p.type as PacketType)) {
    throw new InvalidPacketError(`unknown packet type: ${String(p.type)}`);
  }

  return p as unknown as MeshPacket;
}
