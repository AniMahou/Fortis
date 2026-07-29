/**
 * Per-install device identity. This is deliberately NOT tied to any hardware
 * identifier (no IMEI, no Android ID, no MAC) — it's a keypair generated on
 * first launch and stored locally. Panic wipe destroys it, and the next
 * launch generates a brand new, unlinkable one.
 *
 * Storage is injected via the KeyStorage interface so this module has zero
 * dependency on MMKV/RN and can be fully unit tested on a laptop.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const KEYPAIR_STORAGE_KEY = 'vox.device.keypair.v1';

export function generateKeyPair(): DeviceKeyPair {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function serializeKeyPair(kp: DeviceKeyPair): string {
  return JSON.stringify({
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  });
}

export class CorruptKeyStorageError extends Error {}

export function deserializeKeyPair(raw: string): DeviceKeyPair {
  let parsed: { publicKey?: unknown; secretKey?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorruptKeyStorageError('stored keypair is not valid JSON');
  }
  if (typeof parsed.publicKey !== 'string' || typeof parsed.secretKey !== 'string') {
    throw new CorruptKeyStorageError('stored keypair is missing publicKey/secretKey');
  }
  return {
    publicKey: decodeBase64(parsed.publicKey),
    secretKey: decodeBase64(parsed.secretKey),
  };
}

/**
 * Loads the existing on-device keypair, or generates + persists a new one on
 * first launch. If the stored value is corrupted, regenerates rather than
 * crashing app startup.
 */
export function loadOrCreateKeyPair(storage: KeyStorage): DeviceKeyPair {
  const existing = storage.getItem(KEYPAIR_STORAGE_KEY);
  if (existing) {
    try {
      return deserializeKeyPair(existing);
    } catch (err) {
      if (!(err instanceof CorruptKeyStorageError)) throw err;
      // fall through and regenerate
    }
  }
  const fresh = generateKeyPair();
  storage.setItem(KEYPAIR_STORAGE_KEY, serializeKeyPair(fresh));
  return fresh;
}

/**
 * Called by panic wipe. This is what makes the wipe actually mean something:
 * deleting cached messages is useless if the key that could still prove
 * authorship is left sitting in storage.
 */
export function destroyKeyPair(storage: KeyStorage): void {
  storage.removeItem(KEYPAIR_STORAGE_KEY);
}

/**
 * Short, human-eyeballable string for two people to compare "do our apps
 * agree on who this public key belongs to" without reading 44 base64 chars.
 */
export function publicKeyFingerprint(publicKey: Uint8Array): string {
  return encodeBase64(publicKey).slice(0, 11);
}
