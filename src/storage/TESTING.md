# Testing — `src/storage`

Panic wipe is the feature in this app whose failure has the worst consequences
for a real user. It gets the most testing, and the parts that cannot be
automated get a checklist precise enough for someone else to run.

## Automated

```bash
npx jest src/storage
```

47 assertions across three files:

| File | Covers |
|---|---|
| `__tests__/masterKey.test.ts` | Key creation, persistence, hardware vs. software protection, recovery from a destroyed or corrupt key |
| `__tests__/panicWipe.test.ts` | The full wipe, its ordering guarantee, partial-failure behaviour, idempotence, and identity regeneration |
| `__tests__/vault.test.ts` | Typed accessors, corrupt-JSON recovery, the `crypto/keys.ts` adapter |

The one worth reading if you only read one:

> `destroys the key before clearing data, so an interrupted wipe is still safe`

It asserts the *order* of operations, not just the end state. If someone later
"tidies" `panicWipe.ts` by clearing data first, every other test still passes
and that one fails. The reasoning is in the file header — an interrupted wipe
that cleared rows but left the key intact has achieved nothing, because deleted
rows are recoverable and the key still decrypts them.

## Not automated, and why

`mmkvBackend.ts` has no test file. There is no MMKV in a test runner, so a test
would only prove that a mock behaves like the mock. Same for `VoxKeystore` —
there is no TEE inside Node. Both are verified by hand below.

## Manual checklist

Needs one real Android device. No second phone and no mesh required — this is
all local. Roughly ten minutes.

### 1. Encryption is actually on

1. Install a debug build and complete onboarding with nickname `WipeTest-1`.
2. Send or receive at least one mesh message so the vault is not empty.
3. Pull the vault file off the device:
   ```bash
   adb exec-out run-as com.vox cat files/mmkv/vox.vault > /tmp/vault.bin
   ```
4. Search it for the nickname:
   ```bash
   strings /tmp/vault.bin | grep -i wipetest
   ```

**Pass**: no match. The nickname is in there, but encrypted.
**Fail**: the nickname appears in plaintext — the vault was opened without an
encryption key. Check `createVaultBackend` is being used rather than a bare
`new MMKV()`.

### 2. Key protection level is reported honestly

On the Safety Center screen, the storage line should read **Hardware-backed
(TEE)** on any modern handset.

If it reads **Software**, that is not necessarily a bug — emulators and some
OEM builds have no usable Keystore. It is only a bug if it says *hardware* on a
device where the Keystore is absent, because that would be the app overstating
its own protection. Confirm against:

```bash
adb shell dumpsys package com.vox | grep -i keystore
```

### 3. Panic wipe destroys the identity

1. Note the key fingerprint shown on the Safety Center screen.
2. Trigger panic wipe (hold the button, or shake the device three times).
3. Confirm the wipe screen reports `0 records remaining`.
4. **Force-stop the app** — do not just background it:
   ```bash
   adb shell am force-stop com.vox
   ```
5. Reopen it.

**Pass**: the app starts at onboarding, asks for a nickname again, and the
fingerprint after re-onboarding is **different** from the one in step 1.
**Fail**: the old nickname or fingerprint returns — the key was not destroyed,
or something is caching identity outside the vault.

### 4. The wipe survives being interrupted

The property the ordering guarantee exists for.

1. Set up a populated device as in step 1.
2. Trigger the wipe and force-stop the app **within about a second**, while it
   is still running:
   ```bash
   adb shell am force-stop com.vox
   ```
3. Reopen.

**Pass**: onboarding, new identity. Even if some rows survived the interruption,
the key went first, so nothing readable remains.
**Fail**: the previous session's messages are visible.

### 5. Wiped data does not come back from a backup

1. Wipe as above.
2. ```bash
   adb backup -f /tmp/vox.ab com.vox
   ```

**Pass**: the backup is empty or refused. `android:allowBackup="false"` and
`data_extraction_rules.xml` should prevent it entirely.
**Fail**: a backup containing vault data — that would be a copy of the data
sitting somewhere panic wipe cannot reach, which makes the wipe a lie.

## Known gaps

- **Flash is not physically erased.** Destroying the key is what makes the data
  unreadable; the ciphertext may well remain in unmapped flash pages. On a
  device with hardware key protection this is fine — the key was never in flash
  to begin with. On a `software` device it is a genuine, stated limitation.
- **No test covers MMKV's own encryption.** We trust MMKV's AES implementation;
  step 1 above is the check that it is switched on at all.
- **A screenshot or screen recording taken by another app** is outside this
  app's control entirely.
