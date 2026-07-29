/**
 * The optional 4-digit PIN.
 *
 * **What this actually protects against, stated plainly:** someone picking up
 * an unlocked phone and opening the app. That is all.
 *
 * A 4-digit PIN has ten thousand possible values. Anyone who can read the
 * stored hash can try all ten thousand, and iteration count only changes how
 * long that takes — not whether it succeeds. So this is a screen lock, not
 * encryption, and the UI says so rather than showing a padlock that implies
 * more than it delivers.
 *
 * What genuinely protects the data is the master key in `storage/masterKey.ts`,
 * which is 256 bits, hardware-wrapped where possible, and destroyed by panic
 * wipe. The PIN is not part of that and deliberately does not gate it — an app
 * that could not start until someone typed four digits correctly would be
 * useless to a person who is running.
 */

import nacl from 'tweetnacl';
import {decodeUTF8, encodeBase64} from 'tweetnacl-util';

export const PIN_LENGTH = 4;

/**
 * Iterated SHA-512. Enough to make a stolen hash annoying to brute-force
 * offline, low enough that unlocking is not a visible wait on a cheap phone —
 * roughly 200ms on mid-range hardware.
 */
export const DEFAULT_ITERATIONS = 20_000;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function makeSalt(
  randomBytes: (length: number) => Uint8Array = nacl.randomBytes,
): string {
  return encodeBase64(randomBytes(16));
}

export function hashPin(
  pin: string,
  salt: string,
  iterations: number = DEFAULT_ITERATIONS,
): string {
  let digest = decodeUTF8(`vox.pin.v1:${salt}:${pin}`);
  for (let i = 0; i < iterations; i++) {
    digest = nacl.hash(digest);
  }
  return encodeBase64(digest);
}

/**
 * Compares in constant time relative to the hash contents.
 *
 * Timing analysis is not a realistic attack on a local PIN screen, but the
 * comparison is one line either way and the habit is worth keeping in a
 * codebase where other comparisons will matter more.
 */
export function verifyPin(
  pin: string,
  salt: string,
  expectedHash: string,
  iterations: number = DEFAULT_ITERATIONS,
): boolean {
  if (!isValidPin(pin)) return false;
  const actual = hashPin(pin, salt, iterations);
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) {
    difference |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return difference === 0;
}
