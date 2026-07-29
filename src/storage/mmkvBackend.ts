/**
 * MMKV bindings. The only file in src/storage that imports React Native.
 *
 * Two separate MMKV instances, which is the part worth understanding:
 *
 *   bootstrap  Unencrypted, and holds exactly one secret-adjacent thing — the
 *              *wrapped* master key. It cannot itself be encrypted, because
 *              something has to be readable before any key is available. On a
 *              device with a Keystore, its contents are useless without the
 *              TEE.
 *
 *   vault      Encrypted with the master key. Everything else lives here.
 *
 * There is no test file for this module. There is no MMKV inside a test
 * runner, so a test would only prove a mock works. It is verified by the
 * manual checklist in TESTING.md instead, which is the honest place for it.
 */

import {MMKV} from 'react-native-mmkv';
import type {KeyValueBackend} from './types';

export const BOOTSTRAP_INSTANCE_ID = 'vox.bootstrap';
export const VAULT_INSTANCE_ID = 'vox.vault';

/** Wraps an MMKV instance in the KeyValueBackend shape the rest of src/ uses. */
export function wrapMMKV(instance: MMKV): KeyValueBackend {
  return {
    getString: key => instance.getString(key),
    set: (key, value) => instance.set(key, value),
    delete: key => instance.delete(key),
    getAllKeys: () => instance.getAllKeys(),
    clearAll: () => instance.clearAll(),
  };
}

export function createBootstrapBackend(): KeyValueBackend {
  return wrapMMKV(new MMKV({id: BOOTSTRAP_INSTANCE_ID}));
}

/**
 * Opens the encrypted vault.
 *
 * MMKV takes the encryption key at open time and encrypts everything written
 * through it. Panic wipe destroys that key, at which point the files left on
 * disk are ciphertext nobody — including this app — can read.
 */
export function createVaultBackend(masterKeyBase64: string): KeyValueBackend {
  return wrapMMKV(
    new MMKV({
      id: VAULT_INSTANCE_ID,
      encryptionKey: masterKeyBase64,
    }),
  );
}
