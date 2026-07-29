# VOX — Complete Project Context

Everything about this project in one place. Read this fully before writing
any code. This is a hackathon build under real time pressure — the scope
decisions below were made deliberately, after weighing alternatives; don't
silently second-guess them mid-build.

---

## 1. The hackathon

Hosted by a Facebook page/community. Theme: **the July Revolution** — the
2024 student-led uprising in Bangladesh that began as protests against a
civil-service job quota system, escalated after a violent government
crackdown, and ended with Prime Minister Sheikh Hasina resigning and
fleeing the country on August 5, 2024.

Two tracks were offered:
- **Track A — Crisis Tech**: technology that keeps people alive, informed,
  and connected when normal infrastructure fails (mesh networking,
  offline-first apps, disaster response, protest safety, censorship-
  resistant publishing — examples, not a checklist)
- **Track B — Spirit of July**: documentation, truth, justice, civic
  dignity (archiving testimony, misinformation detection, memorial/
  educational experiences, access-to-justice tools)

**We chose Track A.** No restricted stack — any language, framework, form
factor. AI assistance is allowed with disclosure in the submission. A live
hardware demo isn't required if impractical; a working prototype video plus
schematics is acceptable. Final deliverable is a **demo video**.

The hackathon brief explicitly frames itself as dedicated to "the spirit of
Jogajog, which kept people connected during the internet shutdowns of the
July Revolution." Note: the real "Jogajog" was a 2021 Bangladesh government
project name for a planned Facebook alternative — the hackathon is using
the word more symbolically (Bengali for "contact/connection") than as a
literal reference to that specific project.

## 2. What actually happened in July–August 2024 (this project's premise is real, not hypothetical)

- Two shutdown periods: **18–28 July 2024** (the long one, ~10 days) and
  **4–5 August 2024** (a shorter second one, ending the day Hasina resigned)
- The first days were a *complete* mobile + broadband blackout. As
  broadband slowly came back, the government shifted to blocking specific
  platforms (Facebook, Messenger, WhatsApp, TikTok) while claiming a data
  center fire was the real cause — protesters said it was deliberate.
  Bandwidth throttling, 4G-to-2G downgrades, and cache-server shutdowns
  were all used at different points.
- Real, documented consequences: families unable to reach each other,
  protest coordination broken, no way to route the injured to help,
  rumors spreading unchecked, and — the specific detail that motivates the
  "missing person" instinct behind this app's category — people with
  gunshot wounds were buried without identification during the crackdown.

Two real precedents this project is directly inspired by:

**WarpChat** — built by an anonymous developer in six hours, during the
blackout itself. A Node.js app deployed via Docker, hosted on a server
reachable over **BDIX** (Bangladesh Internet Exchange) — the local
ISP-to-ISP peering backbone that kept working even after the international
gateway was cut. It shipped with no encryption (speed of deployment beat
security under the circumstances), and people used it anyway because
having *any* channel mattered more than having a secure one. This is the
direct precedent for this project's WiFi-hotspot fallback plan (Section 10).

**Bitchat** — Jack Dorsey's open-source Bluetooth-mesh chat app. Not from
Bangladesh, but directly relevant: it saw major real-world adoption during
Nepal's 2025 protests, another internet-shutdown-during-unrest scenario.
Fully offline, peer-to-peer, over Bluetooth Low Energy, no server. This is
the direct precedent for this project's primary BLE mesh plan.

## 3. What VOX is

**Tagline**: "When the infrastructure fails, the people's voice never will."

**Core architectural idea**: one mesh transport layer carrying multiple
*kinds* of packets (plain text, SOS distress signal, danger-zone report) —
not separate systems bolted together. A phone that can relay a chat message
can relay an SOS the same way.

**Privacy posture, non-negotiable**: anonymous nicknames only, no phone
number or email ever collected, local-only storage (no central server for
the real features), and a panic wipe that actually destroys the encryption
key (not just deletes rows) so wiped data isn't forensically recoverable.
This matters more than usual here specifically because the people using a
tool like this are the people a state actor most wants to identify.

