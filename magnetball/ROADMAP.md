# Magnetball — Feature Roadmap

A backlog derived from what the HaxBall community most asks for
(github.com/haxball/haxball-issues, r/haxball, community threads), filtered to
what makes sense for a **mobile, touch-first** game. Each item notes rough
**effort** (S/M/L/XL) and **why** it's wanted.

Legend: ✅ done · 🎯 recommended next · effort S(hours) M(a day) L(days) XL(big)

---

## ✅ Shipped since
- **Onboarding tutorial** — a short guided first match (move → reach → kick → score) with
  coaching tips that advance as you complete each step.
- **Season / Cup** (#10) — a single-player ladder of 5 rounds vs rising difficulty (Easy →
  Pro, 1v1 → 2v2); win to advance, lose to retry, lift the trophy at the end. Progress and
  cup count persist.
- **Dribble Maze drill** — dribble the ball through winding lanes and gaps to the end circle
  (interior drill walls are now drawn — also fixes 3 older wall drills that were invisible).
- **Collapsible menu** — the long setup screen is now accordion sections (Your Player / Match /
  Controls / Online), remembered between visits, with an **Online (coming soon)** section stub.
- **Esc closes Settings** — same as the Back button (works for the desktop dock too).
- **Juice pass** — game-feel polish: screen shake (scaled by kick power, hard wall/net hits,
  and big on goals), a brief hit-stop freeze-frame and dramatic slow-mo on goals, a coloured
  goal flash (scorer's team), and a bigger confetti burst. All gated by a **Screen shake &
  effects** toggle in Settings (accessibility — off makes every effect a no-op).
- **Desktop live-settings dock** — on wide screens the full Settings panel docks on the left
  as a persistent sidebar so you can tweak theme / sound / feel while the match keeps playing;
  the pitch camera insets so it's never hidden. Mobile keeps the fullscreen overlay.
- **Wider difficulty range** — 7 bot tiers now: Rookie, Easy, Normal, Hard, Pro, Elite, Insane
  (RP rewards scale across the range).
- **Unlockables + Countryballs + player builder** (#4, #8) — 51 unlockable cosmetics: 29
  **countryball** flag skins for your disc, 10 **eye styles**, and 12 **caps**, each gated
  behind a milestone (RP, wins, goals, win-streak, matches played, or drills finished). A
  live-preview "build your own player" in the setup screen (colour + flag + eyes + cap);
  locked items show their requirement. Bots wear random flags/eyes for personality. The
  actual match ball is never skinned — only players.
- **Goal replay + clip share** (#9) — a rolling 6-second snapshot buffer is frozen on every
  goal and re-rendered as an instant replay (offline, theme-aware). A **Save clip** button
  records that playback with `MediaRecorder` and opens the native share sheet
  (`navigator.share`), falling back to a file download. No external libraries.
- **Kick feel + Pro preset** — one-shot kicks now carry the striker's momentum, so a
  running shot is stronger and more directional than a standing one (HaxBall-like). New
  **Casual / Pro** feel presets in Settings: Pro is authentic — no magnet, no trap (instant
  kick), floatier acceleration and a higher ball-speed cap for a raw, high-skill feel.
- **Themes** (#17) — a full theme engine: palettes drive both the CSS and the canvas, so a
  theme reskins the entire game. 6 built-in looks — **Neon** (the CRT default), **Flat**,
  **Grass**, **Mono**, **Paper** (light), **Videoball** (flat vivid, geometric) — picked live
  from Settings. Player colours still customise the disc core on top of any theme.
- **Sound & SFX** (#2) — programmatic Web Audio (no files): whistle on kickoff/reset, crowd on
  goal, pass/kick, wall-bounce and net sounds. **3 selectable variants per sound**, tap-to-hear,
  master mute + volume — all in an in-game **Settings** screen (⚙ in the HUD).
- **Game-feel sliders** (#17-ish) — live-tunable player acceleration, player float, kick power,
  max ball speed, ball glide, ball magnet, and stick sensitivity. Reset-to-default button.
- **Field variety** — 10 pitch shapes/sizes (Classic, Big, Small, Wide, Long, Huge, Rounded,
  Stadium, **Octagon** (chamfered corners), Futsal).
- **Net physics** — the ball loses momentum (halved) hitting the net so it settles inside the goal.
- **Kickoff hold** — the ball stays on the spot until a human actually kicks near it (bots hold
  their formation), so play only starts when you touch it.
- **Practice / drills challenge mode** — 12+ drills (incl. Y-passing and an angled free-kick
  through a wall gap) with best-time tracking and a quick reset.
- **Pitch surface** (#18) — Grass / Ice (slide) / Mud (sluggish), scaling player grip
- **Spectator / Watch** (#15) — hand your seat to the AI and watch
- **Colour-blind team markers** (#7) — solid vs dashed white rings, hue-independent
- (Theme switched to a ZX Spectrum / MSX dark-neon look per request)

## ✅ Shipped earlier
- **Charge-kick power meter** (#1) — hold KICK to wind up power (pad ring fills)
- **Local stats + Rank/ELO ladder** (#3, #8) — RP, Wood→Legend ranks, W/L/D, goals, streaks
- **Golden-goal overtime** (#5) — tied timed matches go to sudden death
- **Training mode** (#11) — free practice, no clock/opponents
- **Control tuning** (#6) — left-handed swap + stick sensitivity
- **Ball presets** (#17) — Normal / Big / Heavy / Bouncy

## ✅ Already in Magnetball
- Mobile-native, touch dual-thumb controls — *the single most-requested platform gap*
- 1v1 / 2v2 / 3v3 / 4v4 vs bots, difficulty tiers
- Player customization: name, colour, cap
- Ball Magnet (0–100) — adjustable ball control
- Magnet-charged kicks (hold-close → further shot)
- Gamepad support (up to 4v4)
- Multiple fields, PWA/offline, Amiga visual theme

---

## 🎯 Tier 1 — Quick wins (S–M, high delight)
1. **Charge-kick power meter** (M) — hold KICK to build power, release to shoot; ring/bar shows charge.
   *Top gameplay ask ("variable pass/kick power, FIFA/PES-style").* Extends the magnet-charge you already have.
2. **Sound & music** (M) — kick/goal/whistle SFX + optional chiptune loop and crowd; mute toggle.
   *Community wants audio/commentary.* Fits the Amiga theme.
3. **Local stats** (S–M) — goals, assists, wins/losses, win streak, per-session totals in localStorage.
   *Stats tracking is a perennial request.*
4. **Avatars & flags** (S) — emoji or initial avatar on the disc, optional country flag.
   *Requested: disc avatars, country flags, custom colours.*
5. **Match rules** (S) — overtime / golden goal, and a **penalty shootout** on draws.
6. **Left-handed / swap-thumbs toggle & control tuning** (S) — joystick sensitivity, deadzone, kick keybind.
   *Configurable controls / keybinds are requested.*
7. **Colourblind-friendly team markers** (S) — shapes/patterns in addition to red/blue.

## 🎯 Tier 2 — Progression & replay (M–L)
8. **Rank / ELO ladder vs bots** (M) — climb divisions by beating higher difficulties; title/prefix by rank.
   *Ranked/ELO + rank prefixes are heavily requested.*
9. **Goal replays & clip share** (L) — record the last few seconds, instant-replay a goal, export/share a clip/GIF.
   *Replays & clip export (HBR-style) are wanted.*
10. **Career / season mode** (L) — play a fixture list or bracket **tournament**, track a table.
    *In-client tournaments / championships.*
11. **Training mode** (M) — free practice, shooting drills, magnet/kick sandbox.

## 🎯 Tier 3 — Online & rooms (L–XL)
12. **Phone-as-controller (local WebRTC)** (L) — shared screen + phones as pads via room code/QR.
    *Answers "permanent room links" + mobile multiplayer.* (Design already scoped.)
13. **Online 1v1/2v2 rooms by code** (XL) — WebRTC peer play with a lightweight signaling broker.
    *Real accounts/rooms are the biggest structural ask; room-code links are the practical version.*
14. **Room presets / favourites** (S) — save & pin match setups (mode, field, magnet, length).
    *Favourite/pinned rooms request.*
15. **Spectator view** (M) — watch a bot-vs-bot match; useful for demos and streams.

## 🎯 Tier 4 — Creation & variety (L–XL)
16. **Stadium editor** (XL) — draw pitches with **curves, gradients, RGBA/transparency**, custom goals; save/share via link.
    *Mapmakers' top wishes: higher vertex limits, curves, gradients, alpha.* Biggest lift, biggest community pull.
17. **Field & ball themes** (S–M) — grass patterns, night/retro/ice skins; heavier/lighter/bouncier ball presets.
    *Different grass patterns; configurable disc physics.*
18. **Fun modifiers / party modes** (M) — big-ball, low-gravity, multi-ball, power-ups, sudden-death.
19. **AI formations & roles** (M) — pick a formation; smarter positioning, marking, and passing between bots.

---

## Suggested first slice
Ship **Tier 1** as a "juice & feel" update (charge kick, sound, stats, avatars, shootout) — all self-contained,
no backend — then tackle **rank ladder (#8)** and **phone-as-controller (#12)**. The stadium editor (#16) is the
crowd-pleaser to save for a dedicated push.
