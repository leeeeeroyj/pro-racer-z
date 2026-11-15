// Hover-car physics on the track ribbon. Pure: the scene reads the returned events and plays sounds and effects.
import { CAR, TRACK, WALL, type Machine } from './config';
import { angDiff, at, locate, type Rider, type Track } from './track';

export interface Car extends Rider {
  /** Heading, radians (0 = right, y down). */
  a: number;
  vx: number;
  vy: number;
  finished: boolean;
}

export interface Control {
  /** Rotate steering: -1 left .. +1 right. Ignored when `heading` is set. */
  turn: number;
  /** Point steering: the car turns toward this heading at its turn rate. */
  heading: number | null;
  /** 0..1 */
  throttle: number;
  brake: boolean;
  /** Bleed all motion away (grid, after the finish). */
  hold?: boolean;
}

export type Stats = Pick<Machine, 'top' | 'accel' | 'turn' | 'grip'>;

export const IDLE: Control = { turn: 0, heading: null, throttle: 0, brake: false };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A car sitting `frac` of the way round, `lat` px right of the centreline, pointing along the track. */
export function carAt(track: Track, frac: number, lat = 0, laps = 0): Car {
  const p = at(track, frac, lat);
  return { x: p.x, y: p.y, seg: p.seg, lat, laps, a: p.h, vx: 0, vy: 0, finished: false };
}

export const speedOf = (c: Car) => Math.hypot(c.vx, c.vy);

export interface DriveResult {
  /** +1 crossed the start line forwards, -1 backwards. */
  crossed: number;
  /** Speed into the wall, px/s, when the car hit it this step; else 0. */
  wall: number;
  /** Which wall: +1 right of travel, -1 left. */
  side: number;
}

/**
 * One physics step. The car keeps forward and sideways velocity separately: steering turns the body, grip bleeds the
 * sideways part away, so it slides a little like a hovercraft. The apron slows it; the wall stops it and bounces.
 */
export function drive(track: Track, c: Car, ctl: Control, st: Stats, dt: number): DriveResult {
  let topMul = 1, gripMul = 1;
  if (Math.abs(c.lat) > TRACK.halfWidth) { topMul *= TRACK.apronTop; gripMul *= TRACK.apronGrip; }
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let fwd = c.vx * fx + c.vy * fy, side = -c.vx * fy + c.vy * fx;
  const top = st.top * topMul;
  const turnRate = st.turn * (CAR.turnStill + (1 - CAR.turnStill) * Math.min(1, Math.abs(fwd) / st.top));

  if (ctl.heading !== null) c.a += clamp(angDiff(ctl.heading, c.a), -turnRate * dt, turnRate * dt);
  // Reversing turns the body the other way, like steering a real car backwards.
  else c.a += clamp(ctl.turn, -1, 1) * turnRate * dt * (fwd < -5 ? -1 : 1);
  if (ctl.throttle > 0 && fwd < top) fwd = Math.min(top, fwd + st.accel * ctl.throttle * dt);
  if (ctl.hold) {
    fwd *= Math.exp(-CAR.hold * dt);
    side *= Math.exp(-CAR.hold * dt);
  } else if (ctl.brake) {
    fwd -= (fwd > 0 ? CAR.brake : CAR.reverseAccel) * dt;
  }
  if (!ctl.throttle && !ctl.brake && !ctl.hold) fwd *= Math.exp(-CAR.coast * dt);
  side *= Math.exp(-st.grip * gripMul * dt);
  // Above the limit (say, on to the apron at speed) the car eases down rather than stopping dead.
  if (fwd > top) fwd += (top - fwd) * Math.min(1, 3 * dt);
  fwd = Math.max(fwd, -top * CAR.reverse);

  const nx = Math.cos(c.a), ny = Math.sin(c.a);
  c.vx = nx * fwd - ny * side;
  c.vy = ny * fwd + nx * side;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  const crossed = locate(track, c);

  let wall = 0, sideHit = 0;
  if (Math.abs(c.lat) > WALL) {
    const p = track.pts[c.seg], s = Math.sign(c.lat), over = c.lat - s * WALL;
    c.x -= p.nx * over;
    c.y -= p.ny * over;
    c.lat = s * WALL;
    const vn = c.vx * p.nx + c.vy * p.ny;
    if (vn * s > 0) {
      c.vx = (c.vx - p.nx * vn * CAR.wallBounce) * CAR.wallKeep;
      c.vy = (c.vy - p.ny * vn * CAR.wallBounce) * CAR.wallKeep;
      wall = Math.abs(vn);
      sideHit = s;
    }
  }
  return { crossed, wall, side: sideHit };
}