The project was originally spec'd, with help from another AI (DeepSeek),
as a much larger feature set — full private/group chat, a verified
community feed, media archive, misinformation reporting, a dead man's
switch, know-your-rights content, a trusted-contacts circle, and more. That
full spec is preserved in `docs/design/` (the Stitch-generated screens) for
reference, but **it is not the build target**. See Section 4.

## 4. The scope decision — why, and exactly what

**Why we cut it down**: two compounding risks. First, ordinary hackathon
time pressure — the full original spec is realistically a multi-week app,
not a weekend build. Second, and more specific: the BLE *peripheral/
advertising* side of the React Native ecosystem turned out to be
genuinely under-resourced when checked directly against npm — every
library for BLE advertising (`react-native-ble-advertiser`,
`react-native-ble-peripheral`, `react-native-peripheral`) was last
published in 2022. Scanning-side libraries (`react-native-ble-plx`,
`react-native-ble-manager`) are fine and actively maintained, but the
"broadcast side" that makes something an actual mesh, not just a scanner,
is the part with real technical risk. Building the whole large feature set
on top of an unverified, high-risk core layer would have meant
discovering the hardest problem last, with no time left to react.

**Decision**: pick ONE real, fully-functional core loop; make everything
else a polished static screen, narrated over in the demo video. This is
completely normal, expected hackathon practice — judges know the
difference between "we ran out of time to wire this up" (bad) and "we
made a considered choice about where to spend our hours" (good, and worth
saying out loud in the pitch).

**Real, functional, tested** (5 features):
1. Anonymous registration / onboarding
2. BLE text relay across phones, with a visibly displayed hop count
3. SOS button — captures GPS, broadcasts over the mesh transport
4. One danger-zone pin appearing on a map on a receiving phone
5. Panic wipe — visibly destroys local state on the device

**Mocked** (4 features, static Stitch-designed screens, narrated in the
demo video, no real logic behind them):
1. Group chat
2. Verified/community feed
3. Media archive
4. Misinformation reporting

Do not quietly add real logic to the mocked four without a deliberate
decision to do so — every hour spent there is an hour not spent hardening
the five real features, which is what the demo actually depends on.

## 5. Screen-by-screen breakdown

Every screen below exists as a Stitch-generated design in
`docs/design/screens/<name>/` (HTML/CSS markup in `code.html`, and a
`screen.png` preview where one was exported). Port each to an RN component
(View/Text/StyleSheet) — the HTML does not run as-is in React Native.

### Onboarding flow (all REAL)
Seven lightweight screens, goal: get someone into the mesh network in
under a minute while collecting zero personally identifiable information.

- **`splash_screen`** — logo + tagline while local storage, crypto keys,
  and mesh services initialize in the background. Needs to actually kick
  off `loadOrCreateKeyPair()` (see `src/crypto/keys.ts`) on mount, not just
  be a timed delay.
- **`welcome_screen`** — headline "Stay Connected. Stay Safe. Stay
  Informed.", explains BLE-mesh-without-internet in one paragraph, "no
  personal data ever collected." Single "Get Started" CTA. Static content,
  cheap to make fully real.
- **`privacy_warning`** — three cards: no personal data required, on-device
  storage only, end-to-end secure. Static, cheap to make real.
- **`set_nickname`** — user picks a temporary display name (e.g.
  "Citizen-7X9" or a real first name if they prefer). This is *display*
  identity, separate from the cryptographic device identity in
  `crypto/keys.ts` — the nickname is just a label, the keypair is what
  actually identifies a device to the mesh.
- **`set_pin_optional`** — 4-digit numeric PIN, skippable, changeable
  later. Low effort, worth building for real.
- **`permissions_request`** — requests exactly what's needed: Bluetooth
  (mesh), Location (SOS/danger reports), Storage (local encrypted data),
  Camera/Microphone (photos/voice notes — note: those specific features
  are in the mocked set, so this permission can be requested but doesn't
  need working camera/mic code behind it yet). App should remain usable
  even if some permissions are denied.
