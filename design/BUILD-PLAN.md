# Pro Racer Z: build plan

A top-down hover-racing game re-imagined from Rare's *R.C. Pro-Am* (NES, 1988). You fly a hover racer round raised neon tracks over a night city against three rival pilots. Finish in the top three or you're out. Darts and mines slow your rivals, and the letters O-V-E-R-D-R-I-V-E earn a faster machine. Concept, rules and sprite picks: `design/concept-sheet.html`.

## Scope

**v1** (a full season is about 30–40 minutes)
- **Season:** 24 races in three leagues of eight tracks. **Neon** (races 1–8) has coolant spills, slicks and boost pads. **Storm** (9–16) runs the same tracks in reverse, with drifting storm clouds and more slicks. **Blackout** (17–24) adds laser gates, security drones and glitch skulls, and the city lights go down. Laps run 2–4 per track; a race takes about 45–75 s.
- **Four pilots a race:** you plus Halo, Vex and Dynamo. Finish 1st–3rd to go on. 4th spends a **retry** (you start with 2): the race runs again and its points are lost. With no retries left the season ends. Finishing race 24 wins the league crown.
- **Rivals** (they never fire weapons, as in the original):
  - **Halo** drives the ideal line, taking the inside of bends.
  - **Vex** moves across to block when you are close behind.
  - **Dynamo** carries a grudge: each rival you hit adds 1 heat; at 5 he overdrives at 1.3× pace for the rest of the race. Heat drops by 1 each race.
  - Rival pace is 100 / 106 / 112 % by league, plus a small per-race ramp and mild catch-up when far behind.
- **Machines:** Mk I Glider → Mk II Striker → Mk III Zenith (top speed, acceleration, turn and grip in `config.ts`). Spelling OVERDRIVE steps up a machine; after the Mk III it pays 50,000 points and a retry.
- **Weapons:** darts fly ahead with light homing; mines drop behind and arm after 0.5 s. Both cost one charge (hold 9). Charges carry between races.
- **Pickups** (only the player collects them; they respawn after 6 s):
  - charge cell: +2 charges
  - shield: absorbs one spin or crash
  - thruster, core, grip: acceleration, top speed, cornering; up to level 3 each, kept until the machine changes
  - letters: 2–3 per track; collected letters persist
- **Hazards:** coolant (slows), slick (spin), boost pad, storm cloud (rain cuts grip and speed), laser gate (cycles off → flashing warning → beam), security drone (sweeps the width behind a red scan line), glitch skull (eats 2 charges). Every one warns before it can hurt you.
- **Track model:** each track is a closed Catmull-Rom spline resampled every 6 px. It is drawn as a raised ribbon: 48 px asphalt, a 12 px apron each side (slow), then a wall that bounces you back. Below it, a parallax city at 0.88× scroll. There is no falling off.
- **Handling:** hover physics. Forward and sideways velocity are kept separately and grip bleeds off the sideways part. You can turn on the spot, so you never get stuck on a wall.
- **Camera:** follows the player and leads with velocity (up to 70 × 40 px). The minimap sits in the HUD.
- **Scoring:** 1st/2nd/3rd 5,000/3,000/1,500; a hit 200; a pickup 100; a letter 250; OVERDRIVE 25,000; a new lap record 1,000. A high-score table (top 8) and per-track lap records live in `localStorage`.
- Keyboard + mouse, controller and touch from the start. Procedural sound. Deployed to GitHub Pages.

**Later**
- Crossover bridges (track passing over itself), music, a ghost of your best lap, time-trial mode, two-player split screen, more tracks.

**Explicitly not taken from the original:**
- its title, the NINTENDO/CHAMPION bonus word, the truck → 4-wheeler → off-roader vehicles
- RC toy cars, track layouts, the isometric view
- art, music and points values

## Architecture

