/**
 * JS binding for VoxLocationModule (android/.../VoxLocationModule.kt).
 */

import {NativeModules} from 'react-native';

export interface VoxPosition {
  latitude: number;
  longitude: number;
  /** Radius of 68% confidence, in metres, as reported by the provider. */
  accuracy: number;
  timestamp: number;
  /**
   * True when this is a last-known fix rather than a fresh one. The SOS
   * confirmation screen says so out loud — telling someone help is coming to
   * a position that is ten minutes old, without mentioning it, is worse than
   * telling them the fix is stale.
   */
  stale: boolean;
  provider: string | null;
}

interface VoxLocationNative {
  getCurrentPosition(timeoutMs: number): Promise<VoxPosition>;
  getLastKnownPosition(): Promise<VoxPosition | null>;
  isLocationEnabled(): Promise<boolean>;
}

const native = NativeModules.VoxLocation as VoxLocationNative | undefined;

export class LocationUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

/**
 * A GPS fix, or a clear reason there isn't one.
 *
 * The default timeout is deliberately short. This sits behind the SOS button,
 * and a fix that arrives after thirty seconds of a spinner is not useful to
 * someone who needs help now — the native side falls back to a last-known
 * position when the timeout expires rather than failing.
 */
export async function getCurrentPosition(
  timeoutMs = 8000,
): Promise<VoxPosition> {
  if (!native) {
    throw new LocationUnavailableError(
      'VoxLocation native module is unavailable',
      'NOT_LINKED',
    );
  }
  try {
    return await native.getCurrentPosition(timeoutMs);
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as {code: unknown}).code)
        : 'UNKNOWN';
    throw new LocationUnavailableError(
      err instanceof Error ? err.message : 'Could not get a position',
      code,
    );
  }
}

/** Instant, possibly stale. Used to pre-warm SOS so the button is never cold. */
export async function getLastKnownPosition(): Promise<VoxPosition | null> {
  if (!native) return null;
  try {
    return await native.getLastKnownPosition();
  } catch {
    return null;
  }
}

export async function isLocationEnabled(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isLocationEnabled();
  } catch {
    return false;
  }
}

export const isLocationLinked = native !== undefined;