- **`setup_complete`** — confirmation screen, "Go to Dashboard" button.

### `dashboard_home` — REAL, but trim the stats
The main hub. Top section shows network status (connected device count,
"Network Health: Strong," a signal-strength bar). Below that: a large,
full-width, pulsing red **SOS button** ("TAP TO SEND SOS") — the single
most visually important element on the whole screen. Below that: a preview
of the last few mesh broadcasts (avatar, nickname, timestamp, distance,
message), with quick-stat cards for nearby users / unread / danger
distance. Bottom nav: Chat / Feed / Map / Safety.

**Important scoping note**: don't fabricate numbers that look real but
aren't backed by anything (the original design mockup shows "47 DEVICES"
as a static example — that's a placeholder, not a target). Either wire
these stat cards to a real, small count from your actual demo phones, or
omit a stat you can't honestly back.

### `safety_map` — REAL
Shows the user's position, nearby users, and hazard reports as a
color-coded map (🟢 safe / 🟡 caution / 🔴 danger). Reporting a danger is a
short flow: pick a type (tear gas, police presence, medical need, etc.),
GPS auto-attaches, optional text, broadcast. For the real build: **one**
pin, appearing on a second phone after being broadcast over the mesh
transport, is the actual target — the full heatmap/clustering/safe-route
system in the original design is aspirational beyond that.

### `safety_center` — SPLIT (this is one Stitch screen bundling several
features of different real/mocked status — don't treat it as one unit)
- **SOS**: REAL — same trigger as the dashboard button
- **Panic Wipe**: REAL — triple-shake gesture or manual button; deletes
  chats, media, contacts, cached mesh data, and (critically) the
  encryption keypair itself (see `crypto/keys.ts` — `destroyKeyPair`).
  Deleting messages but leaving the key behind would make the wipe
  meaningless; the key is what actually needs to be gone.
- **"I'm Safe" / Dead Man's Switch / Know Your Rights / Trusted Circle**:
  MOCKED for the initial build. Dead Man's Switch is the cheapest of these
  to make real later if time allows (a timer + reusing the SOS packet
  path). Know Your Rights, if it's ever made real, must be sourced from an
  actual Bangladeshi legal aid organization (e.g. BLAST, Ain o Salish
  Kendra) — never invented or based on a foreign legal system's template.

### `sos_confirmation_post_sos` — REAL
Confirmation state shown after a real SOS broadcast: GPS attached,
timestamp, "nearby responders notified."

### `chat_list` and `chat_detail_view` — DUAL USE, be explicit about this in the demo
As the "private encrypted group chat" feature: **mocked**. But
`chat_detail_view`'s message-bubble UI is the natural visual home for the
**real** BLE text-relay demo — showing an actual relayed message with a
hop-count badge on the bubble. Reuse the component, not the feature claim.
Say this out loud in the demo narration ("these specific bubbles are live
mesh traffic; the rest of this screen's chat-list/threading is the
UI we designed for a fuller version") — that's an honest, judge-respecting
way to present it, not a fudge.

### `public_feed` — MOCKED
"Verified Feed" — community broadcasts with a verification badge system
for trusted volunteers. Static for the initial build.

### `settings` — MOCKED (with one exception)
Nickname, PIN, encryption toggle, network settings, data management. The
whole screen can be static — the panic-wipe *action* itself needs to be
real and reachable, but it doesn't need to live inside this particular
screen for the demo; triggering it from Safety Center is enough.

### `vox_logo` — REAL (it's just the brand asset)

## 6. Design system

From the Stitch export's design tokens (full detail in
`docs/design/DESIGN_TOKENS.md`):

- **Style**: modern minimalist, high-utility, stark high-contrast palette,
  "calm authority" — deliberately avoids decoration so it stays legible
  under bad lighting/high-stress conditions
