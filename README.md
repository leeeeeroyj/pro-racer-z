<div align="center">

# Pro Racer Z

**Hover racing on the rooftops of a neon city.**

A top-down arcade racer on raised circuits high above the streets. It runs in the browser with a keyboard or a controller.

### [▶ Play it now](https://leeeeeroyj.github.io/pro-racer-z/)

[![Deploy](https://github.com/leeeeeroyj/pro-racer-z/actions/workflows/deploy.yml/badge.svg)](https://github.com/leeeeeroyj/pro-racer-z/actions/workflows/deploy.yml)
![Phaser 4](https://img.shields.io/badge/Phaser-4-8a5cf6)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Four hover cars sweep through a long bend on Antenna Row, a raised track with pink and white kerbs high above dark rooftops; a pale coolant spill sits on the inside line and a charge cell floats ahead](docs/screenshot.png)

</div>

## About

Pro Racer Z is an original arcade game inspired by the mechanics of Rare's 1988 NES game *R.C. Pro-Am*. You pilot a hover car round circuits built on the rooftops of a city at night.

- **Four to a race.** You against three rival pilots: Halo, Vex and Dynamo. Finish in the top three to score.
- **Darts and mines.** Fire darts that home in on the car ahead, or leave a mine behind you. A hit spins them out.
- **Free steering.** The car turns smoothly to any angle, and it slides a little through the bends, like a hovercraft.
- **A track above the city.** The streets and rooftops far below scroll slower than the track, so it feels high up.
- **A camera that looks ahead.** The view leads the car the way it's going, so you see the next bend sooner.
- **Sound with no audio files.** Sound effects are generated in code, sfxr style, when the game loads.

## How to play

The track for now is **Antenna Row**: two laps against Halo, Vex and Dynamo.

- **The start:** four cars on the grid behind the chequered line. Three lights come on a second apart, then **GO**. You start on the second row.
- **The apron,** the dark strip between the white edge line and the wall, slows the car to 62 % of its top speed and makes it slide more.
- **The walls** stop you leaving the track. Hit one hard and you bounce off it.
- **Laps:** each lap time shows as you cross the line, and the last lap is called **FINAL LAP**.
- **The finish:** the others get a few seconds to cross the line, then the results board shows the order and the times. From there, race again (your score and charges carry over) or go back to the title.
- **Charges** power your weapons. You start with 4 and can hold 9. Each dart or mine costs one.
- **Darts** fly ahead and bend toward the nearest car in front. **Mines** drop behind you and arm after half a second; until then they're harmless. Either one spins the car it hits for about a second.
- **Contact:** cars bump and push each other, but only weapons and slicks spin them.
- **The rivals** drive the racing line and steer round slicks and coolant. Halo is the quickest, then Vex, then Dynamo, and a rival who falls a long way behind you speeds up a little.

Your machine is the **Mk I Glider**.

**On the track**

| | |
| --- | --- |
| **Charge cell** | +2 charges, up to 9. Comes back 6 seconds after you take it. |
| **Coolant spill** | A pale pool. Drive through it and your top speed drops to 60 % until it dries off, a moment after you leave it. |
| **Oil slick** | A black blot with a light rim. Cross it at speed and you spin. |

| | Points |
| --- | --- |
| 1st / 2nd / 3rd | 5,000 / 3,000 / 1,500 |
| Spinning a rival with a dart or mine | 200 |
| Charge cell | 100 |

## Controls

| | Keyboard | Controller |
| --- | --- | --- |
| Turn | Left / Right, or A / D | D-pad |
| Point the way to go (the car turns to face it) | — | Left stick |
| Go | Up or W | A or RT |
| Brake, then reverse | Down or S | B or LT |
| Fire a dart | Z or Space | X |
| Drop a mine | X or Shift | Y |
| Start | Enter or Space, or click **START** | A or Start |
| Next race (results board) | Enter or Space, or click **NEXT RACE** | A or Start |
| Sound on / off | M, or click the speaker (top right) | — |
| Back to the title | Esc, or click **TITLE** on the results board | Back |

Controllers show up once you press a button. Touch controls aren't in the game yet.

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
```

Every push to `main` builds the game and deploys it to GitHub Pages.

## Project layout

```
src/
  main.ts            game setup
  config.ts          tunables: screen, track, machines, rivals, weapons, hazards, scoring
  data/tracks.ts     the tracks: control points, laps, pickups and hazards
  track.ts           the track spline, nearest-point lookup and lap crossing
  race.ts            one race: hover physics, rival driving, weapons, standings
  rng.ts             seeded random numbers
  clock.ts           real-time frame steps
  bake.ts            the city, the track and the hazards, drawn in code
  trackView.ts       city parallax and the camera
  raceView.ts        cars, darts, mines and pickups on screen
  controls.ts        keyboard and controller input
  sfx.ts             procedural sound effects
  scenes/            title screen with an attract race, the race, and the HUD
assets/sprites/      the game's 16 × 16 sprites
design/              concept sheet and build plan
tools/sprites.py     sprite search and export script
tools/cdp.mjs        headless Chrome harness for the tests
tools/m*-test.mjs    checks for each milestone
```

## Credits

- **Sprites:** from the CC0 [Angais/pixel-art-atlas-1.4m](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) dataset (AI-generated pixel art), found with [Pixel Search](https://huggingface.co/spaces/cfahlgren1/pixel-search).
- **Font:** [Silkscreen](https://fonts.google.com/specimen/Silkscreen) by Jason Kottke, SIL Open Font License.
- **Engine:** [Phaser](https://phaser.io/).
- **Inspiration:** *R.C. Pro-Am* (Rare, 1988). Pro Racer Z isn't affiliated with or endorsed by the original's rights holders.

## License

Code: [MIT](LICENSE). Sprites: CC0. Font: SIL OFL.
