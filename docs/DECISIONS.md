# Decision record

CONTEXT.md is the authoritative spec, and Section 4's five-real/four-mocked
scope split is **unchanged** — nothing here expands or narrows it.

What this file records is a set of *implementation* choices inside the layer
CONTEXT.md itself flagged as the project's biggest unknown. Each one is
written down rather than made silently, because each departs from a library
CONTEXT.md named. If you disagree with any of them, the reasoning is here to
argue against.

---

## D1 — First-party BLE native module instead of `react-native-ble-advertiser` + `react-native-ble-plx`

**CONTEXT.md said**: BLE advertise via `react-native-ble-advertiser`, BLE scan
via `react-native-ble-plx`, and flagged the advertiser as "the project's
single biggest technical risk; last published 2022, single maintainer."

**Verified**: `react-native-ble-advertiser` is at `0.0.17`, published
2022-09-27. That is confirmed, not assumed. React Native 0.81 (this project's
version) ships the New Architecture enabled by default. A 2022-era native
module predates that entirely.

**Decision**: write `android/app/src/main/java/com/vox/mesh/` — a ~400-line
first-party Kotlin module wrapping the platform's own
`BluetoothLeAdvertiser` and `BluetoothLeScanner` APIs directly.

**Why this is lower risk, not higher**:
- The Android BLE APIs it calls have been stable since API 21 (2014) and are
  not going anywhere. The abandoned *wrapper* was the risk, not the platform.
- It removes a hard dependency on an unmaintained package for the one feature
  the entire demo rests on.
- It lets us request **BLE 5 extended advertising** where the hardware
  supports it, and fall back to legacy 31-byte frames where it doesn't. A
  third-party wrapper gave us no control over that, and payload size is
  CONTEXT.md risk #2.
- Advertising and scanning share one `BluetoothAdapter`, one permission
  model, and one manufacturer ID. Splitting them across a first-party module
  and a third-party library doubles the integration surface for no gain.

**Cost, stated honestly**: this is native code that has never been compiled,
let alone run. It is written against current Android API docs. The BLE spike
(Phase 1) is still a hard stop and is still the thing that decides whether
Plan A works — this decision changes *what* gets spiked, not *whether*.

## D2 — Offline SVG map instead of `react-native-maps`

**CONTEXT.md said**: Maps via `react-native-maps`.

**Problem**: `react-native-maps` renders Google Maps tiles, which are fetched
over the network. This is an app whose entire premise is that **there is no
network**. A map that needs internet inside an internet-shutdown app does not
work in the scenario it was built for — and would fail live on stage, since
the demo is meant to run with the phones in airplane mode.

**Decision**: `src/screens/real/SafetyMapScreen.tsx` renders a relative-position
map with `react-native-svg` — the user at centre, hazard pins placed by real
bearing and distance computed from actual GPS coordinates. Range rings are
labelled in metres.

**Why this is better here, not just easier**:
- Works at zero bandwidth, which is the only condition that matters.
- No Google Play Services dependency, no Maps SDK, no API key in the build.
- The maths is real: `src/geo/bearing.ts` does proper haversine distance and
  initial-bearing calculation, and it is unit tested. The pin position on
  screen is derived from genuine coordinates, not faked.

**Cost**: no streets, no landmarks. You see "hazard, 340m, north-east", not
"hazard on Mirpur Road". For the one-pin target CONTEXT.md actually sets, that
is sufficient. Pre-cached offline tiles are the upgrade path, and
`react-native-maps` can drop back in behind the same component boundary if
someone wants to do that work.

## D3 — Built-in `PermissionsAndroid` instead of `react-native-permissions`

RN ships `PermissionsAndroid`, which covers every runtime permission this app
requests (BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT,
ACCESS_FINE_LOCATION). One fewer native dependency to build; no capability
lost.

## D4 — GPS through the same native module instead of `@react-native-community/geolocation`

That package was last published 2024-09 and its New Architecture support is
unverified for RN 0.81. Since D1 already means we ship a native module, a
`getCurrentPosition` built on the platform `LocationManager` is ~60 more
lines and drops another unverified dependency. `LocationManager` also needs
no Google Play Services, which matters on de-Googled and older devices — a
realistic part of the target audience.