- **Colors**: Primary `#1A1A1A` (near-black, core branding/actions),
  Secondary `#B0B0B0` (borders, disabled states), **Emergency `#C8102E`**
  (reserved *exclusively* for SOS/safety actions — never use this red for
  anything else, its whole value is that it means one thing), Base
  `#FFFFFF`
- **Typography**: Inter throughout. Bold/700 for headlines with tight
  letter-spacing, Regular/400 for body/chat text, SemiBold/600 uppercase
  for labels/navigation
- **Shape**: 8px corner radius standard (buttons, inputs, cards), 4px for
  small elements (tags, checkboxes), 16–24px for bottom sheets/modals
- **Elevation**: flat/low-contrast outlines rather than heavy shadows —
  1px ash-gray borders at low opacity for cards, slightly stronger shadow
  only for modals
- **Bottom nav**: fixed 4 items — Chat, Feed, Map, Safety. Safety icon
  gets a red indicator dot when there's an active alert.

## 7. Tech stack and why

- **React Native CLI (bare)**, not Expo Go — BLE peripheral/advertise mode
  needs native modules Expo Go's sandboxed runtime doesn't expose
- **Target: Android only** for the demo. iOS's background BLE restrictions
  aren't worth fighting under this deadline.
- **BLE central/scan**: `react-native-ble-plx` — mature, actively
  maintained
- **BLE peripheral/advertise**: `react-native-ble-advertiser` — flagged as
  the project's single biggest technical risk; last published 2022, single
  maintainer. See Section 9 and `docs/FALLBACKS.md`.
- **Maps**: `react-native-maps`
- **Local storage**: `react-native-mmkv` — fast, and its encryption key can
  be destroyed outright for a real panic wipe
- **State management**: `zustand` — lightweight, sufficient for this scope
- **Crypto**: `tweetnacl` + `tweetnacl-util` — deliberately **not**
  `crypto-js`, which provides primitives (AES, hashing) but no built-in key
  exchange. Two strangers' phones need to agree on how to verify each
  other's signatures with no server in between; `tweetnacl`'s Ed25519
  signing does this out of the box.
- **Anonymous device ID**: `react-native-uuid`, a random UUID generated on
  first launch and stored locally. **Never** `react-native-device-info` or
  any hardware identifier (IMEI, Android ID, MAC) — using one would
  quietly contradict the app's entire "anonymous, no persistent
  identifier" privacy claim, and panic wipe needs to be able to produce a
  genuinely *new*, unlinkable identity afterward.

## 8. Folder structure

```
Fortis/
├── CLAUDE.md                  # concise, auto-loaded every Claude Code session
├── CONTEXT.md                 # this file — full detail, read once at project start
├── README.md                  # human-facing pointer to the above
├── package.json / tsconfig.json / jest.config.js
├── docs/
│   ├── FALLBACKS.md           # BLE spike procedure + Plan A/B/C
│   ├── SCREEN_MAP.md          # condensed version of Section 5 above
│   └── design/
│       ├── DESIGN_TOKENS.md   # full Stitch design tokens
│       └── screens/<name>/    # code.html + screen.png per screen
└── src/
    ├── mesh/
    │   ├── packet.ts           # DONE, tested — packet schema, signing, TTL
    │   ├── relay.ts             # DONE, tested — dedupe/rebroadcast logic
    │   ├── advertiser.ts        # NOT YET BUILT — depends on the BLE spike
    │   ├── scanner.ts           # NOT YET BUILT — depends on the BLE spike
    │   ├── TESTING.md
    │   └── __tests__/
    ├── crypto/
    │   ├── keys.ts               # DONE, tested — device identity, panic-wipe target
    │   ├── sign.ts                # DONE, tested — sign/verify
    │   ├── TESTING.md
    │   └── __tests__/
    ├── storage/
    │   └── mmkv.ts                # NOT YET BUILT — thin, RN-only
    └── screens/
        ├── real/                  # the 5 real features, see Section 5
        └── mocked/                # the 4 mocked features, see Section 5
```

## 9. Known risks and challenges (full list, not just BLE)

