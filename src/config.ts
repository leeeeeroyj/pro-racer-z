// Every tunable in one place. No Phaser imports, so pure modules and tests can load it straight from the dev server.

export const WIDTH = 416;
export const HEIGHT = 228;
/** Top bar height, in game pixels. */
export const HUD_H = 14;

/**
 * The canvas renders at this multiple of the design size. The race camera zooms by it, and the HUD scene zooms by
 * half as much, so native 16 px sprites show at half size there without being shrunk.
 */
export const RENDER_SCALE = 4;
export const HUD_SCALE = RENDER_SCALE / 2;

export const FONT = 'Silkscreen, monospace';

export const COLORS = {
  night: 0x0a0b18, street: 0x04050b, panel: 0x090a16, line: 0x2a2d4c,
  ink: 0xe9efff, dim: 0x9aa2c8, kerb: 0xff3ea5, cyan: 0x36e2ff, lime: 0xa8ff4f, amber: 0xffb23e, hurt: 0xff5470,
} as const;
export const TEXT = {
  night: '#0a0b18', ink: '#e9efff', dim: '#9aa2c8', kerb: '#ff3ea5', cyan: '#36e2ff', lime: '#a8ff4f', amber: '#ffb23e', hurt: '#ff5470',
} as const;

/**
 * The raised track. Centreline samples every `step` px; asphalt `halfWidth` each side of it (unless the track sets
 * its own), then an apron of `apron` px that slows you, then a wall. Cars stop `wallInset` px short of the wall (about
 * their half-width).
 */
export const TRACK = {
  step: 6,
  halfWidth: 24,
  apron: 12,
  wallInset: 5,
  /** Top speed and grip multipliers on the apron. */
  apronTop: 0.62,
  apronGrip: 0.8,
} as const;

/**
 * The city below. `depth`: how fast each layer slides past, as a fraction of the track's speed; the streets are
 * furthest down, the towers nearest. `neon`: the rooftop neon drifts once round the colours every `cycle` seconds and
 * brightens by `pulse` on each beat of the music. `beams`: one searchlight per `area` px² of city, sweeping `swing`
 * radians either side at `sweep` rad/s, at `alpha`, brighter by `pulse` on the beat. With reduced motion there's no
 * pulse and the colours and beams move at a quarter of the speed.
 */
export const CITY = {
  depth: { ground: 0.78, low: 0.88, tall: 0.95 },
  neon: { cycle: 20, alpha: 0.8, pulse: 0.6 },
  beams: { area: 160_000, sweep: 0.4, swing: 0.9, alpha: 0.15, pulse: 0.8 },
} as const;

/** The camera leads the player by its velocity × `lead`, capped, and eases toward that point. */
export const CAMERA = { lead: 0.35, maxX: 70, maxY: 40, ease: 4, down: 8 } as const;

export interface Machine {
  slot: SpriteKey;
  name: string;
  /** px/s */
  top: number;
  /** px/s² */
  accel: number;
  /** rad/s at speed; a stationary car turns at `CAR.turnStill` of this. */
  turn: number;
  /** How fast sideways slide bleeds away, per second. */
  grip: number;
}
export const MACHINES: readonly Machine[] = [
  { slot: 'player', name: 'MK I GLIDER', top: 150, accel: 190, turn: 3.1, grip: 5.4 },
  { slot: 'player_mk2', name: 'MK II STRIKER', top: 170, accel: 215, turn: 3.25, grip: 6.0 },
  { slot: 'player_mk3', name: 'MK III ZENITH', top: 190, accel: 240, turn: 3.4, grip: 6.6 },
];

/** Hover handling shared by every car. */
export const CAR = {
  turnStill: 0.55,
  /** Reverse top speed as a fraction of forward. */
  reverse: 0.35,
  brake: 260,
  reverseAccel: 90,
  /** Speed bleed per second when coasting. */
  coast: 0.9,
  /** Bleed per second when held still (grid, results). */
  hold: 5,
  /** How hard a wall hit reflects the speed into it (1 = stop dead, 2 = full bounce), and speed kept after. */
  wallBounce: 1.4,
  wallKeep: 0.93,
  /** Wall hits faster than this (px/s into the wall) throw sparks and a bump. */
  scrape: 45,
} as const;

