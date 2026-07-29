/**
 * The master key that encrypts VOX's local store, and the machinery that
 * destroys it.
 *
 * The key is 32 random bytes. It is what MMKV encrypts the vault with, and it
 * is the single thing panic wipe has to get rid of — the chats, the map pins
 * and the relay history are all just ciphertext without it.
 *
 * Where the key lives depends on the device:
 *
 *   hardware  The key is wrapped by a non-extractable AES key inside the
 *             Android Keystore (TEE or secure element) and only the wrapped
 *             blob is written to flash. Deleting the Keystore alias makes that
 *             blob permanently undecryptable, on this device or any other.
 *
 *   software  No Keystore available. The key is stored directly. A wipe still
 *             deletes it, but offers no protection against someone recovering
 *             the raw flash. Reported honestly to the UI rather than hidden.
 *
 * Storage is injected, so all of this is tested without a phone.
 */

import {encodeBase64} from 'tweetnacl-util';
import nacl from 'tweetnacl';
import {
  STORAGE_KEYS,
  type KeyProtection,
  type KeyValueBackend,
  type KeyWrapper,
} from './types';

export const MASTER_KEY_BYTES = 32;

export interface MasterKeyResult {
  /** base64-encoded 32-byte key. */
  key: string;
  protection: KeyProtection;
  /** True when this call generated a new key rather than loading one. */
  created: boolean;
}

/** Injectable so tests are deterministic; defaults to tweetnacl's CSPRNG. */
export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = length => nacl.randomBytes(length);

/**
 * Loads the master key, or creates one on first launch — and after a panic
 * wipe, which is deliberately indistinguishable from a first launch.
 */
export async function loadOrCreateMasterKey(
  bootstrap: KeyValueBackend,
  wrapper: KeyWrapper | null,
  randomBytes: RandomBytes = defaultRandomBytes,
): Promise<MasterKeyResult> {
  const hardwareAvailable = wrapper ? await wrapper.isAvailable() : false;

  if (hardwareAvailable && wrapper) {
    const blob = bootstrap.getString(STORAGE_KEYS.wrappedMasterKey);
    if (blob !== undefined) {
      try {
        const key = await wrapper.unwrapKey(blob);
        return {key, protection: 'hardware', created: false};
      } catch {
        // Either the wrapping key was destroyed by a panic wipe, or the
        // Keystore entry was invalidated by the OS (a lock-screen change can
        // do this). Both mean the old vault is unreadable forever, so the only
        // sane move is a clean new identity — never an error screen shown to
        // someone who may be mid-emergency.
        bootstrap.delete(STORAGE_KEYS.wrappedMasterKey);
      }
    }

    const fresh = encodeBase64(randomBytes(MASTER_KEY_BYTES));
    const wrapped = await wrapper.wrapKey(fresh);
    bootstrap.set(STORAGE_KEYS.wrappedMasterKey, wrapped);
    bootstrap.set(STORAGE_KEYS.keyProtection, 'hardware');
    // A leftover software key from a previous install on a device that has
    // since gained Keystore support would be a second, weaker copy of the
    // same secret sitting in flash.
    bootstrap.delete(STORAGE_KEYS.plainMasterKey);
    return {key: fresh, protection: 'hardware', created: true};
  }

  const existing = bootstrap.getString(STORAGE_KEYS.plainMasterKey);
  if (existing !== undefined) {
    return {key: existing, protection: 'software', created: false};
  }

  const fresh = encodeBase64(randomBytes(MASTER_KEY_BYTES));
  bootstrap.set(STORAGE_KEYS.plainMasterKey, fresh);
  bootstrap.set(STORAGE_KEYS.keyProtection, 'software');
  return {key: fresh, protection: 'software', created: true};
}

/**
 * Destroys the master key. This is the operation panic wipe actually depends
 * on; clearing the vault afterwards is housekeeping.
 *
 * Best-effort by design: it removes every copy it can reach and does not abort
 * partway if one step fails, because a partial wipe that got rid of the
 * Keystore alias is still a successful wipe.
 */
export async function destroyMasterKey(
  bootstrap: KeyValueBackend,
  wrapper: KeyWrapper | null,
): Promise<{hardwareKeyDestroyed: boolean; errors: string[]}> {
  const errors: string[] = [];
  let hardwareKeyDestroyed = false;

  if (wrapper) {
    try {
      await wrapper.destroyWrappingKey();
      hardwareKeyDestroyed = true;
    } catch (err) {
      errors.push(
        `Keystore alias not destroyed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  for (const key of [
    STORAGE_KEYS.wrappedMasterKey,
    STORAGE_KEYS.plainMasterKey,
    STORAGE_KEYS.keyProtection,
  ]) {
    try {
      bootstrap.delete(key);
    } catch (err) {
      errors.push(
        `Failed to delete ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return {hardwareKeyDestroyed, errors};
}

/** What the last successful key load reported. Used by the UI's status line. */
export function readKeyProtection(
  bootstrap: KeyValueBackend,
): KeyProtection | null {
  const value = bootstrap.getString(STORAGE_KEYS.keyProtection);
  return value === 'hardware' || value === 'software' ? value : null;
}
