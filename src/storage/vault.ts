/**
 * Typed access to the encrypted store.
 *
 * Everything the app persists goes through here, so there is exactly one list
 * of what VOX keeps on a device — which is a list you want to be able to read
 * in one screenful when someone asks "what does this app store about me?".
 *
 * Note what is absent: no phone number, no email, no contacts, no hardware
 * identifier, no analytics, no crash reports. The nickname is a label the user
 * chose and can change; the keypair is the only actual identity, and panic
 * wipe destroys it.
 */

import type {KeyStorage} from '../crypto/keys';
import type {KeyValueBackend} from './types';

export const VAULT_KEYS = {
  nickname: 'vox.identity.nickname',
  /** PBKDF-style hash of the optional 4-digit PIN. Never the PIN itself. */
  pinHash: 'vox.identity.pinHash',
  pinSalt: 'vox.identity.pinSalt',
  onboardingComplete: 'vox.onboarding.complete',
  /** Mesh messages seen or sent, most recent last. */
  messages: 'vox.mesh.messages',
  /** Danger-zone reports received over the mesh. */
  dangerPins: 'vox.mesh.dangerPins',
} as const;

export class Vault {
  constructor(private readonly backend: KeyValueBackend) {}

  getString(key: string): string | undefined {
    return this.backend.getString(key);
  }

  setString(key: string, value: string): void {
    this.backend.set(key, value);
  }

  delete(key: string): void {
    this.backend.delete(key);
  }

  /**
   * Reads and parses JSON, falling back to `fallback` if the value is missing
   * or corrupt. Corrupt persisted state must never be able to prevent the app
   * from starting — a user reaching for this app is not in a position to
   * troubleshoot it.
   */
  getJSON<T>(key: string, fallback: T): T {
    const raw = this.backend.getString(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.backend.delete(key);
      return fallback;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.backend.set(key, JSON.stringify(value));
  }

  getBoolean(key: string): boolean {
    return this.backend.getString(key) === 'true';
  }

  setBoolean(key: string, value: boolean): void {
    this.backend.set(key, value ? 'true' : 'false');
  }

  keys(): string[] {
    return this.backend.getAllKeys();
  }
}

/**
 * Adapts a KeyValueBackend to the KeyStorage shape `crypto/keys.ts` expects.
 *
 * That module was written before this one and defines its own minimal storage
 * interface, deliberately, so it stays testable in isolation. Rather than
 * change a module that is already built and tested, the adapter lives here.
 */
export function asKeyStorage(backend: KeyValueBackend): KeyStorage {
  return {
    getItem: key => backend.getString(key) ?? null,
    setItem: (key, value) => backend.set(key, value),
    removeItem: key => backend.delete(key),
  };
}
