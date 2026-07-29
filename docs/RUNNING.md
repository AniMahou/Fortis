# Running VOX

Three levels, in increasing order of setup. Start at Level 0 — it needs
nothing and it verifies the part of the app that actually took the work.

| Level | Needs | Proves |
|---|---|---|
| **0. Test suite** | nothing | Mesh relay, crypto, panic wipe, chunking — 320 assertions including multi-hop |
| **1. Emulator + WiFi hub** | Android Studio, ~4GB download | The whole app running, real packets between two devices |
| **2. Real phones** | 2–3 Android handsets | BLE, and the hop-count badge the demo is built on |

---

## Level 0 — run it right now

```bash
npm test
```

320 tests, about 4 seconds, no Android toolchain involved. This is not a
formality: the multi-hop relay, the packet signing, the panic-wipe ordering
and the BLE chunking are all proven here against a simulated mesh.

The one worth watching:

```bash
npx jest src/mesh/__tests__/meshService.test.ts -t "reaches a node out of direct range"
```

Three nodes, A and C deliberately unable to hear each other, message arrives at
C with a hop count of 1. That is the behaviour the whole demo rests on, minus
the radio.

```bash
npm run test:coverage
```

93% over the hardware-independent core. To see the app's own reasoning about
what is and is not covered, read `src/mesh/TESTING.md`.

---

## Level 1 — the app on an emulator

### 1a. Fix your shell environment (do this first)

Two variables are unset on this machine, and one of them fails in a way that
wastes half an hour if you don't know about it.

Add to `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then:

```bash
source ~/.zshrc
```

**Why `JAVA_HOME` is hardcoded rather than using `/usr/libexec/java_home`:** on
this Mac, `java_home` only knows about an old Oracle **Java 8** from the applet
plugin. Homebrew's JDK 17 was never registered with it. If you let Gradle pick,
it finds Java 8 and fails with:

```
Dependency requires at least JVM runtime version 11. This build uses a Java 8 JVM.
```

which reads like a dependency problem and is not one. Verify you got it right:

```bash
java -version && echo "---" && adb version
```

You want `openjdk version "17..."` and an `Android Debug Bridge` line.

### 1b. SDK pieces — mostly automatic

You have SDK platform 36, build-tools 36.0.0, `adb` and the emulator binary.

**The NDK and CMake install themselves.** Gradle pulls NDK `27.1.12297006` and
CMake `3.22.1` automatically on the first build — no manual step. They are
needed because `react-native-mmkv` compiles C++.

The only thing you must add by hand is an **emulator system image**, and only
if you want to run without a physical phone:
**Android Studio → Settings → Languages & Frameworks → Android SDK → SDK
Platforms → "Show Package Details" → a Google APIs ARM 64 v8a System Image**
(arm64, because this is Apple silicon).

> **Disk.** The first build consumes roughly 8 GB — NDK ~3 GB, `~/.gradle`
> ~3 GB, build intermediates and a 131 MB debug APK. A system image is another
> ~2 GB on top. If you are short, see "Reclaiming disk space" at the end.

### 1c. Create an emulator

**Android Studio → Device Manager → Add a virtual device.** Pick any phone
profile, choose the system image you installed, finish. Launch it and leave it
running.

Confirm the machine can see it:

```bash
adb devices
```

### 1d. Point the app at the WiFi hub

**The emulator has no Bluetooth radio.** Two emulators cannot see each other
over BLE, so `VOX_MESH_TRANSPORT=ble` will correctly report "Bluetooth is off
or unavailable". That is the app being honest.

To get two emulators talking, use Plan B. Edit `.env`:

```
VOX_MESH_TRANSPORT=wifi
VOX_WIFI_HUB_URL=ws://10.0.2.2:8787
```

`10.0.2.2` is the Android emulator's fixed alias for your Mac's loopback. From
inside the emulator it means "the host".

> **`.env` is baked in at build time** by react-native-config. Changing it and
> reloading the JS does nothing — you have to rebuild. This is the single most
> common way to lose twenty minutes on this project.

### 1e. Run it

Terminal 1 — the hub:

```bash
npm run hub
```

Terminal 2 — Metro:

```bash
npm start
```

Terminal 3 — build and install:

```bash
npm run android
```

First build pulls a lot and takes 10–20 minutes. Later builds are ~1 minute.

### 1f. Two emulators

Start a second AVD from Device Manager, then:

```bash
adb devices
```

Install the already-built APK on the second device by serial:

```bash
adb -s emulator-5556 install -r android/app/build/outputs/apk/debug/app-debug.apk
```

And let it reach Metro:

```bash
adb -s emulator-5556 reverse tcp:8081 tcp:8081
```

**What you should see:** the hub logs `+ c1 connected`, then `+ c2 connected`.
Send a message from one emulator; it appears on the other, and the hub logs
`c1 → 1 peer(s)`.

**What you will not see:** hop counts above zero. The hub is a star — every
client hears everything directly, so every badge reads `DIRECT`. That is
correct, not a bug. Multi-hop needs real radios and physical distance.

---

## Level 2 — real phones, real BLE

This is the actual demo, and the one thing nothing else substitutes for.

Set `.env` back:

```
VOX_MESH_TRANSPORT=ble
```

On each phone: **Developer options → USB debugging on**. Then plug in and:

```bash
npm run android
```

For a phone you can pass around without a cable:

```bash
npm run apk
```

That produces `android/app/build/outputs/apk/release/app-release.apk`, signed
with the debug key — fine for a demo, not for distribution.

Then follow, in order:

1. **`docs/BLE_SPIKE.md`** — the hard stop. It tells you, per device, whether
   the radio can advertise at all, and has a decision tree for when it can't.
2. **`src/mesh/TESTING.md` → M3** — the three-phone relay test. This is the one
   that produces the `2 HOPS` badge.
3. **`docs/DEMO_SCRIPT.md`** — the recording plan.

On each phone: Bluetooth **on**, Location **on** (Android returns no scan
results without it, silently), battery saver **off** (several OEM skins suspend
BLE scanning under it).

---

## Troubleshooting

**`Dependency requires at least JVM runtime version 11`**
`JAVA_HOME` is pointing at Java 8. See 1a.

**`SDK location not found`**
`ANDROID_HOME` unset, or `android/local.properties` missing. Either export it,
or create the file:

```bash
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

