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
 * The raised track. Centreline samples every `step` px; asphalt `halfWidth` each side of it, then an apron of
 * `apron` px that slows you, then a wall. Cars stop `wallInset` px short of the wall (about their half-width).
 */
export const TRACK = {
  step: 6,
  halfWidth: 24,
  apron: 12,
  wallInset: 5,
  /** The city below scrolls at this fraction of the track's speed. */
  parallax: 0.88,
  /** Top speed and grip multipliers on the apron. */
  apronTop: 0.62,
  apronGrip: 0.8,
} as const;
/** Furthest a car can sit from the centreline. */
export const WALL = TRACK.halfWidth + TRACK.apron - TRACK.wallInset;

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
  /** Seconds of grid lights before GO. */
  countdown: 3,
  /** Seconds the finish banner shows before leaving. */
  finishHold: 4,
} as const;

export const SPRITES = [
  'player', 'player_mk2', 'player_mk3', 'rival_halo', 'rival_vex', 'rival_dynamo',
  'cell', 'dart', 'mine', 'shield', 'thruster', 'core', 'grip',
  'storm', 'glitch', 'drone', 'ac_unit', 'dish', 'tower', 'trophy',
] as const;
export type SpriteKey = (typeof SPRITES)[number];

/** Which way each turned sprite's nose points as drawn (radians: 0 = right, -π/2 = up). From the user's picks. */
const UP = -Math.PI / 2, DOWN = Math.PI / 2;
export const NOSE: Partial<Record<SpriteKey, number>> = {
  player: UP, player_mk2: UP, player_mk3: DOWN,
  rival_halo: UP, rival_vex: UP, rival_dynamo: UP,
  dart: UP,
};
/** Sprite rotation that points `key`'s nose along `heading`. */
export const spriteAngle = (key: SpriteKey, heading: number) => heading - (NOSE[key] ?? UP);

/** Roof scenery drawn on the city below the track. */
export const SCENERY: readonly SpriteKey[] = ['ac_unit', 'dish', 'tower', 'ac_unit'];

/** Registry key for the HUD's state, written by the race scene each frame. */
export const HUD_STATE = 'hud';