- **Stack:** Vite 8.3.8 + Phaser 4.2.1 + TypeScript 7.0.2 (checked 2026-11-14). Node `^20.19.0 || >=22.12.0` (Vite's `engines`).
- **Copied from Hedge-Hogger (the newest reference):** the project files, `view.ts`, `sfx.ts`, `tools/cdp.mjs` and the deploy workflow.
- **Copied from Sentinel:** the stick + buttons touch layer and the scrolling-world `effects.ts`.
- `assets/` is Vite's public dir, so `tools/sprites.py build` output is live.

**World model:**
- Free scroll over a fixed-size world (about 1640 × 1140 per track), no wrap-around and no arcade physics.
- The ribbon constraint, car contact (circles, r ≈ 5.5) and pickup and hazard overlaps are a few lines of maths.
- The ribbon is baked once per track and league into a canvas texture; the city layer is baked into a second texture at the parallax scale.
- The Race scene positions its camera itself each frame.

| Module | Source | What |
|---|---|---|
| `config.ts` | new | Every tunable: machines, upgrade steps, rival pace and catch-up, league table, laps, weapon speeds and timings, hazard timings, scoring, camera lead, sprite list and **nose direction per car sprite**. |
| `data/tracks.ts` | new, pure | Eight tracks: name, control points, laps, and pickup/letter/hazard placements as (track fraction, lateral offset), per league. |
| `track.ts` | new, pure | Build the spline, resample, tangents, normals, curvature; `locate` (nearest sample in a window, lateral offset, lap crossing); validation helpers. From the mockup. |
| `race.ts` | new, pure | Car step (hover physics, surfaces, walls), AI control per personality, darts, mines, hazard and pickup effects, standings, finish order. Emits events for the scene to play. From the mockup. |
| `season.ts` | new, pure | League and race index, rival pace per race, retries, letters and machine steps, upgrades, Dynamo heat, points, lap records. |
| `bake.ts` | from the mockup | City layer and ribbon textures. |
| `controls.ts` | adapted from SE | Rotate steering (keys, D-pad) or point steering (stick); go, brake, fire, mine, pause, mute; last-used device for hints. |
| `touch.ts` | adapted from SE | Left: point-to-steer stick with throttle from deflection. Right: FIRE and MINE. In the side bars on wide phones, otherwise over the bottom corners. |
| `effects.ts`, `sfx.ts`, `view.ts` | copied | Sparks, rings, shake in game pixels, flash, trails; synth voices (new set); camera fit at 4× (game) and 2× (HUD). |
| `pilot.ts` | from the mockup | Demo autopilot: title attract race, and the headless balance probe. |
| `scenes/TitleScene.ts` | new | Attract race behind the title, START, high scores, controls table. |
| `scenes/RaceScene.ts` | new | Grid lights, race, finish; draws the world, cars, hazards, pickups, effects. Dev hooks. |
| `scenes/HudScene.ts` | adapted | Top bar (place, lap, letters, score, charges, shield, retries, pause, sound), minimap, bottom strip (speed, upgrades, heat), banners (behind sprites), hint strip, results board, pit board, game over. |

**Sprites:**
- 16 × 16 picks from the concept sheet (`chosen` in `tools/sprite_slots.json`).
- Cars are single top-down sprites, turned in code; the dataset has no matched multi-angle car sets. Each car slot records which way its nose points.
- Pickup sprites double as 8 px HUD icons. The storm cloud draws at 3×.
- Code-drawn: track, kerbs, spills, slicks, boost pads, gates, letters, city.

## Milestones

Each one ends playable, tested, committed, pushed and live. Default rhythm: show the result and wait for the go-ahead before each commit.

**Definition of done, every milestone:**
- its test and every earlier one pass
- screenshots looked at
- this plan's Status and the README updated (rules, roster, controls, screenshot if the look changed)
- Part C1 checks
- commit as leeeeeroyj, push, and the Pages deploy succeeds

1. **Skeleton + publishing.** Project files, title scene, Antenna Row built by `track.ts` and baked, parallax city, the player's Mk I driving with rotate steering, leading camera, a minimal HUD (place, lap, sound toggle, hint strip), dev hooks, `tools/cdp.mjs` + `tools/m1-test.mjs`, deploy workflow (actions at `checkout@v7`, `setup-node@v7`, `upload-pages-artifact@v5`, `deploy-pages@v5`, re-checked). Create the repo and Pages, MIT licence, README, repo settings (C2–C5). First push.
   *Verify:*
   - title → START → grid
   - holding up accelerates to the machine's top speed (± 5 %)
   - left and right turn, including on the spot
   - the wall stops the car leaving the ribbon at any speed
   - crossing the line counts a lap
   - `track.ts` imported from the dev server: every track sample's nearest-sample index round-trips, and the minimum bend radius exceeds the ribbon half-width
   - no page errors; screenshots on a straight and in a bend
2. **First playable.** Three rivals with the basic line-following AI, grid lights, laps, positions, finish order, results board; darts, mines, charge cells; slicks and coolant; car contact; score.
   *Verify:*
   - a seeded autopilot race finishes with all four pilots inside the time cap
   - standings match progress at sampled moments
   - a dart fired at a rival ahead hits within 1.6 s and spins it; a mine arms after 0.5 s and spins the next car through
   - a slick spins, coolant slows to the configured factor
   - charges never go below 0 or above 9
3. **Full roster.**
   - Halo's line, Vex's block, Dynamo's heat and overdrive
   - shield, thruster, core, grip, letters, OVERDRIVE and the machine step
   - boost pads, storm clouds, laser gates (with warning), drones (with scan line), glitch skulls
   *Verify:*
   - a spawn hook per pickup and hazard, with a screenshot each
   - Dynamo's top speed is 1.3× after five hits and not before
   - the shield absorbs exactly one hit
   - a gate never hurts during its off phase; the warning always precedes the beam by its configured time
   - spelling OVERDRIVE swaps the sprite and stats and resets upgrades
4. **Season structure.**
   - all eight tracks, three leagues, Storm in reverse, laps per track, the rival pace ramp
   - retries, pit board between races, game over, season end and crown
   - high scores and lap records in `localStorage` (every access in try/catch)
   *Verify:*
   - **track validation for all 8 tracks in both directions:** minimum bend radius > ribbon half-width; no two non-adjacent sections closer than the ribbon width (no overlaps); every pickup, letter and hazard sits inside the asphalt
   - the autopilot completes every track in every league without stalling
   - a 4th place costs a retry and replays the race without its points
   - zero retries ends the season
   - storage blocked → the game still runs
5. **HUD and feedback.** Minimap with gate marks, speed / upgrade / heat strip, banners behind sprites, lap and record popups, sounds for every event, sparks, rings, trails, shake, flashes; `prefers-reduced-motion` drops shake and flashes and thins sparks.
   *Verify:*
   - a spy on the sound manager hears each voice
   - screenshots mid-burst keep cars and hazards readable
   - frame time in headless Chrome with four cars, rain and a storm cloud on screen
6. **Touch and mobile.** Point-to-steer stick with throttle, FIRE and MINE, side-bar layout on wide phones, tappable pause, sound, START, RETRY and TITLE; landscape overlay.
   *Verify:* CDP touch emulation at 844 × 390 and 932 × 390: start a season, steer through a lap, fire a dart, drop a mine, pause and resume. Then a real phone (needs the user).
7. **Polish.**
   - **Balance pass:** the autopilot probe races every track in every league and logs finishing place, time and spins per race.
   - **Targets:** an average driver places top three about 80 % of the time in Neon, 65 % in Storm, 50 % in Blackout. The Mk III should be needed to win in Blackout.
   - Then the user's play-through, the final README and the hero screenshot.

## Testing

- **Harness:** headless Chrome via CDP (`tools/cdp.mjs` from Hedge-Hogger) with real key, controller-free and touch events, run as `node tools/mN-test.mjs . <out-dir>`, each test on its own Vite port.
- **Dev hooks:** dev builds expose the game as `window.__proRacerZ` (behind `import.meta.env.DEV`) with hooks to:
  - jump to a track and league; set the machine and upgrades; grant charges, letters or a shield
  - spawn a hazard or pickup at a track fraction; freeze rivals; set Dynamo's heat
  - seed the `rng`; skip to the finish
- **Pure modules** (`track.ts`, `race.ts`, `season.ts`, `data/tracks.ts`) are imported straight from the dev server.
- Screenshots are looked at for every new screen. A real phone is needed before touch is called done.

## Decisions

- **Name (2026-11-14): Pro Racer Z,** given by the user. The name check is under Open questions.
- **Direction (2026-11-14, the user's picks):** neon rooftop circuit at night; steering by device (rotate on keys and D-pad, point-to-steer on sticks and touch, same physics underneath); scrolling camera with a minimap.
- **One sprite per car, rotated in code (2026-11-14).** A search of the 3,694 car-type sprites found no matched multi-angle sets. A top-down sprite turned in code suits a top-down racer and needs only one pick per car.
- **Nose direction per car sprite (2026-11-14).** The art doesn't agree on which way is forward (the provisional Vex sprite points down). The concept sheet has a Nose toggle per car, saved with the picks, and `config.ts` will carry it.
- **Raised ribbon, no falling (2026-11-14).** Off the asphalt is a slow apron and then a wall. This keeps the original's "stay on the track" feel without a death mechanic it never had.
- **Rivals don't fire (2026-11-14),** as in the original. Their threat comes from pace and personality; weapons stay the player's tool and Dynamo's grudge is the cost.
- **Smooth corners only (2026-11-14).** The mockup's first hairpin was tighter than the ribbon's half-width (36 px); its inner edge folded over and pinned cars to the wall. Every track must pass the bend-radius check (milestone 1 for Antenna Row, milestone 4 for all eight).
- **Storm league runs the tracks in reverse,** so 24 races need only eight layouts.
- **Sprite picks (2026-11-14, the user's):**
  - player Mk I 627201, Mk II 981933, Mk III 981935
  - Halo 627020, Vex 627208 (changed from 981721, see below), Dynamo 536325
  - cell 76929, dart 787361, mine 696012, shield 416171, thruster 718333, core 960473, grip 62083
  - storm 1211583, glitch 1118902, drone 378911
  - roof fan 1333291, dish 1056229, water tower 1360023, trophy 714621
- **Noses (2026-11-14, the user's):** up for every car except the Mk III, which points down. Stored as `"nose"` in `tools/sprite_slots.json`.
- **Rotation (2026-11-14): free turn,** by the user's choice ("feels more modern"). Sprites rotate with Phaser's `rotation` on the 4× canvas; no baked facings.
- **Race length (2026-11-14): 45–75 s a race** is right, per the user.
- **No rival weapons (2026-11-14),** confirmed by the user for every league, Blackout included.
- **Vex is the grey hover car 627208 (2026-11-14, the user's),** nose up. The first pick (981721) was green like the Mk III.
- **The user is colour blind (2026-11-14).** Nothing may be told apart by hue alone: rivals carry letters or labels on the minimap and results, warnings flash or change shape, and paired colours differ in brightness too. The bend kerbs alternate pink and white (the mockup's pink and cyan were close in brightness).
- **Rival colours follow the sprites (2026-11-15):** Halo silver `#d4dcf0`, Vex teal `#5fd4c0`, Dynamo violet `#a979ff`, you pink. Light, mid and dark, so they differ in brightness; names always go with them (results board), initials on the minimap.
- **Races step by real time (2026-11-15).** Phaser's `delta` is smoothed toward 60 fps, so a slow device (and headless Chrome at about 35 fps) ran races in slow motion. `clock.ts` measures the frame from its timestamp and splits it into steps of at most 1/60 s, the rate the physics is tested at.
- **Presses come from key events, not `JustDown` (2026-11-15).** In Phaser 4 a key that goes down and up between two frames never shows in `JustDown`; the test caught lost darts and mines. Fire, drop, confirm, back and mute listen to `keydown-<KEY>` (repeats ignored). Hedge-Hogger's controls rely on `JustDown` for taps and may lose quick ones the same way.
- **One race module (2026-11-15).** The demo autopilot is `Race.aiControl(car, stats, pilot = true)` in `race.ts`, not a separate `pilot.ts`: the rivals and the pilot share the line-following code.
- **The finish (2026-11-15):** after you cross the line the others get 3.2 s (`RACE.doneHold`), then the results board; unfinished cars show `--` and are placed by distance. The board waits at least 1.5 s so the place banner always shows.
- **Storm reverses from the same start line (2026-11-15).** Reversing the control points moved the start line to the old last point; the reverse now keeps the first point and reverses the rest, so the grid and the chequered line stay put.
- **A slick spins you as you drive on to it (2026-11-15),** not again while you pull away. Before, a car that spun out stopped on the slick and spun again as soon as it passed the slick's minimum speed; the rivals had simply never touched one in Neon.
- **The rivals aim wide in bends (2026-11-15).** Chasing a point L ahead round a bend of curvature κ settles L²κ/2 inside the line, about 8 px on Antenna Row, so no rival held its lane and a swerve away from an inside hazard barely moved it. The aim point is now offset by that much. In twelve Neon and Storm autopilot races the rivals now never hit a slick (about 70 hits before).
- **Halo has no coolant exception (2026-11-15).** The plan says only that Halo drives the ideal line; an earlier draft had Halo drive through coolant, which made Halo the slowest rival.
- **Rivals dodge drones where they will be (2026-11-15),** from the drone's sweep and their own speed. Drone spins in six Blackout races fell from 88 to 24.
- **The HUD's top bar carries the OVERDRIVE letters and the shield (2026-11-15).** Collected letters are solid pink tiles, missing ones outlines; the shield icon is bright with a shield and dim without. The track name and league moved under the grid lights.
- **Warning lines are light pink, not red (2026-11-15).** The gate's warning dashes and the drone's scan line read by brightness and by being dashed and blinking. A live beam is a thick line with a white core.
- **Laps per track and league (2026-11-15),** chosen so a race takes 45–75 s: the seven new tracks run 2–3 laps. Antenna Row stays 2 laps in every league.
- **Placements are fixed to the ground (2026-11-15).** Storm meets the same pickups and hazards from the other side rather than at mirrored fractions; letters are re-ordered so they still come in the word's order.
- **The seven new tracks were generated (2026-11-15),** relaxed until every bend radius is ≥ 41 px and every section ≥ 100 px from the others, then given Antenna Row's placement template shifted round the track. Hazards to steer round sit on fairly straight track, not just out of a tight bend, and at least 24 samples apart; twisty tracks drop the items that don't fit (Night Market and Zenith Spire carry fewer).
- **Rivals pick one lane round everything close ahead (2026-11-15),** instead of swerving from each hazard in turn, which could steer them into the next. With this and the spacing rule above, hazard spins across the 24 seeded autopilot races fell from 149 to 37.
- **A lap record scores only when beaten (2026-11-15).** The first lap on a track sets it for nothing, so a new player's first season isn't padded with records.
- **A retry replays from the state before the race (2026-11-15):** its points, pickups, letters and upgrades are lost, as in the original.

## Open questions

- **Name check.**
  - Searches on 2026-11-14 found no game, store listing or trademark called "Pro Racer Z".
  - Nearby: Sega's *Pro-Racer* (1978 arcade, also a top-down racer), Tamsoft's *Pro Racer* (PlayStation, 1999, Europe), Codemasters' *Pro Race Driver* (2002). Third-party trademark aggregators show only dead marks ("RACE Z", "Z RACING") and "RACER X", a separate mark.
  - Fine for a free personal project. Search USPTO directly before any commercial use.
- **Repo and Pages URL:** `leeeeeroyj/pro-racer-z`, `https://leeeeeroyj.github.io/pro-racer-z/`.

## Status (2026-11-15: milestone 4 done)

- **Folder set up (A1).**
  - `git init -b main` with repo-local leeeeeroyj identity, the leeeeeroyj SSH key, and `origin` on the `github-leeeeeroyj` alias.
  - `.gitignore` from Hedge-Hogger (ignores both playbook files).
  - `tools/sprites.py` from Sentinel.
  - **Nothing committed.** The first commit is milestone 1, after approval.
- **Research (A2).**
  - Wikipedia and the NES manual: A accelerates, B fires (horn with no ammo), left and right rotate the car.
  - Three drone cars (blue, green, yellow), top three advance and 4th ends the game, laps vary by track.
  - Missiles ahead, bombs behind, ammo carried over.
  - Turbo, top speed and sticky tyres; roll cages; zippers; puddles, rain squalls, oil, pop-up barriers, skulls.
  - Bonus letters for 40,000 and a faster vehicle; 24 named races (32 on the box) from 12 layouts; two continues.
  - Genesis remake: five opponents, still top three.
- **Concept (A3), with the user's picks:**
  - neon rooftop setting, steering by device, scrolling camera with minimap
  - 3 machines, 3 rivals, 7 pickups and weapons, 3 sprite hazards plus 4 code-drawn ones, 3 kinds of roof scenery, a trophy
- **Sprite slots and candidates (A4–A5).**
  - 20 slots in `tools/sprite_slots.json`, 8 candidates each, every contact sheet looked at.
  - The car slots hold only straight-overhead sprites (most car art in the dataset is three-quarter or side-on, so ruled out).
  - Provisional `chosen` = first pick. `build` wrote `design/candidates/`, `assets/sprites/` and `design/concept-sheet.html`.
- **Concept sheet (A6).** `design/concept-sheet.template.html`, a new racing mockup at 416 × 228 with the page frame, picker and Copy my picks logic from Heroic Crusader (storage keys `pro-racer-z-picks`, `pro-racer-z-nose`). It has:
  - a demo autopilot and the three rival personalities
  - all pickups and hazards, darts and mines, OVERDRIVE letters, the minimap, the HUD strip and the results board
  - previews for machine, league and rotation mode
  - keyboard, controller and touch (stick + FIRE/MINE) input
- **Mockup verified in headless Chrome.**
  - No page errors across Neon, Storm and Blackout and with the touch overlay.
  - A full two-lap race reaches the results board in about 55 s, all four pilots finishing within 1.5 s.
  - Grid cars stay still until GO.
  - Bend radius of Antenna Row is 52 px in both directions (needs > 36).
  - Fixed during the check: idle cars reversing on the grid; the demo pilot emptying its charges in the first seconds; rivals piling into slicks; the hairpin fold (see Decisions).
- **Review (2026-11-14):** the user pasted their picks and noses and answered the open questions (see Decisions). `chosen` and `nose` set in `tools/sprite_slots.json`, the sheet's nose defaults updated, `build` re-run and the sheet republished.
- **Milestone 1 built (2026-11-14), not yet committed:**
  - Project files from Hedge-Hogger (Vite, TypeScript, the deploy workflow, `view.ts`, `sfx.ts` with a new set of voices, `tools/cdp.mjs` with Z, X, Shift and P added).
  - `config.ts`, `data/tracks.ts` (Antenna Row), `track.ts`, `race.ts` (hover physics), `bake.ts` (city with roof scenery baked in, and the ribbon), `trackView.ts` (parallax and camera), `controls.ts` (rotate steering on keys and D-pad, point steering on the stick).
  - Title scene with the camera gliding round the track; race scene with the Mk I, a leading camera, laps, FINAL LAP and FINISH banners, back to the title after the finish; HUD with place, lap, race time, track name, sound toggle and the hint strip.
  - Dev hooks: `window.__proRacerZ`; `RaceScene.snapshot()`, `teleport(frac, lat, turn)`, `played`.
  - `tools/m1-test.mjs`: 28/28 pass. The track round-trips every sample at the centre and both walls in both directions, bend radius 52.3 px (needs > 38), sections at least 111 px apart (needs > 84). All three machines hold their top speed exactly, reaching 95 % in about 0.77 s. 300 random flat-out runs never pass the wall, and the car never jumps to another part of the track. Live: top speed, turning on the spot and at speed, both walls, laps, finish, M and Esc.
  - README and the hero screenshot (`docs/screenshot.png`).
- **Milestone 1 published (2026-11-15):** first commit and push as leeeeeroyj, Pages on (workflow build), deploy green, licence detected as MIT, description, homepage, topics, actions limited to GitHub's own, "Protect main" ruleset, and the security checks (secret scanning and push protection on, read-only workflow token, HTTPS enforced, leeeeeroyj the only collaborator, no keys, hooks, secrets or variables).
- **Milestone 2 built (2026-11-15):**
  - `race.ts` is now a pure `Race`: grid lights, four cars, line-following rivals (lane, slick and coolant avoidance, braking for bends, catch-up), darts with homing, mines that arm, charge cells, coolant and slicks, car contact, standings, finish order, scoring and events for the scene. `raceView.ts` draws it; the title runs an autopilot attract race.
  - HUD: place of 4, lap, time, charges, score, grid lights, results board with NEXT RACE and TITLE. Score and charges carry to the next race (registry).
  - Antenna Row placements: 3 charge cells, 3 coolant spills, 2 slicks.
  - Sounds for lights, GO, darts, mines, empty, spins, hits, pickups, coolant, contact, places.
  - `tools/m2-test.mjs` 36/36 and `tools/m1-test.mjs` 29/29 (adapted: solo race from GO, results board instead of an instant return). Six seeded autopilot races finish with all four pilots in 52–54 s; standings matched the test's own progress count in all 1,800 sampled pairs; a dart hits a rival 60 px ahead in 0.2 s, a mine arms at 0.500 s and spins the next car through, coolant caps top speed at exactly 60 %, charges stay in 0–9 under spamming.
  - The autopilot wins every seeded race by about 2 s; balance is milestone 7.
- **Milestone 2 published (2026-11-15):** committed and pushed as leeeeeroyj, deploy green.
- **Milestone 3 built (2026-11-15):**
  - `race.ts`: rival personalities (Halo's inside line, Vex's block, Dynamo's lane and heat), shields, thruster, core and grip upgrades (3 each), letters and OVERDRIVE (the next machine with fresh upgrades; in the Mk III 50,000 and a retry), boost pads, glitch skulls, storm clouds that drift, laser gates that cycle off, warning and beam, and drones that sweep the width. Hazards come in by league. Spawn hooks: `spawn(kind, frac, lat)`, `spawnPickup(kind, frac, lat, letter)`, `clear()`.
  - `season.ts`: the career (score, charges, machine, letters, upgrades, heat, retries) kept in the registry and written at the results board; heat cools by one a race.
  - `raceView.ts` draws things as they come and go: letters, boost chevrons, glitch skulls, cloud shadow and rain, gate posts, warning and beam, drones and their scan line, the shield bubble and boost streaks.
  - Sounds for shields, boosts, upgrades, letters, OVERDRIVE, glitches, gate warnings and Dynamo's grudge.
  - `tools/m3-test.mjs` 47/47, `m2` 36/36, `m1` 29/29. Six autopilot races in each league finish with everyone inside 54 s (Neon), 62 s (Storm) and 63 s (Blackout). The gate's warning precedes the beam by 1.000 s every cycle, and it only ever spun a car while the beam was on. Dynamo's top speed ratio over six hits is 1, 1, 1, 1, 1.3, 1.3.
  - Test fixes: m2's kit keeps only its own milestone's items on the track; m2 records the grid lights every frame in the page, since polling could miss the 0.2 s dark beat; m2's wait-for-everyone loop no longer blocks the race's own all-home exit.
  - Storm and Blackout are built and tested here but not reachable in play until the season (milestone 4).
- **Milestone 3 published (2026-11-15):** committed and pushed as leeeeeroyj, deploy green.
- **Milestone 4 built (2026-11-15):**
  - Eight tracks (`data/tracks.ts`), with laps per league; `season.ts` runs 24 races, the rival pace ramp (+0.5 % a race within a league), retries (2), game over and the crown, and the high-score table (top 8). `store.ts` keeps high scores and lap records in `localStorage`, every access in try/catch.
  - Pit board (`PitScene`) before every race and a final screen (`FinalScene`) with the table; the title shows the best score and its attract race cycles the season.
  - `tools/m4-test.mjs` 36/36; `m3` 47/47, `m2` 36/36, `m1` 71/71 (every track's geometry, both directions). The autopilot finishes all 24 races in 45–68 s with every pilot home; every placement sits inside the asphalt with no overlaps. Retry, game over, crown, lap records and the table are checked pure and live, and with storage blocked.
- **Next:** milestone 5 (HUD and feedback).