1. **BLE advertising library staleness** (the big one) — see Section 7 and
   `docs/FALLBACKS.md` for the full spike procedure and fallback plan.
2. **BLE advertisement payload size limits** — legacy BLE advertisements
   cap around ~26 usable bytes after protocol overhead. A signed JSON
   packet from `mesh/packet.ts` will not fit in one frame as-is. This has
   to be handled (chunking, or BLE 5 extended advertising where
   supported) — don't discover this for the first time mid-spike.
3. **RF congestion in dense crowds** — ironic but real: a packed protest
   is one of the *worst* RF environments for BLE (thousands of phones'
   Bluetooth/WiFi all competing), even though it's also exactly the
   scenario with the most nearby relay candidates. Worth a line in the
   pitch acknowledging this as a known limitation, not a reason to avoid
   the approach.
4. **iOS background BLE restrictions** — resolved by scoping the demo to
   Android only; not resolved in general, worth a one-line disclosure if
   asked.
5. **GPS broadcast privacy tension** — an SOS or danger report broadcasts
   location to "everyone nearby" on the mesh, which includes anyone
   running the app with bad intent, not just allies. Not a reason to cut
   the feature, but worth being able to answer if a judge raises it.
6. **Panic wipe must be cryptographic, not cosmetic** — deleting database
   rows without destroying the encryption key leaves data forensically
   recoverable. `crypto/keys.ts`'s `destroyKeyPair` is what makes the wipe
   real; make sure the UI-level wipe action actually calls it.
7. **"Know Your Rights" content, if ever built for real, needs real
   sourcing** — from an actual Bangladeshi legal aid org, never invented
   or based on a different country's legal system.
8. **ts-jest / TypeScript version mismatch** — hit and resolved once
   already in this project. If `npm test` fails with an error about the
   TypeScript compiler not exposing the expected API, pin
   `typescript@5.6.3`.
9. **Stitch HTML doesn't run in React Native** — every screen needs manual
   porting to View/Text/StyleSheet. Budget real time for this; it isn't
   copy-paste.
10. **Don't silently expand scope** — see Section 4. The five-real/four-
    mocked split was a considered decision, not a placeholder.

## 10. Fallback plans — mesh transport (full detail also in `docs/FALLBACKS.md`)

**Plan A (primary): BLE broadcast mesh.** Spike it first — two real
Android phones, one advertises a fixed test string as manufacturer data,
the other scans and logs it. Time-box to half a day. Pass criteria:
reliable receipt, 3+ times in a row, within a few seconds each time.

**Plan B (fallback): WiFi-hotspot local relay**, if the spike fails or the
library proves unworkable. This is literally what WarpChat did in the real
2024 blackout — one phone (or a laptop, for the demo) hosts a small local
server, other phones join its hotspot, messages POST/WebSocket to the hub.
The payoff of having kept `mesh/packet.ts` and `mesh/relay.ts` transport-
agnostic from day one: this plan only requires a new `mesh/wifiTransport.ts`,
not a rewrite of the packet/relay logic above it.

**Plan C (last resort): pre-recorded relay segment.** If live BLE is
flaky specifically on demo day, play a recording of it working (captured
earlier, once) rather than risk a live failure in front of judges — still
an honest claim ("this worked on our devices, here's the recording"),
combined with everything else running live.

## 11. Testing convention

Every module gets three things together, not tests bolted on after:
1. The code
2. `__tests__/*.test.ts` — real Jest tests, but **only** for
   hardware-independent logic (packet formats, relay/dedupe rules, crypto,
   storage wipe). There is no automated test for BLE/GPS/camera — no radio
   or sensor exists inside a test runner.
3. `TESTING.md` in the same folder — what's automated and how to run it,
   plus a manual test checklist for anything hardware-dependent, written
   so a teammate can execute it without the original author present.

Reference implementation, already built exactly this way:
`src/mesh/` (19 tests) and `src/crypto/` (17 tests) — **36/36 passing,
~94% coverage**, verified by actually running them, not just written.
Copy this pattern for every module below.

