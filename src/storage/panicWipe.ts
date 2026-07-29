/**
 * Panic wipe.
 *
 * CONTEXT.md risk #6: "deleting database rows without destroying the
 * encryption key leaves data forensically recoverable". So the ordering here
 * is not incidental, it is the whole design:
 *
 *   1. Destroy the master key.
 *   2. Only then clear the data.
 *
 * Consider the wipe being interrupted halfway — the phone is taken, the
 * battery dies, the user is grabbed. If data were cleared first, an
 * interruption would leave the key intact next to recoverable deleted rows,
 * and the wipe would have achieved nothing. Destroying the key first means
 * that from step 1 onward every byte in the vault is permanently unreadable,
 * whatever happens next. Everything after step 1 is housekeeping.
 *
 * For the same reason nothing here throws or short-circuits. A wipe that got
 * partway is still a wipe, and the caller gets a report describing exactly how
 * far it got.
 */

import {destroyMasterKey} from './masterKey';
import type {KeyValueBackend, KeyWrapper} from './types';

export interface WipeTargets {
  /** The encrypted store holding messages, pins, nickname, device keypair. */
  vault: KeyValueBackend;
  /** The unencrypted store holding the wrapped master key. */
  bootstrap: KeyValueBackend;
  /** Android Keystore binding, or null on devices without one. */
  wrapper: KeyWrapper | null;
  /**
   * In-memory state that survives storage being cleared: the relay's seen-id
   * set, zustand stores, decoded chat history held by React. Data still on
   * screen after a "wipe" would be the most visible possible failure.
   */
  memoryResets?: Array<() => void>;
}

export interface WipeReport {
  /** True only when every step completed without error. */
  success: boolean;
  /** The one that matters: is the master key gone? */
  keyDestroyed: boolean;
  /** Whether the TEE-backed wrapping key was destroyed too. */
  hardwareKeyDestroyed: boolean;
  vaultKeysRemaining: number;
  bootstrapKeysRemaining: number;
  durationMs: number;
  errors: string[];
}

export async function panicWipe(
  targets: WipeTargets,
  now: () => number = Date.now,
): Promise<WipeReport> {
  const startedAt = now();
  const errors: string[] = [];

  // --- Step 1: the key. Everything else is optional; this is not. ---
  const keyResult = await destroyMasterKey(targets.bootstrap, targets.wrapper);
  errors.push(...keyResult.errors);
  const keyDestroyed = keyResult.errors.length === 0;

  // --- Step 2: the data, best effort. ---
  for (const [label, store] of [
    ['vault', targets.vault],
    ['bootstrap', targets.bootstrap],
  ] as const) {
    try {
      store.clearAll();
    } catch (err) {
      errors.push(
        `Failed to clear ${label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // --- Step 3: anything still held in memory. ---
  for (const reset of targets.memoryResets ?? []) {
    try {
      reset();
    } catch (err) {
      errors.push(
        `In-memory reset failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Read the stores back rather than assuming clearAll worked. The wipe
  // confirmation screen shows these counts, and a number the app actually
  // measured is worth more than one it hoped for.
  const vaultKeysRemaining = countKeys(targets.vault, errors, 'vault');
  const bootstrapKeysRemaining = countKeys(
    targets.bootstrap,
    errors,
    'bootstrap',
  );

  return {
    success: errors.length === 0,
    keyDestroyed,
    hardwareKeyDestroyed: keyResult.hardwareKeyDestroyed,
    vaultKeysRemaining,
    bootstrapKeysRemaining,
    durationMs: now() - startedAt,
    errors,
  };
}

function countKeys(
  store: KeyValueBackend,
  errors: string[],
  label: string,
): number {
  try {
    return store.getAllKeys().length;
  } catch (err) {
    errors.push(
      `Could not verify ${label} is empty: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return -1;
  }
}
