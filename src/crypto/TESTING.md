# Testing — `src/crypto`

Covers `keys.ts` (device keypair generation, persistence, destruction) and
`sign.ts` (signing/verifying mesh packets). Like `src/mesh`, this has zero
hardware dependency — pure crypto math and an injected storage interface —
so it's fully automated.

## Running the automated tests

```bash
npm test                                    # whole project
npx jest src/crypto                         # just this module
npx jest src/crypto --coverage
```

Current state: **17/17 passing**, 97.5% statement coverage.

## What's actually being verified

**`keys.test.ts`**
- Generated keys are the correct Ed25519 sizes (32-byte public, 64-byte secret)
- Two calls to `generateKeyPair()` never collide
- Serialize → deserialize round-trips to an identical keypair
- **First launch**: empty storage → a new keypair is generated *and persisted*
- **Every launch after**: the same stored keypair is returned, never silently
  regenerated (this matters — a device's identity shouldn't change on its own,
  people relying on "I recognize this fingerprint" would be misled)
- **Corrupted storage** (e.g. a botched app update) regenerates a fresh key
  instead of crashing app startup
- **`destroyKeyPair` (the panic-wipe target)** actually removes the stored
  key, and the next `loadOrCreateKeyPair` call produces a provably different
  key — this is the test that matters most: it's the difference between
  "panic wipe deletes messages" and "panic wipe deletes your identity"

**`sign.test.ts`**
- Valid signature → verifies true
- Tampered message → verifies false
- Right signature, wrong public key → verifies false (this is what stops a
  relaying phone from forging a message as if it came from someone else)
- Garbage/malformed signature string → fails closed, never throws (a relay
  loop processing packets from strangers' phones cannot crash on bad input)
- Deterministic: same message + same key → same signature every time (an
  Ed25519 property, useful for sanity-checking your own implementation)

## What still needs a manual check once this is wired into the app
- Confirm `loadOrCreateKeyPair` is only ever called **once**, at app start,
  and the result is kept in memory/state rather than re-read from storage on
  every packet — re-reading per-packet works but is wasteful
- After triggering Panic Wipe on a real device: force-quit and reopen the
  app, confirm the nickname/fingerprint shown is different from before the
  wipe (this is the actual user-visible proof the wipe worked, worth a line
  in the demo script)
