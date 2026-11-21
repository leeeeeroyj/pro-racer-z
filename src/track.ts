// The track as a closed centreline: a Catmull-Rom spline through the control points, resampled every TRACK.step px.
// Pure, so tests import it straight from the dev server.
import { TRACK } from './config';

export interface Sample {
  x: number;
  y: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  ty: number;
  /** Unit normal, to the right of travel on a y-down screen. Positive lateral offsets lie this way. */
  nx: number;
  ny: number;
  /** Heading of the tangent, radians. */
  h: number;
  /** Heading change across ±5 samples: positive bends right, so the inside of the bend is +normal. */
  curv: number;
}

export interface Track {
  pts: Sample[];
  n: number;
  length: number;
  /** Asphalt half-width, px. */
  hw: number;
  /** Furthest a car can sit from the centreline: the asphalt, the apron, less the car's half-width. */
  wall: number;
}

/** Anything that rides the track: `seg` is its nearest sample, `lat` its signed offset, `laps` lines crossed. */
export interface Rider {
  x: number;
  y: number;
  seg: number;
  lat: number;
  laps: number;
}

export const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** `reverse` runs the other way round from the same start line (the first control point). `hw` is the asphalt half-width. */
export function buildTrack(ctrl: ReadonlyArray<readonly [number, number]>, reverse = false, hw: number = TRACK.halfWidth): Track {
  const P = reverse ? [ctrl[0], ...ctrl.slice(1).reverse()] : ctrl, n = P.length, raw: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[raw.length], count = Math.round(length / TRACK.step);
  const pts: Sample[] = [];
  let j = 0;
  for (let s = 0; s < count; s++) {
    const d = (s / count) * length;
    while (cum[j + 1] < d) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length], k = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, tx: 0, ty: 0, nx: 0, ny: 0, h: 0, curv: 0 });
  }
  const m = pts.length;
  pts.forEach((p, i) => {
    const a = pts[(i - 1 + m) % m], b = pts[(i + 1) % m], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    p.tx = (b.x - a.x) / l; p.ty = (b.y - a.y) / l; p.nx = -p.ty; p.ny = p.tx; p.h = Math.atan2(p.ty, p.tx);
  });
  pts.forEach((p, i) => { p.curv = angDiff(pts[(i + 5) % m].h, pts[(i - 5 + m) % m].h); });
  return { pts, n: m, length, hw, wall: hw + TRACK.apron - TRACK.wallInset };
}

/** The point `frac` of the way round (0 = start line), `lat` px to the right of the centreline. */
export function at(track: Track, frac: number, lat = 0) {
  const seg = ((Math.round(frac * track.n) % track.n) + track.n) % track.n, p = track.pts[seg];
  return { seg, lat, x: p.x + p.nx * lat, y: p.y + p.ny * lat, h: p.h };
}

/**
 * Updates a rider's nearest sample (searching a window round its last one, so the track can pass close to itself)
 * and lateral offset. Returns +1 when it crossed the start line forwards, -1 backwards, else 0.
 */
export function locate(track: Track, r: Rider): number {
  const { pts, n } = track;
  let best = r.seg, bd = Infinity;
  for (let k = -12; k <= 28; k++) {
    const i = (r.seg + k + n) % n, p = pts[i], d = (r.x - p.x) ** 2 + (r.y - p.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  let crossed = 0;
  if (r.seg > n * 0.8 && best < n * 0.2) crossed = 1;
  else if (r.seg < n * 0.2 && best > n * 0.8) crossed = -1;
  r.laps += crossed;
  r.seg = best;
  const p = pts[best];
  r.lat = (r.x - p.x) * p.nx + (r.y - p.y) * p.ny;
  return crossed;
}

/** Distance round the track from a to b in samples, signed and wrapped to (-n/2, n/2]. */
export function segGap(track: Track, a: number, b: number) {
  const n = track.n;
  return ((b - a + n + n / 2) % n) - n / 2;
}

/** Tightest bend radius in px. Must exceed the ribbon's half-width or its inside edge folds over. */
export function minRadius(track: Track) {
  let min = Infinity, at = 0;
  track.pts.forEach((p, i) => {
    const q = track.pts[(i + 1) % track.n], r = TRACK.step / Math.max(1e-9, Math.abs(angDiff(q.h, p.h)));
    if (r < min) { min = r; at = i; }
  });
  return { radius: min, seg: at };
}

/** Closest approach between two parts of the centreline more than `skip` px apart along it. Must exceed the ribbon's width. */
export function minSeparation(track: Track, skip = 120) {
  const { pts, n } = track, gap = Math.ceil(skip / TRACK.step);
  let min = Infinity, a = 0, b = 0;
  for (let i = 0; i < n; i += 2) for (let j = i + gap; j < n; j += 2) {
    if (n - (j - i) < gap) continue;
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (d < min) { min = d; a = i; b = j; }
  }
  return { dist: min, a, b };
}