**`NDK not configured` / CMake errors**
Normally Gradle installs both automatically. If it cannot (offline, or SDK
licences not accepted), add **NDK (Side by side)** and **CMake** from Android
Studio → SDK Manager → SDK Tools. `react-native-mmkv` compiles C++, so they
are not optional.

**`VoxMesh native module is unavailable` in the logs**
`VoxPackage` isn't registered. Check `android/app/src/main/java/com/vox/MainApplication.kt`
contains `add(VoxPackage())`.

**App opens but the mesh never starts**
Long-press the **VOX** wordmark on the dashboard for the diagnostics overlay.
It shows what the radio actually reported — `bluetoothEnabled`,
`advertisingSupported`, `maxPayloadBytes`, and the drop counters. Every failure
mode in `docs/BLE_SPIKE.md` Step 5 is diagnosable from that screen.

**Changed `.env`, nothing happened**
Rebuild. Values are compiled in, not read at runtime.

**Metro cache weirdness after big changes**

```bash
npm start -- --reset-cache
```

**Gradle build genuinely stuck**

```bash
cd android && ./gradlew clean --no-daemon
```

**Watching logs from the app**

```bash
adb logcat -s ReactNativeJS:V VoxMesh:V AndroidRuntime:E
```

---

## Reclaiming disk space

The Android toolchain is heavy. If you get tight:

```bash
du -sh ~/.gradle ~/Library/Android/sdk/ndk android/build android/app/build
```

Safe to delete — all regenerate on the next build:

```bash
cd android && ./gradlew clean
```

```bash
rm -rf ~/.gradle/caches/build-cache-*
```

Do **not** delete `~/Library/Android/sdk/ndk` unless you are done building —
it is a 3 GB re-download.

---

## Dependency pinning — why versions are exact

Every native dependency in `package.json` is pinned to an exact version, no
caret. That is deliberate.

The carets originally allowed `react-native-screens` to resolve to 4.26.2 — a
release roughly ten months newer than React Native 0.81.4 — whose codegen uses
syntax RN 0.81's parser cannot read. The build failed with:

```
Error: The first argument of method setToolbarMenuElementOptions
must be of type React.ElementRef<>
```

which points at a file inside `node_modules` and looks like a library bug. It
is not: it is version drift. Pinning fixes it and, more importantly, means a
teammate cloning this repo gets exactly the tree that was verified to build.

If you ever upgrade React Native, these pins are the list to move together.
