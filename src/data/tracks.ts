// The tracks. Control points are world pixels; the spline runs through them in order and closes back to the first,
// which is the start line. Placements are [kind, track fraction, lateral offset px] on the ground, with fractions
// counted from the start line in the forward direction and offsets to the right of it; Storm's reverse meets the same
// things from the other side. Pure data.

export type PickupKind = 'cell' | 'shield' | 'thruster' | 'core' | 'grip';
export type HazardKind = 'coolant' | 'slick' | 'boost' | 'glitch' | 'cloud' | 'gate' | 'drone';

export interface TrackDef {
  id: string;
  name: string;
  world: { w: number; h: number };
  ctrl: ReadonlyArray<readonly [number, number]>;
  pickups: ReadonlyArray<readonly [PickupKind, number, number]>;
  /** Where the letters you still need appear, up to three a race, in the word's order. */
  letters: ReadonlyArray<readonly [number, number]>;
  /** Laps in Neon, Storm and Blackout. */
  laps: readonly [number, number, number];
  /** The fourth value is the first league it appears in: 0 Neon (the default), 1 Storm, 2 Blackout. */
  hazards: ReadonlyArray<readonly [HazardKind, number, number, number?]>;
}

export const TRACKS: readonly TrackDef[] = [
  {
    id: 'antenna-row',
    name: 'ANTENNA ROW',
    world: { w: 1640, h: 1140 },
    ctrl: [[260, 820], [220, 560], [300, 330], [500, 230], [700, 300], [800, 450], [960, 430], [1060, 250], [1280, 220], [1420, 380], [1380, 600], [1200, 700], [1000, 690], [860, 760], [820, 880], [700, 980], [480, 990]],
    laps: [2, 2, 2],
    pickups: [['cell', 0.24, -10], ['cell', 0.61, 12], ['cell', 0.9, 0], ['shield', 0.4, 0], ['thruster', 0.5, -12], ['core', 0.76, 10], ['grip', 0.87, -12]],
    letters: [[0.15, 12], [0.46, -14], [0.71, 0]],
    hazards: [
      ['coolant', 0.18, -8], ['coolant', 0.55, 10], ['coolant', 0.81, -6], ['slick', 0.33, 8], ['slick', 0.67, -10],
      ['boost', 0.1, 0], ['boost', 0.44, 0], ['boost', 0.94, 0],
      ['slick', 0.12, -12, 1], ['slick', 0.89, 10, 1], ['cloud', 0.3, 0, 1], ['cloud', 0.72, 0, 1],
      ['gate', 0.22, 0, 2], ['gate', 0.58, 0, 2], ['drone', 0.37, 0, 2], ['drone', 0.83, 0, 2], ['glitch', 0.29, 12, 2], ['glitch', 0.65, -12, 2],
    ],
  },
  {
    id: 'coolant-bay',
    name: 'COOLANT BAY',
    world: { w: 1366, h: 1039 },
    ctrl: [[228, 541], [228, 385], [322, 252], [509, 221], [712, 284], [914, 221], [1102, 284], [1141, 463], [1024, 603], [852, 603], [758, 713], [618, 806], [400, 806], [244, 697]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.311, -10], ['cell', 0.68, 12], ['cell', 0.91, 0], ['shield', 0.471, 0], ['thruster', 0.571, -12], ['core', 0.831, 10], ['grip', 0.94, -12]],
    letters: [[0.22, 12], [0.529, -14], [0.78, 0]],
    hazards: [
      ['coolant', 0.251, -8], ['coolant', 0.552, 10], ['coolant', 0.879, -6], ['slick', 0.399, 8], ['slick', 0.74, -10], ['boost', 0.169, 0], ['boost', 0.329, 0], ['boost', 0.081, 0],
      ['slick', 0.19, -12, 1], ['slick', 0.812, 10, 1], ['cloud', 0.369, 0, 1], ['cloud', 0.789, 0, 1],
      ['gate', 0.135, 0, 2], ['gate', 0.626, 0, 2], ['drone', 0.49, 0, 2],
    ],
  },
  {
    id: 'billboard-bend',
    name: 'BILLBOARD BEND',
    world: { w: 1361, h: 1021 },
    ctrl: [[229, 532], [237, 344], [354, 227], [526, 251], [604, 399], [573, 534], [666, 625], [822, 547], [885, 376], [1025, 313], [1134, 438], [1103, 672], [900, 781], [588, 797], [323, 734]],
    laps: [2, 3, 3],
    pickups: [['cell', 0.19, -10], ['cell', 0.56, 12], ['cell', 0.851, 0], ['shield', 0.351, 0], ['thruster', 0.45, -12], ['core', 0.71, 10], ['grip', 0.821, -12]],
    letters: [[0.101, 12], [0.409, -14], [0.659, 0]],
    hazards: [
      ['coolant', 0.147, -8], ['coolant', 0.581, 10], ['coolant', 0.76, -6], ['slick', 0.218, 8], ['slick', 0.675, -10], ['boost', 0.897, 0], ['boost', 0.367, 0], ['boost', 0.881, 0],
      ['slick', 0.071, -12, 1], ['cloud', 0.25, 0, 1], ['cloud', 0.669, 0, 1],
      ['gate', 0.95, 0, 2], ['gate', 0.532, 0, 2],
    ],
  },
  {
    id: 'helipad-loop',
    name: 'HELIPAD LOOP',
    world: { w: 953, h: 1208 },
    ctrl: [[412, 756], [412, 644], [284, 548], [220, 396], [316, 260], [476, 220], [636, 260], [732, 396], [668, 548], [540, 644], [540, 772], [540, 932], [476, 988], [412, 932]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.36, -10], ['cell', 0.731, 12], ['cell', 0.08, 0], ['shield', 0.52, 0], ['thruster', 0.62, -12], ['core', 0.88, 10], ['grip', 0.931, -12]],
    letters: [[0.271, 12], [0.58, -14], [0.831, 0]],
    hazards: [
      ['coolant', 0.326, -8], ['coolant', 0.651, 10], ['coolant', 0.797, -6], ['slick', 0.471, 8], ['slick', 0.151, -10], ['boost', 0.383, 0], ['boost', 0.411, 0], ['boost', 0.774, 0],
      ['cloud', 0.42, 0, 1], ['cloud', 0.84, 0, 1],
      ['gate', 0.249, 0, 2],
    ],
  },
  {
    id: 'night-market',
    name: 'NIGHT MARKET',
    world: { w: 1265, h: 996 },
    ctrl: [[230, 590], [334, 738], [526, 775], [704, 723], [896, 768], [995, 662], [970, 546], [1044, 427], [1000, 279], [852, 220], [733, 279], [600, 250], [482, 338], [350, 297], [237, 398]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.27, -10], ['cell', 0.64, 12], ['cell', 0.931, 0], ['shield', 0.429, 0], ['thruster', 0.531, -12], ['core', 0.789, 10], ['grip', 0.901, -12]],
    letters: [[0.181, 12], [0.489, -14], [0.739, 0]],
    hazards: [
      ['coolant', 0.203, -8], ['coolant', 0.144, 10], ['boost', 0.124, 0],
      ['cloud', 0.33, 0, 1], ['cloud', 0.749, 0, 1],
      ['gate', 0.355, 0, 2], ['gate', 0.598, 0, 2],
    ],
  },
  {
    id: 'tower-nine',
    name: 'TOWER NINE',
    world: { w: 1126, h: 1095 },
    ctrl: [[224, 584], [224, 466], [283, 362], [357, 258], [535, 221], [698, 288], [742, 436], [668, 554], [550, 569], [476, 621], [498, 702], [609, 725], [742, 710], [868, 732], [905, 799], [846, 865], [683, 873], [417, 850], [269, 776], [224, 688]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.15, -10], ['cell', 0.52, 12], ['cell', 0.81, 0], ['shield', 0.31, 0], ['thruster', 0.411, -12], ['core', 0.67, 10], ['grip', 0.779, -12]],
    letters: [[0.06, 12], [0.371, -14], [0.621, 0]],
    hazards: [
      ['coolant', 0.089, -8], ['coolant', 0.542, 10], ['coolant', 0.737, -6], ['slick', 0.241, 8], ['slick', 0.596, -10], ['boost', 0.167, 0], ['boost', 0.223, 0], ['boost', 0.85, 0],
      ['slick', 0.185, -12, 1], ['slick', 0.828, 10, 1], ['cloud', 0.21, 0, 1], ['cloud', 0.629, 0, 1],
      ['gate', 0.328, 0, 2], ['gate', 0.882, 0, 2],
    ],
  },
  {
    id: 'static-heights',
    name: 'STATIC HEIGHTS',
    world: { w: 1317, h: 1015 },
    ctrl: [[231, 518], [231, 331], [361, 230], [692, 230], [1023, 230], [1095, 360], [980, 468], [888, 500], [863, 558], [893, 626], [911, 686], [885, 743], [764, 792], [447, 777], [260, 705]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.29, -10], ['cell', 0.66, 12], ['cell', 0.89, 0], ['shield', 0.45, 0], ['thruster', 0.55, -12], ['core', 0.81, 10], ['grip', 0.92, -12]],
    letters: [[0.199, 12], [0.511, -14], [0.761, 0]],
    hazards: [
      ['coolant', 0.23, -8], ['coolant', 0.719, 10], ['coolant', 0.859, -6], ['slick', 0.375, 8], ['slick', 0.78, -10], ['boost', 0.15, 0], ['boost', 0.356, 0], ['boost', 0.841, 0],
      ['slick', 0.171, -12, 1], ['slick', 0.309, 10, 1], ['cloud', 0.349, 0, 1], ['cloud', 0.77, 0, 1],
      ['gate', 0.115, 0, 2], ['gate', 0.618, 0, 2],
    ],
  },
  {
    id: 'zenith-spire',
    name: 'ZENITH SPIRE',
    world: { w: 1328, h: 1025 },
    ctrl: [[531, 793], [675, 800], [790, 721], [858, 617], [1006, 605], [1107, 461], [1035, 303], [877, 332], [775, 430], [661, 389], [603, 245], [430, 231], [373, 361], [356, 466], [265, 533], [222, 670], [330, 778]],
    laps: [3, 3, 3],
    pickups: [['cell', 0.21, -10], ['cell', 0.579, 12], ['cell', 0.869, 0], ['shield', 0.369, 0], ['thruster', 0.47, -12], ['core', 0.729, 10], ['grip', 0.841, -12]],
    letters: [[0.119, 12], [0.43, -14], [0.68, 0]],
    hazards: [
      ['coolant', 0.093, -8], ['coolant', 0.946, 10], ['boost', 0.71, 0],
      ['cloud', 0.271, 0, 1], ['cloud', 0.689, 0, 1],
      ['gate', 0.241, 0, 2], ['gate', 0.556, 0, 2],
    ],
  },
];