export const RACE = {
  /** Seconds on the grid: a dark beat, then three lights a second apart, then GO. */
  countdown: 3.2,
  /** After you finish, the others get this long to cross the line before the results board. */
  doneHold: 3.2,
  /** ...but the finish banner always gets this long, even when you're the last one home. */
  doneMin: 1.5,
  /** A race that runs this long ends where everyone stands. */
  cap: 150,
  /** The results board ignores confirm presses for this long, so a held fire key doesn't skip it. */
  resultsLock: 1,
} as const;

/** Grid slots: samples behind the line and lateral offset, pole first. */
export const GRID: ReadonlyArray<readonly [number, number]> = [[8, -10], [8, 10], [16, -10], [16, 10]];

export type Kind = 'player' | 'halo' | 'vex' | 'dynamo';
export interface Pilot {
  kind: Kind;
  slot: SpriteKey;
  name: string;
  initial: string;
  /** Multiplies the rival base top speed. */
  pace: number;
  /** Results board and minimap colour. Never the only cue: the name or initial always goes with it. */
  color: string;
  /** Grid slot index into GRID. */
  grid: number;
}
/**
 * Rival colours follow their sprites and differ in brightness: silver (light), teal (mid), violet (dark). Their paces
 * are spread out, so beating the slowest (top three) is within reach and beating Halo (a win) is the hard part.
 */
export const RIVALS: readonly Pilot[] = [
  { kind: 'halo', slot: 'rival_halo', name: 'HALO', initial: 'H', pace: 1.0, color: '#d4dcf0', grid: 0 },
  { kind: 'vex', slot: 'rival_vex', name: 'VEX', initial: 'V', pace: 0.95, color: '#5fd4c0', grid: 1 },
  { kind: 'dynamo', slot: 'rival_dynamo', name: 'DYNAMO', initial: 'D', pace: 0.9, color: '#a979ff', grid: 3 },
];
/** You start on the second row, so there's someone to chase off the line. */
export const PLAYER_PILOT = { name: 'YOU', initial: 'P', color: '#ff3ea5', grid: 2 } as const;

/** Rival handling, before pace. Catch-up: +`catchUp` top speed per lap behind you, up to `catchUpMax`. */
export const RIVAL = { top: 148, accel: 195, turn: 3.2, grip: 6, catchUp: 0.08, catchUpMax: 0.06 } as const;

/**
 * Rival pace by league, and how much it rises with each race within the league (`ramp`), so the rivals keep up with
 * the machine you'd have by then: steeply through Neon as you step up to the Mk II, gently in Blackout. Each league
 * opens no harder than the last one ended. Tuned with `tools/balance-probe.mjs` (milestone 7).
 */
export const LEAGUES = [
  { name: 'NEON', pace: 0.95, ramp: 0.05, reverse: false },
  { name: 'STORM', pace: 1.17, ramp: 0.02, reverse: true },
  { name: 'BLACKOUT', pace: 1.33, ramp: 0.012, reverse: false },
] as const;

export const WEAPONS = {
  maxCharges: 9,
  startCharges: 4,
  /** Seconds between shots or drops. */
  cool: 0.6,
  /** Speed on top of the car's own; homing toward the nearest car ahead within range and cone. */
  dart: { speed: 210, life: 1.6, homeRange: 170, homeCone: 0.7, homeTurn: 2.6, hitR: 9, spin: 1.0 },
  /** Dropped `behind` px back; arms after `arm` s; lasts `life` s. */
  mine: { behind: 11, arm: 0.5, hitR: 9, spin: 1.1, life: 30 },
} as const;

export const PICKUP = { r: 10, respawn: 6, cellCharges: 2 } as const;

/** Upgrades per level, up to `max` each: thruster ×(1 + accel·n), core +top·n px/s, grip +turn·n rad/s and +grip·n. */
export const UPGRADE = { max: 3, accel: 0.1, top: 8, turn: 0.12, grip: 0.8 } as const;
export type Upgrade = 'thruster' | 'core' | 'grip';

/** Collect all nine letters for the next machine (or, in the Mk III, points and a retry). */
export const WORD = 'OVERDRIVE';
export const OVERDRIVE = { points: 25000, topPoints: 50000 } as const;