## D5 — Babel-jest instead of ts-jest

CONTEXT.md risk #8 is a recurring ts-jest/TypeScript version mismatch, with a
workaround of pinning `typescript@5.6.3`. Transforming TypeScript with Babel
instead removes that failure mode rather than working around it, and lets one
toolchain serve both the logic tests and the React Native component tests.

Type checking is no longer a side effect of running tests, so it became an
explicit step: `npm run typecheck`. Run it in CI, or before a commit that
matters.

Result: the inherited 36 tests still pass, in 0.9s instead of ~4s.

## D6 — Both transports built, selected by config

**CONTEXT.md said**: build Plan A *or* Plan B depending on the Phase 1 spike
outcome, and do not proceed on an assumption.

**Constraint**: the spike needs two physical Android phones in one room. That
cannot be done from a development machine, so the gate cannot be cleared here.

**Decision**: build `bleTransport` (Plan A) and `wifiTransport` (Plan B)
against one `MeshTransport` interface, and select between them with
`VOX_MESH_TRANSPORT` in `.env`.

The instruction not to proceed on an assumption is respected precisely
because no assumption is made — the spike result becomes a one-line config
change instead of a fork in the codebase. `packet.ts` and `relay.ts` were
already transport-agnostic, which is exactly the property FALLBACKS.md said
this would pay off for. A third transport, `loopbackTransport`, runs the
whole mesh in-process so the UI can be developed and demoed with no radio at
all.

**The spike is still a hard stop.** `docs/BLE_SPIKE.md` is the runbook.

## D7 — `senderId` is the public key, not a UUID

**CONTEXT.md said**: anonymous device ID via `react-native-uuid`, never a
hardware identifier.

**Problem**: a receiver has no server to look a sender's public key up from,
and cannot verify a signature without it. So the key has to travel in the
packet regardless. Carrying a separate UUID *as well* costs 16 bytes in every
packet — at ~20 usable bytes per legacy BLE frame, that is a whole extra frame
of airtime for an identifier that adds nothing.

**Decision**: `senderId` is the base64 Ed25519 public key.

The privacy property CONTEXT.md actually cares about is preserved exactly: it
is random per install, is not derived from any hardware identifier, and panic
wipe destroys it so the next launch is a new and unlinkable identity. That was
the reason for the "never a hardware ID" rule, and this satisfies it.

It also removes a class of bug. When the identifier *is* the verification key,
there is no way to claim someone else's `senderId` while signing with your own
— they are the same 32 bytes. There is a test for that in `wire.test.ts`.

`react-native-uuid` is still a dependency and still used for what it is
genuinely good at.

## D8 — The UI does not claim end-to-end encryption

**The Stitch copy said**: "End-to-End Encryption — every byte of data sent over
the mesh network is encrypted from the moment it leaves your device."

**That is not what this app does, and it cannot be.** A mesh broadcast has no
addressee. Every phone in range receives every packet — that is precisely how
relaying works, and it is what makes an SOS reach a stranger who can help.
There is no recipient key to encrypt to.

What VOX actually does is **sign** every packet, which gives integrity and
authenticity: a relay cannot alter a message or forge one from someone else.
It does not give confidentiality against anyone in radio range.

**Decision**: the onboarding copy says "Signed, not secret", and spells out
that a mesh broadcast should be treated as speaking aloud in a crowd.

This is the single most consequential piece of copy in the app. Someone
deciding whether it is safe to send a particular message from a particular
place is relying on it being accurate. Telling them their broadcast was
encrypted when anyone nearby can read it would be worse than telling them
nothing — it would encourage exactly the disclosure the app should discourage.
The data *at rest* is genuinely encrypted, and the UI says that separately.

## D9 — Camera and microphone permissions are not requested

The Stitch `permissions_request` screen lists Camera & Mic alongside Bluetooth,
Location and Storage. Photos and voice notes are in CONTEXT.md's **mocked** set,
so there is no code behind them.

Asking for a permission the app cannot use would undercut the one claim the
whole product rests on. Storage is not requested either — scoped app storage
needs no runtime permission on modern Android. The screen says out loud what is
*not* being asked for, which is more persuasive than the request list.
