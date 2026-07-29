# Demo script

Target: **4–5 minutes**. The final deliverable is a video, so this is written
to be recorded rather than performed live — but every live segment below has
actually to work before you record it.

**The single most important shot is the hop-count badge.** Everything else
supports it. If you have time for one thing, make that one clean.

---

## Before you record

- [ ] BLE spike passed (`docs/BLE_SPIKE.md`) — or you are on Plan B and know it
- [ ] Three Android phones charged, same build, from the same commit
- [ ] **Mobile data and WiFi off on all three.** This is the whole pitch. Show
      the notification shade with both off at the start of the recording.
- [ ] Bluetooth and Location on, permissions granted
- [ ] Battery saver **off** — some OEM skins suspend BLE scanning under it
- [ ] Run through the relay test once and confirm the badge says `2 HOPS`
- [ ] Screens set to stay awake

---

## 0:00 — The premise (30s)

> "In July 2024, Bangladesh went dark. Not slow — dark. Ten days with no
> mobile data and no broadband, then a second blackout on the 4th and 5th of
> August.
>
> Families couldn't find each other. Nobody could route the injured to help.
> People were buried without being identified.
>
> Someone built a chat app in six hours during that blackout, called WarpChat,
> and served it over BDIX — the local peering backbone that kept working after
> the international gateway was cut. Thousands of people used it, with no
> encryption at all, because having any channel mattered more.
>
> This is VOX. It's built for the next time, and it doesn't need a server at
> all."

Show: the splash screen, then the shade with data and WiFi off.

## 0:30 — Onboarding (30s)

Run it live. It takes under a minute by design.

> "No phone number. No email. No account. Not even your device's identifiers —
> VOX never reads your IMEI or MAC, because using one would mean you could be
> traced across a wipe.
>
> What identifies you is this" — *point at the fingerprint* — "a key pair
> generated on the phone, that never leaves it."

Pause on the privacy screen long enough for the third card to be readable.

> "And note what this doesn't say. It doesn't claim your broadcasts are
> encrypted. On a mesh, every phone in range receives every packet — that's how
> relaying works. Your messages are *signed*, so nobody can forge or alter
> them. They are not secret. Telling you otherwise would be the most dangerous
> thing this app could do."

## 1:00 — THE RELAY (90s) ← the core of the demo

Three phones on camera, labelled **A**, **B**, **C**.

> "Here's the part that matters."

1. Show all three dashboards. Each shows a real peer count.
2. **Walk A and C apart** until each shows only B. Show both screens.

> "A and C can't hear each other now. Watch their device counts — one each,
> and it's B."

3. On A, send: `Medical camp at Gate 3`
4. Cut to B — arrives, badge reads **DIRECT**.
5. Cut to C — arrives, badge reads **2 HOPS**.

> "That message went from A, through B's phone, to C. B didn't do anything —
> the phone relayed it automatically. That badge is the proof: two hops.
>
> No internet. No cell tower. No server. Three phones and Bluetooth."

Hold on the `2 HOPS` badge for a beat. **This is the shot.**

> "Every packet is signed by whoever sent it, and checked against their key at
> every hop. So B can drop the message or refuse to pass it on — but B cannot
> change a word of it, and cannot forge one from someone else."

## 2:30 — SOS and the map (60s)

> "The same transport carries everything. A phone that can relay a chat message
> relays an SOS the same way — that's one system, not three bolted together."

1. Hold the SOS button on A. Show the progress fill.

> "Hold, not tap. This broadcasts your location to every stranger in range —
> that should never happen by accident."

2. Show the confirmation screen.

> "And look at what this says. It does *not* say help is on the way. It can't
> know that — a broadcast mesh has no delivery receipts. It says what's true:
> signed, on the air, this many phones were in range, still rebroadcasting.
> Someone in danger is owed the truth about what their phone did."

3. On B, report a hazard — tear gas.
4. Cut to C's map. The pin appears.

> "C never heard from B directly. That report relayed. And this map has no
> tiles — no Google Maps, because map tiles come over a network and there is
> no network. Your position at the centre, the hazard at its real bearing and
> distance, computed from actual GPS coordinates."

## 3:30 — Panic wipe (45s)

> "Last one. This is the feature the people who'd actually use this care most
> about."

1. Note the fingerprint on screen.
2. Safety → Panic wipe → confirm.
3. Show the report: key destroyed, 0 records remaining.

> "That didn't delete messages. It destroyed the encryption key — and on this
> phone the key lives in the secure element, so it was never in flash to
> recover. Everything left on the device is ciphertext nobody can read.
> Including us."

4. **Force-stop the app**, reopen.
5. Onboarding. New fingerprint.

> "New identity. Nothing links it to the one that was just destroyed."

## 4:15 — What's real, what isn't (30s)

Be direct. Judges can tell, and saying it first is worth more than the screens.

> "Five things in this app are real and tested: registration, the mesh relay you
> just watched, SOS, the danger map, and that wipe.
>
> Four are designs with nothing behind them — group chat, the verified feed, the
> media archive, misinformation reporting. Every one of them says so on screen.
>
> That was a decision, not a shortfall. The riskiest thing here was always
> whether BLE broadcast would work at all, so we spent the time on the layer
> everything else sits on rather than spreading it thin across nine features.
>
> The mocked screens aren't empty, though — each one says *why*. The verified
> feed is hard because there's no server to decide who's verified. The media
> archive is hard because a photo is 2MB and a Bluetooth advertisement carries
> twenty bytes. Those are the interesting problems, and we'd rather show you
> where they are than paper over them."

## 4:45 — Close (15s)

> "One transport, carrying everything. Anonymous by construction. A wipe that
> actually wipes.
>
> When the infrastructure fails, the people's voice never will."

---

## Questions to expect, and honest answers

**"Would this survive a real protest crowd?"**
Partly. A dense crowd is simultaneously the best case — hundreds of relay
candidates — and one of the worst RF environments, because thousands of radios
compete for the same 2.4GHz band. We haven't tested at that scale and can't
claim it. It's CONTEXT.md's known risk #3.

**"An SOS broadcasts your location to everyone. Isn't that dangerous?"**
Yes, and it's inherent. There's no server to mediate trust, so "everyone
nearby" includes anyone hostile who's running the app. The alternative — SOS
only to trusted contacts — fails exactly when you most need a stranger to
reach you. We chose the broadcast and say so on the report screen.

**"What stops someone flooding the mesh?"**
Nothing stops them transmitting. What limits the damage: every packet is
signed, so forgeries are dropped before they're relayed; duplicates are
dropped once, so a rebroadcast storm can't build; and TTL is clamped on
receive, so a hostile node can't make a packet bounce forever. There's no
rate limiting on legitimate traffic yet — that's real future work.

**"Why not encrypt the messages?"**
A broadcast has no addressee, so there's no recipient key to encrypt to. That
*is* the mesh. Data at rest is encrypted; data in flight is signed, and the
app says so rather than implying otherwise.

**"iOS?"**
No. Background BLE restrictions on iOS make this much harder, and we scoped to
Android rather than half-build both.

**"How much did AI write?"**
A lot, and it's disclosed in the README per the rules. The scope decisions,
the architecture, and the hardware validation are documented in CONTEXT.md and
docs/DECISIONS.md — including the places we deliberately departed from the
original plan, and why.

---

## If it fails on the day

Plan C from FALLBACKS.md. Record the relay segment once, while it's working,
and play that clip instead of running it live. Say so out loud — "this worked
on our devices, here's the recording" — and demo everything else live. A
recorded real result beats a live failure, and it's still an honest claim.