/** Dynamo's grudge: every rival you spin adds 1 heat (to `max`); at `max` he runs at `boost`× pace for the rest of the race. */
export const HEAT = { max: 5, boost: 1.3, perRace: 1 } as const;

export const HAZARD = {
  /** Coolant spill: top speed × `factor` while wet, and you stay wet `hold` s after leaving it. */
  coolant: { r: 13, factor: 0.6, hold: 0.35 },
  /** Oil slick: spins anyone crossing it faster than `minSpeed`. */
  slick: { r: 10, spin: 0.9, minSpeed: 40 },
  /** Boost pad: `secs` of `top`× top speed and `accel`× acceleration; it can't retrigger until `secs - rearm` have passed. */
  boost: { r: 12, secs: 0.9, rearm: 0.3, top: 1.35, accel: 1.6 },
  /** Glitch skull: eats `charges` (player only), then rests `rest` s. */
  glitch: { r: 10, charges: 2, rest: 1.5 },
  /** Storm cloud: drifts round the track at `speed` laps/s; under it (within `r`) top speed × `top`, grip × `grip`. */
  cloud: { r: 40, lat: 6, speed: 0.006, speedStep: 0.002, top: 0.85, grip: 0.55 },
  /** Laser gate: `off`, then a flashing `warn`, then the beam `on`; the beam spins and stops anyone within one sample. */
  gate: { off: 2.9, warn: 1.0, on: 0.7, spin: 1.2, stop: 0.1, warnRange: 260 },
  /** Security drone: sweeps across the track at `rate` rad/s, within `edge` px of the edges; touching it spins you. */
  drone: { r: 10, rate: 1.3, edge: 4, spin: 1.0 },
} as const;

/** A spinning car turns at `rate` rad/s and its speed bleeds away; no control until it stops. */
export const SPIN = { rate: 11, fwdDrag: 2.4, sideDrag: 1.2 } as const;

/** Cars are circles: closer than `dist` they push apart and share `transfer` of the closing speed. */
export const CONTACT = { dist: 11, transfer: 0.5, hard: 40 } as const;

/** Effects. Shake is `[seconds, intensity]`; flashes are white, at `alpha`, fading over `secs`. */
export const FX = {
  shake: { spin: [0.18, 0.006], wall: [0.12, 0.004], overdrive: [0.35, 0.008] },
  wallShake: 90,
  flash: { spin: 0.18, overdrive: 0.4, secs: 0.25 },
  /** Cars leave a fading trail above this share of their top speed. */
  trail: 0.75,
  trailLen: 8,
} as const;

export const SCORE = { place: [5000, 3000, 1500, 0], hit: 200, pickup: 100, letter: 250, record: 1000 } as const;

/**
 * The season: finish in the top `qualify` to go on; 4th spends one of `retries`. The high-score table keeps `table`
 * entries.
 */
export const SEASON = { retries: 2, qualify: 3, table: 8 } as const;

export const SPRITES = [
  'player', 'player_mk2', 'player_mk3', 'rival_halo', 'rival_vex', 'rival_dynamo',
  'cell', 'dart', 'mine', 'shield', 'thruster', 'core', 'grip',
  'storm', 'glitch', 'drone', 'ac_unit', 'dish', 'tower', 'trophy',
] as const;
export type SpriteKey = (typeof SPRITES)[number];

/** Which way each turned sprite's nose points as drawn (radians: 0 = right, -π/2 = up). From the user's picks. */
const UP = -Math.PI / 2, DOWN = Math.PI / 2;
export const NOSE: Partial<Record<SpriteKey, number>> = {
  player: DOWN, player_mk2: UP, player_mk3: DOWN,
  rival_halo: DOWN, rival_vex: DOWN, rival_dynamo: DOWN,
  dart: UP,
};
/** Sprite rotation that points `key`'s nose along `heading`. */
export const spriteAngle = (key: SpriteKey, heading: number) => heading - (NOSE[key] ?? UP);

/** Roof scenery drawn on the city below the track. */
export const SCENERY: readonly SpriteKey[] = ['ac_unit', 'dish', 'tower', 'ac_unit'];

/** Registry key for the HUD's state, written by the race scene each frame. */
export const HUD_STATE = 'hud';
