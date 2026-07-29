/**
 * Turning received packets into the things screens render.
 *
 * Pure functions, no zustand and no React Native, so the mapping from "a
 * packet arrived" to "this is what the user sees" is tested rather than
 * assumed. The stores in this folder are thin wrappers over these.
 */

import type {ReceivedPacket} from '../mesh/meshService';
import type {MeshPacket} from '../mesh/packet';
import type {DangerKind} from '../mesh/payloads';

/** Longest history kept in memory and persisted. */
export const MAX_MESSAGES = 200;
export const MAX_DANGER_PINS = 50;
export const MAX_SOS_EVENTS = 50;

export interface MeshMessage {
  id: string;
  senderId: string;
  text: string;
  sentAt: number;
  /** Relays crossed. 0 is direct; null for our own outgoing messages. */
  hopCount: number | null;
  mine: boolean;
  rssi: number | null;
}

export interface DangerPin {
  id: string;
  senderId: string;
  lat: number;
  lng: number;
  kind: DangerKind;
  note: string | null;
  reportedAt: number;
  hopCount: number | null;
  mine: boolean;
}

export interface SosEvent {
  id: string;
  senderId: string;
  lat: number;
  lng: number;
  accuracy: number;
  /** The fix was last-known rather than fresh. Shown to the user as such. */
  stale: boolean;
  sentAt: number;
  hopCount: number | null;
  mine: boolean;
}

export function messageFromPacket(received: ReceivedPacket): MeshMessage | null {
  if (received.packet.type !== 'text') return null;
  const text = received.packet.payload.text;
  if (typeof text !== 'string') return null;
  return {
    id: received.packet.id,
    senderId: received.packet.senderId,
    text,
    sentAt: received.packet.timestamp,
    hopCount: received.hopCount,
    mine: false,
    rssi: received.rssi,
  };
}

export function messageFromOwnPacket(packet: MeshPacket): MeshMessage | null {
  if (packet.type !== 'text') return null;
  const text = packet.payload.text;
  if (typeof text !== 'string') return null;
  return {
    id: packet.id,
    senderId: packet.senderId,
    text,
    sentAt: packet.timestamp,
    hopCount: null,
    mine: true,
    rssi: null,
  };
}

export function dangerPinFromPacket(
  received: ReceivedPacket,
): DangerPin | null {
  if (received.packet.type !== 'danger') return null;
  const {lat, lng, kind, note} = received.packet.payload;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (typeof kind !== 'string') return null;
  return {
    id: received.packet.id,
    senderId: received.packet.senderId,
    lat,
    lng,
    kind: kind as DangerKind,
    note: typeof note === 'string' ? note : null,
    reportedAt: received.packet.timestamp,
    hopCount: received.hopCount,
    mine: false,
  };
}

export function sosFromPacket(received: ReceivedPacket): SosEvent | null {
  if (received.packet.type !== 'sos') return null;
  const {lat, lng, accuracy, stale} = received.packet.payload;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    id: received.packet.id,
    senderId: received.packet.senderId,
    lat,
    lng,
    accuracy: typeof accuracy === 'number' ? accuracy : 0,
    stale: stale === true,
    sentAt: received.packet.timestamp,
    hopCount: received.hopCount,
    mine: false,
  };
}

/**
 * Appends while keeping the list bounded and free of duplicates.
 *
 * De-duplication is belt-and-braces — `relay.ts` already drops duplicate
 * packets — but a message appearing twice on screen is the kind of bug that
 * makes a demo look broken even when the mesh underneath is working
 * perfectly, so it is worth catching in both places.
 */
export function appendBounded<T extends {id: string}>(
  list: readonly T[],
  item: T,
  max: number,
): T[] {
  if (list.some(existing => existing.id === item.id)) return list as T[];
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * The hop-count badge label.
 *
 * Lives here, as a pure function, rather than inline in the component — it is
 * the single most load-bearing string in the demo. "2 HOPS" on a bubble is the
 * visible proof a message travelled through somebody else's phone, and a
 * relayed message rendering as "DIRECT" would be wrong in the most convincing
 * possible way. Putting it here makes it testable without a renderer.
 *
 * Returns null for our own outgoing messages: a broadcast mesh has no delivery
 * receipts, so any badge there would claim something nobody confirmed.
 */
export function formatHopCount(hopCount: number | null): string | null {
  if (hopCount === null) return null;
  if (hopCount <= 0) return 'DIRECT';
  return hopCount === 1 ? '1 HOP' : `${hopCount} HOPS`;
}

/**
 * Newest report wins per location and kind.
 *
 * Without this the map accumulates a smear of pins as people re-report the
 * same tear gas at the same junction. Rounding to ~11m (4 decimal places)
 * treats reports of the same corner as the same place.
 */
export function mergeDangerPins(
  pins: readonly DangerPin[],
  incoming: DangerPin,
): DangerPin[] {
  const key = (pin: DangerPin) =>
    `${pin.kind}:${pin.lat.toFixed(4)}:${pin.lng.toFixed(4)}`;
  const incomingKey = key(incoming);

  const existingIndex = pins.findIndex(pin => key(pin) === incomingKey);
  if (existingIndex === -1) {
    return appendBounded(pins, incoming, MAX_DANGER_PINS);
  }

  const existing = pins[existingIndex]!;
  if (existing.reportedAt >= incoming.reportedAt) return pins as DangerPin[];

  const next = [...pins];
  next[existingIndex] = incoming;
  return next;
}

/** How old a danger report may be before the map stops showing it. */
export const DANGER_PIN_TTL_MS = 60 * 60 * 1000;

export function activeDangerPins(
  pins: readonly DangerPin[],
  now: number,
): DangerPin[] {
  return pins.filter(pin => now - pin.reportedAt < DANGER_PIN_TTL_MS);
}