## 12. Phased execution plan — where to build autonomously, where to stop

🟢 = build autonomously, no need to pause · 🟡 = build it, then a quick
low-stakes human check · 🔴 = HARD STOP — needs a human with real hardware;
do not proceed to the next phase without an explicit go-ahead reporting
what happened.

**Phase 0 — Project bootstrap** 🟢
Initialize the RN CLI project. Copy in `src/mesh/` and `src/crypto/`
as-is (already built and tested). Install dependencies. Run `npm test`,
confirm 36/36 still passing. If this fails, it's an environment issue
(Node version, etc.) — self-diagnose, no human hardware needed yet.

**Phase 1 — THE BLE SPIKE** 🔴 **hard stop**
Writing the spike test app (a minimal advertiser + scanner) is 🟢. Running
it is not — it needs two real Android phones, in the same room, USB or
WiFi debugging connected. **Stop here and report the actual result**
(worked reliably / worked intermittently / didn't work / which errors) —
see `docs/FALLBACKS.md` Section "Step 0" for exact pass criteria. Do not
proceed to Phase 2 on an assumption.

**Phase 2 — Real mesh transport** 🟡 build → 🔴 verify
Depends entirely on Phase 1's outcome: build `mesh/advertiser.ts` +
`mesh/scanner.ts` (Plan A) or `mesh/wifiTransport.ts` (Plan B), with unit
tests for anything hardware-independent inside them (chunking/reassembly,
dedupe integration). Then **hard stop**: physically test the actual
2–3-phone relay — a text message visibly hopping, hop count displayed —
before trusting this layer. This is the most important manual test in the
whole project; SOS and the danger map both sit on top of it.

**Phase 3 — SOS + Danger Map** 🟡 build → 🟡 lighter check
Only start once Phase 2 is confirmed working. Build the SOS button (GPS
capture + broadcast over the now-confirmed transport) and the Safety Map
screen (one pin, rendered from a received danger packet). Check: run on
one real device, confirm GPS resolves and the pin renders. Lower-stakes
than Phase 2 — this is UI/API correctness, not a new unresolved unknown.

**Phase 4 — Panic Wipe** 🟢 mostly → 🟡 one check
Pure logic (destroy the MMKV key, destroy the device keypair, clear relay
memory) — fully unit-testable, build and test this autonomously. One light
manual check afterward: trigger it on a real device, force-quit and
reopen the app, confirm the nickname/fingerprint is now different.

**Phase 5 — Onboarding/registration screens** 🟢
Splash through setup-complete — mostly static content wired to
`crypto/keys.ts`. Low risk, build fully autonomously.

**Phase 6 — Port the 4 mocked screens** 🟢
Group chat, verified feed, media archive, misinformation reporting —
static ports from the Stitch HTML, no logic to break. Fully autonomous.

**Phase 7 — Integration pass + demo recording** 🔴 human-driven
Full run-through on real devices, record the demo video, write the pitch
narration tying the real→mocked handoffs together smoothly. This is
inherently a human task — Claude Code can help fix bugs found during this
pass or polish UI, but the recording and presentation judgment calls are
yours.

**Rule of thumb across every phase**: anything touching a radio (BLE), a
sensor (GPS/camera), or "does this look/feel right" is a stop-and-check
point. Anything that's pure logic or static UI is fine to build
autonomously.

## 13. Current status

- [x] `src/mesh/packet.ts`, `src/mesh/relay.ts` — 19 tests passing
- [x] `src/crypto/keys.ts`, `src/crypto/sign.ts` — 17 tests passing
- [ ] Phase 1: BLE hardware spike — **next action, requires you + 2 phones**
- [ ] Everything from Phase 2 onward — blocked on Phase 1's result

## 14. Commands

```bash
npm install
npm test                # all tests
npm run test:coverage
npx jest src/mesh        # one module at a time
```
If `npm test` fails with a ts-jest/TypeScript compiler error, run:
```bash
npm install --save-dev typescript@5.6.3
```
