/**
 * Who this device is, as far as the UI is concerned.
 *
 * Two separate things live here and it is worth keeping them straight:
 *
 *   nickname     A label the user picked. Changeable, meaningless to the
 *                protocol, and the only thing other people see.
 *   fingerprint  A short form of the Ed25519 public key — the actual identity
 *                the mesh verifies against.
 *
 * CONTEXT.md draws this distinction explicitly, and it matters for the pitch:
 * two people can pick the same nickname and it changes nothing, because
 * signatures are checked against keys.
 */

import {create} from 'zustand';
import type {KeyProtection} from '../storage/types';
import {VAULT_KEYS, type Vault} from '../storage/vault';
import {hashPin, makeSalt, verifyPin} from './pin';

interface IdentityState {
  nickname: string | null;
  fingerprint: string | null;
  protection: KeyProtection | null;
  onboardingComplete: boolean;
  pinSet: boolean;
  /** True once hydrate() has run, so screens do not flash the wrong state. */
  hydrated: boolean;

  hydrate(vault: Vault, identity: {fingerprint: string; protection: KeyProtection}): void;
  setNickname(vault: Vault, nickname: string): void;
  setPin(vault: Vault, pin: string): void;
  clearPin(vault: Vault): void;
  checkPin(vault: Vault, pin: string): boolean;
  completeOnboarding(vault: Vault): void;
  reset(): void;
}

const EMPTY = {
  nickname: null,
  fingerprint: null,
  protection: null,
  onboardingComplete: false,
  pinSet: false,
  hydrated: false,
} as const;

export const useIdentityStore = create<IdentityState>((set, get) => ({
  ...EMPTY,

  hydrate: (vault, identity) => {
    set({
      nickname: vault.getString(VAULT_KEYS.nickname) ?? null,
      fingerprint: identity.fingerprint,
      protection: identity.protection,
      onboardingComplete: vault.getBoolean(VAULT_KEYS.onboardingComplete),
      pinSet: vault.getString(VAULT_KEYS.pinHash) !== undefined,
      hydrated: true,
    });
  },

  setNickname: (vault, nickname) => {
    const trimmed = nickname.trim().slice(0, 20);
    vault.setString(VAULT_KEYS.nickname, trimmed);
    set({nickname: trimmed});
  },

  setPin: (vault, pin) => {
    // A fresh salt every time the PIN is set, so changing it does not leave
    // the old hash comparable to the new one.
    const salt = makeSalt();
    vault.setString(VAULT_KEYS.pinSalt, salt);
    vault.setString(VAULT_KEYS.pinHash, hashPin(pin, salt));
    set({pinSet: true});
  },

  clearPin: vault => {
    vault.delete(VAULT_KEYS.pinHash);
    vault.delete(VAULT_KEYS.pinSalt);
    set({pinSet: false});
  },

  checkPin: (vault, pin) => {
    const hash = vault.getString(VAULT_KEYS.pinHash);
    const salt = vault.getString(VAULT_KEYS.pinSalt);
    if (hash === undefined || salt === undefined) return true;
    return verifyPin(pin, salt, hash);
  },

  completeOnboarding: vault => {
    vault.setBoolean(VAULT_KEYS.onboardingComplete, true);
    set({onboardingComplete: true});
  },

  // Called by panic wipe. Deliberately returns to the pre-hydration state so
  // the app routes back to onboarding rather than showing a half-empty
  // dashboard belonging to an identity that no longer exists.
  reset: () => {
    set({...EMPTY});
    void get;
  },
}));
