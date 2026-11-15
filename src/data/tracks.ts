// The tracks. Control points are world pixels; the spline runs through them in order and closes back to the first,
// which is the start line. Pure data.

export interface TrackDef {
  id: string;
  name: string;
  world: { w: number; h: number };
  ctrl: ReadonlyArray<readonly [number, number]>;
  laps: number;
  /** Placements as [kind, track fraction, lateral offset px]. */
  pickups: ReadonlyArray<readonly ['cell', number, number]>;
  hazards: ReadonlyArray<readonly ['coolant' | 'slick', number, number]>;
}

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'antenna-row',
    name: 'ANTENNA ROW',
    world: { w: 1640, h: 1140 },
    ctrl: [[260, 820], [220, 560], [300, 330], [500, 230], [700, 300], [800, 450], [960, 430], [1060, 250], [1280, 220], [1420, 380], [1380, 600], [1200, 700], [1000, 690], [860, 760], [820, 880], [700, 980], [480, 990]],
    laps: 2,
    pickups: [['cell', 0.24, -10], ['cell', 0.61, 12], ['cell', 0.9, 0]],
    hazards: [['coolant', 0.18, -8], ['coolant', 0.55, 10], ['coolant', 0.81, -6], ['slick', 0.33, 8], ['slick', 0.67, -10]],
  },
];
