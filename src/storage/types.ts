/**
 * The storage seam.
 *
 * Everything above this line is pure logic that can be tested on a laptop;
 * everything below it is MMKV and the Android Keystore. That split is the
 * whole point — panic wipe is the feature this app's users' safety depends on
 * most, and it would be unacceptable for its correctness to rest on "we ran it
 * once on a phone and it looked fine".
 */

/** A synchronous string key-value store. MMKV satisfies this; so does a Map. */
export interface KeyValueBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
}

/**
 * Hardware-backed key wrapping, implemented by VoxKeystoreModule.
 *
 * Optional by design: `isAvailable()` is allowed to return false, and the app
 * degrades to storing the master key directly with a weaker and clearly
 * reported guarantee rather than refusing to run.
 */
export interface KeyWrapper {
  isAvailable(): Promise<boolean>;
  wrapKey(keyBase64: string): Promise<string>;
  unwrapKey(blobBase64: string): Promise<string>;
  destroyWrappingKey(): Promise<void>;
  hasWrappingKey(): Promise<boolean>;
}

/**
 * How well the master key is actually protected on this device. Surfaced in
 * the UI: a user deciding whether to carry this phone into a protest deserves
 * to know which of these they have, rather than being shown a padlock icon
 * that means nothing.
 */
export type KeyProtection =
  /** Wrapped by a non-extractable key in the TEE. Wipe is irreversible. */
  | 'hardware'
  /** Stored directly. A wipe deletes it, but offers no defence against
   *  forensic recovery of the flash. */
  | 'software';

export const STORAGE_KEYS = {
  /** The wrapped master key blob, in the bootstrap (unencrypted) store. */
  wrappedMasterKey: 'vox.master.wrapped.v1',
  /** The raw master key, only when no hardware wrapping is available. */
  plainMasterKey: 'vox.master.plain.v1',
  /** Which of the two paths above produced the current key. */
  keyProtection: 'vox.master.protection.v1',
} as const;
