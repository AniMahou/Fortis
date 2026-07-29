# VOX

**When the infrastructure fails, the people's voice never will.**

Mesh-based crisis communication for internet shutdowns. Built for the July
Revolution Hackathon, **Track A — Crisis Tech**.

During Bangladesh's July 2024 uprising the internet went dark twice —
18–28 July and 4–5 August. Families could not reach each other, protest
coordination broke down, there was no way to route the injured to help, and
people with gunshot wounds were buried unidentified. VOX is built for that
condition: no internet, no cell towers, no server, no accounts.

Phones talk directly to each other over Bluetooth Low Energy and pass
messages along, hop by hop, until they reach someone who needs them.

---

## What is real and what is mocked

This is a hackathon build, and the split is deliberate — see `CONTEXT.md`
Section 4 for the full reasoning.

**Real, functional, tested**

| Feature | Where |
|---|---|
| Anonymous registration (no phone, no email, no hardware ID) | `src/screens/real/onboarding/` |
| Mesh text relay with a visible hop count | `src/mesh/`, `src/screens/real/MeshRelayScreen.tsx` |
| SOS button — captures GPS, broadcasts over the mesh | `src/screens/real/SafetyCenterScreen.tsx` |
| Danger pin appearing on a second phone's map | `src/screens/real/SafetyMapScreen.tsx` |
| Panic wipe that destroys the encryption key itself | `src/storage/panicWipe.ts` |

**Mocked** — static screens, narrated in the demo video, no logic behind them:
group chat, verified feed, media archive, misinformation reporting. They live
in `src/screens/mocked/` and every one of them renders a `DEMO` banner on
screen so nobody can mistake one for a working feature.

## How it works

```
  ┌──────────────────────────────────────────────┐
  │  screens/  ← React Native UI                 │
  ├──────────────────────────────────────────────┤
  │  state/    ← zustand: identity, mesh, alerts │
  ├──────────────────────────────────────────────┤
  │  mesh/meshService.ts   ← orchestration       │
  │    ├─ packet.ts   schema, TTL, canonical form│
  │    ├─ relay.ts    de-dupe + rebroadcast      │
  │    ├─ chunking.ts fits packets in BLE frames │
  │    └─ transport   ┬ bleTransport   (Plan A)  │
  │                   ├ wifiTransport  (Plan B)  │
  │                   └ loopback       (dev)     │
  ├──────────────────────────────────────────────┤
  │  crypto/   ← Ed25519 identity + signatures   │
  │  storage/  ← encrypted MMKV + panic wipe     │
  └──────────────────────────────────────────────┘
```

One transport carries every kind of packet. A phone that can relay a chat
message relays an SOS exactly the same way — that is the core architectural
idea, not three systems bolted together.

**Identity** is an Ed25519 keypair generated on first launch and stored
locally. Never a phone number, never an email, never IMEI/Android ID/MAC.
Panic wipe destroys the key, so the next launch is a genuinely new and
unlinkable identity.

**Every packet is signed** by its original sender. A relaying phone can be
verified against the sender's public key, not the relay's — so a hostile node
in the middle can drop or replay packets, but cannot forge one.

## State of the build

| | |
|---|---|
| Tests | **320 passing** |
| Coverage | **93% statements** over the hardware-independent core |
| Type check | clean |
| Lint | clean |
| Metro bundle | builds (1.7 MB Android) |
| **Android APK** | **builds — `assembleDebug` succeeds, all three Kotlin modules in the dex** |
| Plan B hub | verified end to end, two live WebSocket clients |
| **BLE on real hardware** | **not yet verified — this is the open item** |

Everything above the radio is proven in software against a simulated mesh,
including the multi-hop relay, and the app compiles to an installable APK with
the native modules present. What has never run is the BLE radio itself. That is
CONTEXT.md's Phase 1 hard stop and it needs two Android handsets in one room:
**`docs/BLE_SPIKE.md`**.

If the spike fails, Plan B is one line in `.env` and no code changes.

## Setup

Requires Node ≥ 20, JDK 17, and Android Studio with the Android SDK. Gradle
installs the NDK and CMake itself on first build. Android only; iOS background
BLE restrictions are out of scope, see `CONTEXT.md` Section 9.

**Full step-by-step, including the emulator route and the traps: `docs/RUNNING.md`.**

```bash
npm install
```

```bash
cp .env.example .env
```

Then, with a device connected over USB debugging:

```bash
npm run android
```

## Commands

```bash
npm test
```

```bash
npm run test:coverage
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run hub
```

`npm run hub` starts the Plan B WiFi relay server (see below). To build a
shareable APK: `npm run apk`.

## Choosing a transport

`VOX_MESH_TRANSPORT` in `.env` selects how packets move:

- `ble` — **Plan A**, real BLE broadcast mesh, genuine multi-hop
- `wifi` — **Plan B**, phones join one device's hotspot and relay through a
  local hub. This is what WarpChat actually did over BDIX during the 2024
  blackout. Still zero internet.
- `loopback` — dev only, in-process, no radio

Run `npm run hub` on the hosting laptop or phone for `wifi`.

**Before trusting Plan A, run the BLE spike**: `docs/BLE_SPIKE.md`. It needs
two real Android phones and it is the one thing that cannot be verified from
a development machine.

## Documentation

| File | What's in it |
|---|---|
| `docs/RUNNING.md` | **How to actually run it** — test suite, emulator, real phones, troubleshooting |
| `CONTEXT.md` | Full project context — hackathon, history, scope reasoning, risks |
| `CLAUDE.md` | Condensed index of the above, auto-loaded by Claude Code |
| `docs/DECISIONS.md` | Implementation choices that depart from CONTEXT.md, and why |
| `docs/BLE_SPIKE.md` | The Phase 1 hardware runbook — pass criteria, failure modes |
| `docs/FALLBACKS.md` | Plan A/B/C decision tree for the mesh transport |
| `docs/DEMO_SCRIPT.md` | Demo video narration, including the real→mocked handoffs |
| `docs/SCREEN_MAP.md` | Which of the 16 designed screens are real vs. mocked |
| `docs/design/` | Stitch design export — tokens and per-screen markup |
| `src/*/TESTING.md` | Per-module: what's automated, plus manual hardware checklists |

## Known limitations

We would rather state these than have a judge find them.

- **A dense crowd is a bad RF environment.** A packed protest is simultaneously
  the scenario with the most available relay nodes and one of the worst places
  to run BLE, because thousands of radios are competing. Real constraint,
  acknowledged, not designed around.
- **An SOS broadcasts your location to everyone nearby**, which includes anyone
  running the app with bad intent. This is inherent to broadcasting for help
  with no server to mediate trust. The alternative — a trusted-contacts-only
  SOS — fails exactly when you most need a stranger to reach you.
- **iOS is not supported** for this build.
- **Panic wipe destroys the key, not the flash cells.** Ciphertext may
  physically survive on the device; it is unreadable because the key is gone.
  Android Keystore hardware backing is wired up where available — see
  `src/storage/TESTING.md`.

## AI assistance disclosure

Per the hackathon rules: this project was built with AI assistance
(Claude Code). The scope decisions, architecture, and hardware validation are
documented in `CONTEXT.md` and `docs/DECISIONS.md`.

## Credits and precedents

- **WarpChat** — built in six hours by an anonymous developer *during* the
  2024 blackout, served over BDIX. The direct precedent for Plan B.
- **Bitchat** — open-source BLE mesh chat, widely adopted during Nepal's 2025
  protests. The direct precedent for Plan A.

Dedicated to the spirit of *jogajog* — connection — that kept people reachable
when the network would not.
