/**
 * Storage bootstrap — opens the two stores and loads the device identity.
 *
 * Called once from the splash screen, which is exactly what CONTEXT.md asks
 * for: the splash is a real initialisation step, not a timed delay.
 */

import {loadOrCreateKeyPair, publicKeyFingerprint} from '../crypto/keys';
import type {DeviceKeyPair} from '../crypto/keys';
import {voxKeystore} from '../native/VoxKeystore';
import {createBootstrapBackend, createVaultBackend} from './mmkvBackend';
import {loadOrCreateMasterKey} from './masterKey';
import {panicWipe, type WipeReport} from './panicWipe';
import type {KeyProtection, KeyValueBackend} from './types';
import {Vault, asKeyStorage} from './vault';

export interface StorageContext {
  vault: Vault;
  keyPair: DeviceKeyPair;
  /** Short, comparable string shown in the UI. */
  fingerprint: string;
  protection: KeyProtection;
  /** True when this launch produced a brand new identity. */
  freshIdentity: boolean;
  wipe(memoryResets?: Array<() => void>): Promise<WipeReport>;
}

let cached: StorageContext | null = null;

export async function initStorage(): Promise<StorageContext> {
  if (cached) return cached;

  const bootstrap: KeyValueBackend = createBootstrapBackend();
  const master = await loadOrCreateMasterKey(bootstrap, voxKeystore);
  const vaultBackend: KeyValueBackend = createVaultBackend(master.key);

  const keyPair = loadOrCreateKeyPair(asKeyStorage(vaultBackend));

  cached = {
    vault: new Vault(vaultBackend),
    keyPair,
    fingerprint: publicKeyFingerprint(keyPair.publicKey),
    protection: master.protection,
    freshIdentity: master.created,
    wipe: async memoryResets => {
      const report = await panicWipe({
        vault: vaultBackend,
        bootstrap,
        wrapper: voxKeystore,
        memoryResets,
      });
      // Drop the cache so the next initStorage() rebuilds from nothing. Without
      // this the app would keep serving the old in-memory vault handle, and a
      // wipe would look like it had not happened until the process restarted.
      cached = null;
      return report;
    },
  };

  return cached;
}

/** Test/dev seam: forget the cached context without wiping anything. */
export function resetStorageCache(): void {
  cached = null;
}

export {Vault, VAULT_KEYS, asKeyStorage} from './vault';
export {MemoryBackend} from './memoryBackend';
export type {WipeReport} from './panicWipe';
export type {KeyProtection, KeyValueBackend, KeyWrapper} from './types';
