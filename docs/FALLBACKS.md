# Fallback plan — mesh transport

CLAUDE.md flags this as the single biggest unknown. This doc is the full
decision tree so nobody has to improvise it live.

## Step 0 — the spike (do this before writing advertiser.ts/scanner.ts)

**Goal**: prove one Android phone can broadcast a small custom payload that
a second Android phone's scanner picks up, with no pairing step.

1. New bare RN project, install `react-native-ble-plx` (scanning) and
   `react-native-ble-advertiser` (advertising)
2. Phone A: advertise a fixed string ("hello-mesh") as manufacturer data
3. Phone B: scan continuously, log any advertisement containing that string
4. Time-box this to **half a day**. If it's working, move to Step 1. If
   you're still fighting library setup after half a day, stop and move to
   Plan B — don't let this eat the whole build window.

**Pass criteria**: Phone B logs the string within a few seconds of Phone A
starting to advertise, repeatably, at least 3 times in a row.

**Likely failure modes, in rough order of likelihood** (based on the
library's maintenance state — see CLAUDE.md "Known risks"):
- Build/linking errors on a current Android target SDK version
- Advertising silently no-ops on some Android versions/OEM skins (some
  manufacturers restrict background BLE advertising)
- Payload size limits are tighter than expected (legacy BLE advertisements
  cap around 31 bytes total, shared with the required UUID/flags overhead
  — a signed JSON packet will not fit as-is, see Step 1 below regardless
  of which plan you end up on)

## Step 1 — if the spike works: Plan A (BLE broadcast mesh)

- Packets from `mesh/packet.ts` need to be **chunked** to fit advertisement
  payload limits — don't discover this live, budget for it now. A signed
  JSON packet is easily 150-300+ bytes; legacy BLE advertising payloads are
  ~26 usable bytes after overhead. Options, cheapest first:
  - Use BLE 5 extended advertising if the library and test devices support
    it (much larger payload, but support is inconsistent across older
    Android devices)
  - Fragment each packet into N advertisement frames with a sequence
    number + total count, reassemble on receipt (more robust, more code)
  - For the demo specifically: keep SOS/danger payloads deliberately tiny
    (a type byte + lat/lng as fixed-width numbers, no free text) so they
    fit in one frame; only text-chat payloads need fragmentation
- `mesh/advertiser.ts` wraps the send side, `mesh/scanner.ts` wraps the
  receive side — both get a manual test procedure in
  `src/mesh/TESTING.md` once built (per CLAUDE.md's testing convention)

## Step 2 — if the spike fails: Plan B (WiFi-hotspot local relay)

This is what WarpChat actually did during the real 2024 blackout — a local
server reachable over WiFi with zero internet. Less "meshy" as a pitch, but
far more reliable to get working in the time available, and the "no
internet required" claim stays completely honest.

- One phone (or a laptop, for the demo) hosts a small local server —
  a plain Node/Express server, or `react-native-tcp-socket` if it needs to
  run on-device
- Other phones join that device's WiFi hotspot (manual step in the demo,
  narrate it as "in a real deployment this could be automated via
  WiFi-Direct")
- Messages POST to the hub and long-poll or WebSocket-subscribe for new
  ones — same `mesh/packet.ts` and `mesh/relay.ts` logic still applies
  unchanged, only the transport underneath swaps out. This is the payoff
  of keeping packet/relay logic transport-agnostic from the start: Plan B
  is a new `mesh/wifiTransport.ts` file, not a rewrite of everything above it.
- Demo narrative: "During the actual blackout, WarpChat did exactly this
  over BDIX — local networks kept working even when the international
  gateway was cut. This is that same principle."

## Step 3 — if even that's shaky on demo day: Plan C

Pre-record the Phone A → Phone B relay segment once it has worked at least
once, and play that clip during the live demo instead of relying on it
working live in front of judges. Combine with a live walkthrough of
everything else. Not ideal, but a recorded real result beats a live failure,
and it's still an honest claim ("this worked on our devices, here's the
recording") rather than a mocked screen.

## What NOT to do
Don't discover the payload-size and Android-version issues above for the
first time during the spike — read this section first, then spike with
those constraints already in mind.
