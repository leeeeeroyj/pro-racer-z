// The tracks. Control points are world pixels; the spline runs through them in order and closes back to the first,
// which is the start line. Placements are [kind, track fraction, lateral offset px], fractions counted from the start
// line in the direction of the race (so in Storm's reverse they land elsewhere on the ground). Pure data.

export type PickupKind = 'cell' | 'shield' | 'thruster' | 'core' | 'grip';
export type HazardKind = 'coolant' | 'slick' | 'boost' | 'glitch' | 'cloud' | 'gate' | 'drone';

export interface TrackDef {
  id: string;
  name: string;
  world: { w: number; h: number };
  ctrl: ReadonlyArray<readonly [number, number]>;
  laps: number;
  pickups: ReadonlyArray<readonly [PickupKind, number, number]>;
  /** Where the letters you still need appear, up to three a race, in the word's order. */
  letters: ReadonlyArray<readonly [number, number]>;
  /** The fourth value is the first league it appears in: 0 Neon (the default), 1 Storm, 2 Blackout. */
  hazards: ReadonlyArray<readonly [HazardKind, number, number, number?]>;
}

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'antenna-row',
    name: 'ANTENNA ROW',
    world: { w: 1640, h: 1140 },
    ctrl: [[260, 820], [220, 560], [300, 330], [500, 230], [700, 300], [800, 450], [960, 430], [1060, 250], [1280, 220], [1420, 380], [1380, 600], [1200, 700], [1000, 690], [860, 760], [820, 880], [700, 980], [480, 990]],
    laps: 2,
    pickups: [['cell', 0.24, -10], ['cell', 0.61, 12], ['cell', 0.9, 0], ['shield', 0.4, 0], ['thruster', 0.5, -12], ['core', 0.76, 10], ['grip', 0.87, -12]],
    letters: [[0.15, 12], [0.46, -14], [0.71, 0]],
    hazards: [
      ['coolant', 0.18, -8], ['coolant', 0.55, 10], ['coolant', 0.81, -6], ['slick', 0.33, 8], ['slick', 0.67, -10],
      ['boost', 0.1, 0], ['boost', 0.44, 0], ['boost', 0.94, 0],
      ['slick', 0.12, -12, 1], ['slick', 0.89, 10, 1], ['cloud', 0.3, 0, 1], ['cloud', 0.72, 0, 1],
      ['gate', 0.22, 0, 2], ['gate', 0.58, 0, 2], ['drone', 0.37, 0, 2], ['drone', 0.83, 0, 2], ['glitch', 0.29, 12, 2], ['glitch', 0.65, -12, 2],
    ],
  },
];
