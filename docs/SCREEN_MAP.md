# Screen map — real vs. mocked

Cross-references `docs/design/screens/` (the Stitch export) against the
scope decision in CLAUDE.md. "Real" means wired to actual logic; "mocked"
means the Stitch screen ships as-is, narrated over in the demo video.

| Stitch screen | Scope | Notes |
|---|---|---|
| `splash_screen` | Real | Trivial — just needs to actually initialize storage/keys on mount |
| `welcome_screen` | Real | Static content, cheap to make real |
| `privacy_warning` | Real | Static content, cheap to make real |
| `set_nickname` | Real | Writes to the anonymous identity (see `crypto/keys.ts`) |
| `set_pin_optional` | Real | Simple local PIN gate — low effort, worth doing properly |
| `permissions_request` | Real | Actual OS permission prompts (BLE, location, storage) |
| `setup_complete` | Real | Terminal screen of the onboarding flow above |
| `dashboard_home` | **Real, but trim it** | Keep: SOS button, network status. Cut/mock for demo: the "47 devices" / "Nearby Users" stat can be a real count of currently-seen mesh peers once `scanner.ts` exists, but don't build a fake global stat — either show a real small number from your 2-3 demo phones, or omit it |
| `safety_map` | Real | This is the danger-pin feature — one pin, real GPS, real packet over the mesh transport |
| `safety_center` | **Split** | SOS and Panic Wipe sub-sections: real. "I'm Safe," "Dead Man's Switch," "Know Your Rights," "Trusted Circle": mocked (static), unless time allows — Dead Man's Switch is the cheapest of these to make real later (a timer + reuse the SOS packet path) if you finish early |
| `sos_confirmation_post_sos` | Real | Confirmation state after a real SOS broadcast |
| `chat_list` | Mocked | This is "group chat" — static |
| `chat_detail_view` | **Dual use** | As "private encrypted chat": mocked. But its message-bubble UI is the natural visual home for the real BLE text-relay demo (hop count badge per bubble) — reuse the component, not the feature claim. Be explicit in the demo narration about which messages are live-relayed vs. static |
| `public_feed` | Mocked | "Verified Feed" / community broadcast — static |
| `settings` | Mocked | Whole screen — except the actual panic-wipe *action* still needs to be real and reachable from Safety Center, it doesn't need to live in Settings for the demo |
| `vox_logo` | Real | It's just the logo asset |

## Judgment calls flagged above, summarized
- **`dashboard_home`** stat cards: don't fabricate numbers that look real but aren't backed by anything — either wire them to real (small) counts or omit
- **`chat_detail_view`**: the UI gets reused for the real relay demo even though "private chat" as a feature is mocked — say this out loud in the pitch so it reads as a deliberate choice, not a fudge
- **`safety_center`**: it's one Stitch screen bundling several features of different real/mocked status — don't treat "the screen" as one unit when scoping work

## Design tokens
Full color/type/spacing tokens are in `docs/design/DESIGN_TOKENS.md`
(carried over verbatim from the Stitch export). Each screen's exact markup
is in `docs/design/screens/<screen_name>/code.html` — port to RN
components (View/Text/StyleSheet), don't try to run the HTML directly.
