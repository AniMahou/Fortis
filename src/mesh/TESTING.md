# Testing — `src/mesh`

This is the layer everything else in the app sits on: SOS, the danger map and
the chat relay are all the same packets over the same transport. So it gets the
most automated coverage, and the parts that need a radio get a checklist
precise enough for a teammate to run without you.

```bash
npm test
```

```bash
npx jest src/mesh
```

```bash
npm run test:coverage
```

> **Note:** the ts-jest/TypeScript version warning in earlier versions of this
> file no longer applies. The suite runs on babel-jest now, which removed that
> failure mode outright (docs/DECISIONS.md D5). Type checking moved to its own
> step: `npm run typecheck`.

## What is automated

| File | Tests | What it proves |
|---|---|---|
| `packet.test.ts` | schema, canonical form, TTL, fail-closed parsing | A malformed packet from a stranger's phone cannot crash the relay loop |
| `relay.test.ts` | de-dupe, rebroadcast, TTL expiry, **multi-hop signature survival** | A crowded mesh does not turn into a rebroadcast storm |
| `wire.test.ts` | binary round-trip, hostile input, size budgets | A decoded packet still verifies — and Bangla, emoji and southern-hemisphere coordinates all survive |
| `payloads.test.ts` | quantisation-before-signing, byte limits, validation | An SOS is not rejected as forged because of floating-point rounding |
| `chunking.test.ts` | fragmentation, out-of-order and repeated frames, memory bounds | BLE's constant rebroadcast does not deliver one message twenty times |
| `frameScheduler.test.ts` | priority, starvation, bounded queue | An SOS does not queue behind chat, and chat is not starved by SOS |
| `meshService.test.ts` | end-to-end relay over the loopback bus | **The A—B—C hop actually works** |

### The three worth reading

**`relay.test.ts` → "a packet still verifies after being relayed the full TTL"**
A regression test for a bug that made multi-hop relay impossible: `ttl` was
part of the signed canonical form, but every relay decrements `ttl`, so a
packet verified at its origin and failed everywhere after. If this test fails,
check whether `ttl` has crept back into `canonicalize`.

**`meshService.test.ts` → "reaches a node out of direct range by hopping"**
Three nodes, A and C deliberately unable to hear each other, message arrives at
C with hop count 1. This is CONTEXT.md Phase 2's target behaviour, proven in
software. The radio underneath it still needs the hardware spike.

**`chunking.test.ts` → "ignores repeated frames, which BLE produces constantly"**
A BLE advertiser does not send once — it rebroadcasts the same bytes many times
a second. The first version of the reassembler delivered every message twenty
times; this test caught it.

## Component tests

There are none, deliberately.

React Test Renderer is deprecated in React 19, and React Native Testing Library
v14 did not initialise correctly against this project's RN 0.81 / React 19
combination — `render` returned an object with no query methods. Rather than
keep fighting the renderer, the one assertion that genuinely mattered moved to
where it can be tested without one.

`formatHopCount` is now a pure function in `state/meshModel.ts` with its own
tests. It produces the most load-bearing string in the whole demo: a relayed
message rendering as `DIRECT` would be wrong in the most convincing possible
way. Testing the function rather than the component covers that properly.

The rest of the UI is verified by `npm run typecheck`, by a full Metro bundle
(`npx react-native bundle --platform android --dev false --entry-file index.js
--bundle-output /tmp/b.js`), and by the manual checklists here and in
`src/storage/TESTING.md`.

## What is not automated, and why

`bleTransport.ts` and `src/native/VoxMesh.ts` have no unit tests. There is no
radio in a test runner, so a test would only measure how much of a mock it
executed. They are deliberately thin for exactly this reason — every decision
they might have made lives in `chunking.ts`, `frameScheduler.ts` or
`meshService.ts`, all of which are tested. What remains is starting the
advertiser, running the frame timer, and translating native events.

Those are covered by the checklist below.

---

## Manual checklist — BLE (Plan A)

**Do the spike in `docs/BLE_SPIKE.md` first.** It is CONTEXT.md Phase 1, it is
a hard stop, and it answers the one question nothing here can: does the radio
work at all on your hardware.

