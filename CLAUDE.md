@CONTEXT.md

# VOX — July Revolution Hackathon (Track A: Crisis Tech)

> The line above imports CONTEXT.md in full — the complete hackathon
> narrative, screen-by-screen breakdown, design system, every known risk,
> and the phased execution plan with hard-stop checkpoints. Everything
> below this point is a concise index on top of that; CONTEXT.md is the
> authoritative source of detail.

Mesh-based crisis communication app. Theme: Bangladesh's July Revolution /
internet shutdown. Real precedents: WarpChat (BDIX local server during the
2024 blackout), Bitchat (BLE mesh, adopted during Nepal's 2025 protests).

Tagline: "When the infrastructure fails, the people's voice never will."

## Scope (already decided — don't silently re-expand it)
Time-constrained hackathon. Cut down from a much larger original spec to:
- **Real, functional, tested**: anonymous registration, BLE text relay with
  visible hop count, SOS button (GPS + broadcast), one danger pin on a map,
  panic wipe
- **Mocked**: group chat, verified feed, media archive, misinformation
  reporting — these exist as Stitch-designed static screens, narrated over
  in the demo video. This was a deliberate, considered tradeoff, not a
  shortcut to "fix later." Don't add real logic to these without asking.

## Tech stack and why
- React Native CLI (bare), **Android-only** for the demo — not Expo Go: BLE
  peripheral mode needs native modules Expo Go doesn't expose
- BLE central/scan: `react-native-ble-plx` (mature, actively maintained)
- BLE peripheral/advertise: `react-native-ble-advertiser` — **unverified in
  this project**, last published 2022, single maintainer. See Known Risks.
- Maps: `react-native-maps` · Storage: `react-native-mmkv` · State: `zustand`
- Crypto: `tweetnacl` + `tweetnacl-util` — deliberately NOT `crypto-js`,
  which has no built-in key exchange (can't let two strangers' phones agree
  on a shared secret with no server)
- Anonymous ID: `react-native-uuid`, a random UUID stored locally — NEVER
  `react-native-device-info` or any hardware identifier. Using a hardware ID
  would quietly break the "anonymous, no persistent identifier" privacy
  claim this whole app is supposed to make.

## Known risks — read before touching mesh/advertiser.ts or mesh/scanner.ts
Every RN library for BLE **advertising** (`react-native-ble-advertiser`,
`react-native-ble-peripheral`, `react-native-peripheral`) was last published
in 2022. BLE **scanning** libraries (`ble-plx`, `ble-manager`) are fine and
actively maintained. The advertise/peripheral side is the single biggest
unknown in this project.

**Before building advertiser.ts/scanner.ts for real**: spike it on 2 real
Android phones — confirm one can broadcast custom data the other's scanner
picks up. Half a day, non-negotiable, before more code goes on top of it.

**Fallback if the spike fails**: local WiFi-hotspot relay (one phone hosts a
small local server, others join the hotspot) instead of BLE broadcast — same
"no internet required" claim, less "meshy," much more reliable. This is
literally what WarpChat did during the real 2024 blackout.

iOS is out of scope for the demo — background BLE restrictions aren't worth
fighting under this deadline.

## Testing convention — apply to every new module
Every feature gets three things together, not tests bolted on after:
1. The code
2. `__tests__/*.test.ts` with real Jest tests — **only** for hardware-free
   logic (packet formats, relay/dedupe, crypto, storage wipe). There is no
   automated test for BLE/GPS/camera; no radio or sensor exists in a test
   runner.
3. `TESTING.md` in the same folder: what's automated + how to run it, plus
   a manual checklist for anything hardware-dependent, written so a
   teammate can run it without the original author present.

Reference implementation already built this way: `src/mesh/` (19 tests) and
`src/crypto/` (17 tests) — 36/36 passing, ~94% coverage. Copy this pattern
exactly for `advertiser.ts`, `scanner.ts`, `storage/mmkv.ts`, and each screen.

## Design system (Stitch export)
Monochrome + a single red accent reserved for emergency actions only.
Primary `#1A1A1A`, Emergency `#C8102E`, Inter font, 8px corner radius. Full
tokens in `vox_mesh_narrative/DESIGN.md` if that folder was imported. Stitch
screens export as HTML/Tailwind — port to RN manually (View/Text/
StyleSheet), they do not run as-is.

## Current status

The app is built end to end. **320 tests pass, 93% coverage over the
hardware-independent core**, typecheck clean, Metro bundles.

- [x] `mesh/` — packet, relay, binary wire format, chunking, frame scheduler,
      meshService, three transports
- [x] `crypto/` — device identity, sign/verify
- [x] `storage/` — encrypted MMKV vault, hardware-wrapped master key, panic wipe
- [x] All 7 onboarding screens, all 5 real features, all 4 mocked screens
- [x] Both Plan A (BLE) and Plan B (WiFi hub), selected by `VOX_MESH_TRANSPORT`
- [ ] **BLE hardware spike — `docs/BLE_SPIKE.md`. Still the hard stop.**
      Needs two real Android phones. Everything above it is proven in software
      against a simulated mesh; this is what proves the radio.
- [ ] Three-phone relay test — `src/mesh/TESTING.md` M3
- [ ] Record the demo — `docs/DEMO_SCRIPT.md`

Two things worth knowing before touching the code:

1. **`ttl` must never go back into `canonicalize()`.** It was there, and it
   silently broke multi-hop relay — every relay decrements ttl, so a packet
   verified at its origin and failed everywhere after. There is a regression
   test in `relay.test.ts`.
2. **Implementation choices that depart from this file are in
   `docs/DECISIONS.md`**, with reasoning — the BLE libraries, the map, the
   end-to-end-encryption claim, and `senderId`.

## Reference docs (read these when relevant, don't duplicate them here)
- `docs/FALLBACKS.md` — full BLE spike procedure, payload-size gotchas,
  and the Plan A/B/C decision tree if the spike doesn't go cleanly
- `docs/SCREEN_MAP.md` — which of the 16 Stitch-designed screens are real
  vs. mocked, including a few split/dual-use judgment calls
- `docs/design/DESIGN_TOKENS.md` — colors, type, spacing from the Stitch
  export
- `docs/design/screens/<name>/code.html` — exact markup per screen, port
  to RN components, don't run as-is

## Commands
```bash
npm test              # all tests
npm run test:coverage
npx jest src/mesh      # one module
```
If `npm test` fails with a ts-jest/TypeScript error, pin `typescript@5.6.3`
— newer majors aren't compatible with ts-jest yet as of this project.
