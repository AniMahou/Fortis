# Testing — `src/mesh`

Covers `packet.ts` (packet schema, signing, serialization) and `relay.ts`
(dedupe + rebroadcast decision logic). This is the one module in the whole
app with **zero hardware dependency** — no BLE, no GPS, no native modules —
so it's the one module that gets full automated coverage. Everything else
(`advertiser.ts`, `scanner.ts`, GPS, map) is unit-tested where the logic is
pure and manually tested where it touches a radio or sensor — see the bottom
of this file.

## Running the automated tests

```bash
npm install          # first time only
npm test             # run once
npm run test:watch   # re-run on save, useful while building a new feature
npm run test:coverage
```

Current state: **19/19 passing**, 91.7% statement coverage on this module
(`relay.ts` at 100%, `packet.ts` at 88% — the uncovered lines are
JSON-parse edge cases, see coverage report for exact line numbers).

### ⚠️ If `npm test` fails with a ts-jest / TypeScript error on a fresh machine
`ts-jest` isn't compatible with the newest TypeScript major version as of
this writing (it expects the classic compiler API, not the newer native one).
If you hit an error mentioning `does not expose the JavaScript compiler API`,
pin TypeScript:
```bash
npm install --save-dev typescript@5.6.3
```
Better to hit this now, on a laptop, than on a teammate's machine the night
before demo.

## What's actually being verified

**`packet.test.ts`**
- `createPacket` fills in sane defaults (ttl, timestamp) and signs the
  *canonical* form, not the raw payload object
- `canonicalize` is order-independent — a payload with keys in any order
  produces the same string, which matters because the sender and every
  relaying phone must agree on exactly what was signed
- `decrementTtl` / `isExpired` — the hop-counting logic that makes a
  packet eventually stop propagating
- `serializePacket` → `deserializePacket` round-trips to an identical
  object (this is the wire format every phone actually sends/receives)
- `deserializePacket` **fails closed** on malformed input — invalid JSON,
  missing fields, or an unknown `type` all throw `InvalidPacketError`
  rather than producing a half-valid packet. A malformed or hostile
  payload from a nearby stranger's phone must never crash the relay loop.

**`relay.test.ts`** — this is the one that matters most for demo day:
- First time seeing a packet → display it, rebroadcast it
- **Duplicate packet → do neither.** This single check is what stops a
  crowded mesh from turning into a rebroadcast storm (5 phones hearing
  the same packet only ever produces 1 rebroadcast — see the explicit
  "storm" test)
- A packet that's run out of hops still displays locally but doesn't
  travel further
- Old packet ids are forgotten after `seenTtlMs`, so memory doesn't grow
  forever on a phone left running for hours
- `reset()` clears all relay memory — this is what panic wipe calls

## What is *not* covered here (and why)

`advertiser.ts` and `scanner.ts` (not yet built) wrap native BLE APIs —
there's no radio in a Jest test, so these get integration-level logic
tests only (e.g. "does the payload we hand to the advertiser match what
`createPacket` produced") plus a **manual test procedure**, documented in
`src/mesh/MANUAL_TESTING.md` once those files exist. The pattern to copy for
every other feature module:

| Module | Automated (Jest) | Manual (real devices) |
|---|---|---|
| `mesh/packet.ts`, `mesh/relay.ts` | ✅ full coverage | — |
| `mesh/advertiser.ts`, `mesh/scanner.ts` | payload shape only | ✅ 2-phone broadcast/receive check |
| `crypto/keys.ts`, `crypto/sign.ts` | ✅ full coverage | — |
| `screens/real/SOS` (GPS capture) | ✅ packet construction from a mocked location | ✅ real GPS fix outdoors |
| `screens/real/DangerMap` (map render) | ✅ pin-placement logic from a mocked packet | ✅ visual check on device |
| `screens/real/PanicWipe` | ✅ assert storage + keys are gone after wipe() | ✅ confirm app restart shows no data |

Every feature folder gets its own `TESTING.md` following this same shape:
what's automated, how to run it, and — where hardware is involved — a
numbered manual procedure a teammate can follow without you in the room.