Needs two Android phones, both with a debug build installed, Bluetooth and
Location on, and all permissions granted. Add a third for the relay test.

### M1 — Two phones see each other

1. Open VOX on both. Complete onboarding.
2. On the dashboard, check the device count in the header.

**Pass**: each phone shows `1 NEARBY` within about ten seconds.
**Fail — shows 0**: check the Safety Center status line. "Bluetooth is off" and
"permissions needed" are self-explanatory; "Receive only" means that phone's
radio cannot advertise, so try the pair the other way round.

### M2 — A message arrives

1. Phone A: open Mesh Relay, send `hello from A`.
2. Phone B: watch the same screen.

**Pass**: the message appears within ~5 seconds with a `DIRECT` badge.
**Fail**: see M4 for the diagnostics screen.

### M3 — It hops (the important one)

This is the test CONTEXT.md Phase 2 calls the most important in the project.

1. Three phones, A B C.
2. Walk A and C apart until the dashboard on each stops counting the other —
   typically 30-50m with a wall between, less indoors. Keep B in the middle,
   in range of both.
3. Confirm on A: device count shows B only. Same on C.
4. A sends `relay test`.

**Pass**: C receives it, and the bubble shows `2 HOPS`. That badge is the demo.
**Fail — C receives nothing**: confirm B still sees both. B is the only route;
if B has drifted out of range of either, there is no path.
**Fail — C shows `DIRECT`**: A and C can still hear each other. Move further
apart; the badge is telling the truth.

### M4 — Diagnostics

Long-press the VOX wordmark on the dashboard for the debug overlay. It reports
what the radio actually said:

- **`extendedAdvertising: true`** — a whole packet fits in one frame. Delivery
  is fast, roughly a second.
- **`extendedAdvertising: false`** — legacy 31-byte frames, so packets are
  split into six or more. Expect 2-5 seconds. Not a fault.
- **`frameBytes`** — read off the adapter, never assumed. Under 20 means an
  unusual radio and slow delivery.
- **`dropped.bad_signature` climbing** — packets are arriving and failing
  verification. Either a version mismatch between builds, or genuinely
  corrupted frames.
- **`dropped.malformed` climbing** — something else on the same manufacturer id
  is being picked up, or frames are being corrupted in the air.
- **`partialMessages` stuck above zero** — frames are arriving but packets
  never complete. Usually a sender that walked out of range mid-message.

### M5 — Battery and thermals

Not a correctness test, but worth knowing before demo day.

1. Leave two phones running in the mesh, screens on, for 30 minutes.
2. Note battery drop and whether either phone is warm.

Continuous low-latency advertising and scanning is deliberately the most
aggressive duty cycle available — it is the right trade for a crisis tool, but
know the number before someone asks.

## Manual checklist — WiFi hub (Plan B)

Only needed if the spike fails. See `docs/FALLBACKS.md`.

1. Set `VOX_MESH_TRANSPORT=wifi` in `.env` on every phone and rebuild.
2. Host a hotspot on a laptop or phone. Run `npm run hub` on it; it prints the
   URLs to use.
3. Set `VOX_WIFI_HUB_URL` on each phone to the printed address.
4. Join the hotspot on both phones.

**Pass**: the hub logs `+ c1 connected`, then `+ c2 connected`. A message from
one phone appears on the other, and the hub logs `c1 → 1 peer(s)`.
**Fail — "Hub unreachable"**: the phone is not on the hotspot, or the URL has
the wrong address. The hub prints every address it can be reached on.

**Turn mobile data off on every phone before demoing this.** The claim is "no
internet required", and it should be visibly true rather than merely accurate.

## Known gaps

- **Nothing here tests real RF congestion.** CONTEXT.md risk #3 — a packed
  protest is one of the worst environments for BLE and also the one with the
  most relay candidates. It cannot be reproduced with three phones on a desk.
- **No automated test covers the native Kotlin.** It has never been compiled.
  The spike is what establishes it works at all.
- **Range figures in M3 are indicative.** Real BLE range varies enormously with
  handset, orientation, and what is between the phones.
