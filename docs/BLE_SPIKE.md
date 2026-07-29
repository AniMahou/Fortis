# The BLE spike — Phase 1

**This is the hard stop.** CONTEXT.md Phase 1 says do not proceed on an
assumption, and it is right: everything real in this app rides on the radio
working. It needs two physical Android phones in one room and cannot be done
from a development machine.

Everything above the radio has been built and tested against a simulated mesh —
the relay logic, hop counting, chunking and reassembly all pass in software
(`npx jest src/mesh`, 105 tests). This is the one question left: **does the
radio itself do what we need on your hardware?**

Time-box: half a day, per FALLBACKS.md. If you are still fighting it after
that, switch to Plan B and stop. That is a planned outcome, not a defeat.

## What changed since CONTEXT.md was written

CONTEXT.md's spike procedure assumed `react-native-ble-advertiser`. That
library is still at 0.0.17, published September 2022, and predates the New
Architecture this app is built on. It has been replaced by a first-party
Kotlin module talking to the Android APIs directly — see docs/DECISIONS.md D1.

So the spike is no longer "does this library work". It is "does this device
advertise and scan the way the platform documentation says it does". Same risk,
one fewer unmaintained dependency in the way.

## Before you start

```bash
npm install
```

```bash
cp .env.example .env
```

Leave `VOX_MESH_TRANSPORT=ble`. Then, with a phone connected over USB
debugging:

```bash
npm run android
```

On both phones: Bluetooth **on**, Location **on** (Android will not return scan
results without it), and grant every permission VOX asks for.

Turn **mobile data and WiFi off**. Not required, but it makes the claim visibly
true rather than merely accurate — and you will want that habit for the demo.

## Step 1 — Does this device support what we need?

On one phone, open VOX and long-press the wordmark on the dashboard for the
debug overlay. Read `capabilities`.

| Field | Meaning |
|---|---|
| `bluetoothSupported: false` | No BLE radio. This device cannot run VOX at all. |
| `advertisingSupported: false` | **The critical one.** Can scan, cannot broadcast. Receive-only — it can show messages but never originate or relay. Two of these together will never see each other. |
| `extendedAdvertisingSupported: true` | BLE 5. A whole packet fits in one frame; delivery in about a second. |
| `extendedAdvertisingSupported: false` | Legacy 31-byte frames. Packets split into six or more; 2-5 seconds. Normal, not a fault. |
| `maxPayloadBytes` | Usable bytes per frame, read off the adapter. Expect ~23 legacy, 200+ extended. |

**Do this on both phones before anything else.** If either reports
`advertisingSupported: false`, find a different handset — this is the exact
failure mode FALLBACKS.md predicted ("advertising silently no-ops on some
Android versions/OEM skins"), and no amount of debugging the app will fix it.

## Step 2 — One phone hears the other

FALLBACKS.md's pass criteria, in the app itself rather than a separate spike
harness — the app *is* the spike now, and testing the real code path is
strictly better than testing a stand-in for it.

1. Both phones on the dashboard.
2. Watch the device count in the header.

**Pass**: each shows `1 NEARBY` within ~10 seconds, reliably, three times in a
row. Background both apps, reopen, and confirm it comes back each time.

**Fail**: go to Step 5.

## Step 3 — A message arrives

1. Phone A: Mesh Relay → send `spike test 1`.
2. Phone B: watch.
3. Repeat three times, with different text each time.

**Pass**: all three arrive within ~5 seconds, each tagged `DIRECT`. Three in a
row is the bar FALLBACKS.md sets, and it is the right bar — an intermittent
mesh is worse than a known-broken one, because you will trust it on stage.

## Step 4 — Record the result

**Whatever happens, write it down here and report it.** The next phase depends
on this answer and on nothing else.

```
Date:
Phones (make / model / Android version):
  A:
  B:
capabilities on A:
capabilities on B:
Step 2 (device count):   pass / intermittent / fail
Step 3 (message):        pass / intermittent / fail   — how many of 3?
Typical delivery time:
Notes:
```

- **All pass** → Plan A holds. Keep `VOX_MESH_TRANSPORT=ble`. Go to
  `src/mesh/TESTING.md` M3, the three-phone relay test. That is the one that
  produces the hop-count badge the demo is built around.
- **Intermittent** → do not talk yourself into it. Either fix it inside the
  time-box or switch to Plan B. Plan C exists precisely for "it worked on our
  devices" — record a clip while it is working, then demo the rest live.
- **Fail** → Plan B. One line in `.env`, no code changes.

## Step 5 — If it fails

Work down this list. The order is roughly by how often each one is the answer.

**Nothing is discovered at all**
- `advertisingSupported: false` on either phone. See Step 1 — this is a
  hardware/OEM limit, not a bug.
- Location permission not granted, or location switched off at the OS level.
  Android returns zero scan results without it and reports no error at all.
- Battery saver on. Several OEM skins throttle or suspend BLE scanning
  aggressively, and Xiaomi, Oppo and Huawei builds are the usual suspects.
  Disable battery optimisation for VOX and retry.
- Both phones happen to be receive-only. Two scanners never find each other.

**Discovery works, messages do not**
- Check `dropped` in the debug overlay:
  - `malformed` climbing → frames are arriving corrupted, or something else is
    using the same manufacturer id. Change `VOX_BLE_MANUFACTURER_ID` in `.env`.
  - `bad_signature` climbing → the two phones are running different builds.
    Rebuild both from the same commit.
  - `partialMessages` stuck above zero → frames arrive but packets never
    complete. Try raising `VOX_BLE_FRAME_INTERVAL_MS` to 400: some radios
    cannot keep up with data changes every 220ms and drop them silently.

**It works, then stops after a while**
- The app was backgrounded. Android restricts BLE in the background heavily,
  and VOX does not currently run a foreground service. Keep the screen on for
  the demo, and mention the foreground service as known future work if asked.

**Build fails**
- `VoxMesh native module is unavailable` in the logs means `VoxPackage` is not
  registered. Check `MainApplication.kt` includes `add(VoxPackage())`.
- Kotlin compilation errors in `com.vox.mesh` — this code has never been
  compiled anywhere. Paste the error and fix it; the APIs it uses are stable
  and well documented.

## Plan B, if you get there

```
VOX_MESH_TRANSPORT=wifi
```

Then `npm run hub` on the hotspot host, set `VOX_WIFI_HUB_URL` on each phone,
rebuild. Full procedure in `src/mesh/TESTING.md`.

It is a star topology, not a mesh, and the pitch should say so. But the claim
that matters is untouched — no internet, no cell towers, no server outside the
room — and it is exactly what WarpChat did during the actual blackout.
