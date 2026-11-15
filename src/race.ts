// One race, pure: hover physics, the rivals' driving, darts, mines, pickups, hazards, car contact and standings.
// The scene draws it and turns its events into sounds and effects. Tests run whole races here without rendering.
import {
  CAR, CONTACT, GRID, HAZARD, LEAGUES, PICKUP, PLAYER_PILOT, RACE, RIVAL, RIVALS, SCORE, SPIN, TRACK, WALL, WEAPONS,
  type Kind, type Machine, type SpriteKey,
} from './config';
import type { TrackDef } from './data/tracks';
import { mulberry32 } from './rng';
import { angDiff, at, buildTrack, locate, segGap, type Rider, type Track } from './track';

export interface Car extends Rider {
  /** Heading, radians (0 = right, y down). */
  a: number;
  vx: number;
  vy: number;
  finished: boolean;
  /** Seconds of spin left. */
  spin: number;
  spinDir: number;
  /** Seconds of coolant left on the hull. */
  wet: number;
}

export interface Control {
  /** Rotate steering: -1 left .. +1 right. Ignored when `heading` is set. */
  turn: number;
  /** Point steering: the car turns toward this heading at its turn rate. */
  heading: number | null;
  /** 0..1 */
  throttle: number;
  brake: boolean;
  /** Bleed all motion away (grid, frozen cars). */
  hold?: boolean;
}

export type Stats = Pick<Machine, 'top' | 'accel' | 'turn' | 'grip'>;

export const IDLE: Control = { turn: 0, heading: null, throttle: 0, brake: false };
const HOLD: Control = { ...IDLE, hold: true };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** A car sitting `frac` of the way round, `lat` px right of the centreline, pointing along the track. */
export function carAt(track: Track, frac: number, lat = 0, laps = 0): Car {
  const p = at(track, frac, lat);
  return { x: p.x, y: p.y, seg: p.seg, lat, laps, a: p.h, vx: 0, vy: 0, finished: false, spin: 0, spinDir: 1, wet: 0 };
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
 * sideways part away, so it slides a little like a hovercraft. The apron and coolant slow it; a spinning car has no
 * control; the wall stops it and bounces.
 */
export function drive(track: Track, c: Car, ctl: Control, st: Stats, dt: number): DriveResult {
  let topMul = 1, gripMul = 1;
  if (Math.abs(c.lat) > TRACK.halfWidth) { topMul *= TRACK.apronTop; gripMul *= TRACK.apronGrip; }
  if (c.wet > 0) topMul *= HAZARD.coolant.factor;
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let fwd = c.vx * fx + c.vy * fy, side = -c.vx * fy + c.vy * fx;
  const top = st.top * topMul;

  if (c.spin > 0) {
    c.a += SPIN.rate * dt * c.spinDir;
    fwd *= Math.exp(-SPIN.fwdDrag * dt);
    side *= Math.exp(-SPIN.sideDrag * dt);
  } else {
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
  }
  // Above the limit (on to the apron at speed, into coolant) the car eases down rather than stopping dead.
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
  c.spin = Math.max(0, c.spin - dt);
  c.wet = Math.max(0, c.wet - dt);
  return { crossed, wall, side: sideHit };
}

// ---- The race ----

export interface Racer extends Car {
  kind: Kind;
  slot: SpriteKey;
  name: string;
  initial: string;
  color: string;
  pace: number;
  /** Preferred lateral offset on the straights. */
  lane: number;
  /** Seconds until this car can fire or drop again. */
  cool: number;
  lapStart: number;
  finishT: number | null;
}
export interface Dart extends Rider { a: number; v: number; life: number; owner: Racer }
export interface Mine { x: number; y: number; arm: number; t: number; owner: Racer; dead: boolean }
export interface Pickup { kind: 'cell'; x: number; y: number; seg: number; lat: number; h: number; t: number }
export interface Hazard { kind: 'coolant' | 'slick'; x: number; y: number; seg: number; lat: number; h: number }

export type Phase = 'grid' | 'race' | 'done' | 'results';

/** Grid lights lit with `phaseT` seconds of countdown left: a dark beat, then one a second, the third a second before GO. */
export const lightsLit = (phaseT: number) => Math.min(3, Math.max(0, Math.floor(RACE.countdown - phaseT + 0.8)));

export type RaceEvent =
  | { type: 'light'; lit: number }
  | { type: 'go' }
  | { type: 'lap'; time: number }
  | { type: 'finalLap' }
  | { type: 'finish'; car: Racer; place: number; points: number }
  | { type: 'results' }
  | { type: 'wall'; car: Racer; speed: number; x: number; y: number }
  | { type: 'bump'; a: Racer; b: Racer; speed: number; x: number; y: number }
  | { type: 'fire'; car: Racer }
  | { type: 'drop'; car: Racer }
  | { type: 'empty' }
  | { type: 'spin'; car: Racer; by: Racer | null; x: number; y: number }
  | { type: 'score'; points: number; label: string; x: number; y: number }
  | { type: 'pickup'; kind: Pickup['kind']; x: number; y: number }
  | { type: 'coolant'; car: Racer }
  | { type: 'armed'; mine: Mine };

export interface PlayerInput {
  drive: Control;
  /** Edges: one dart or mine per press. */
  fire: boolean;
  drop: boolean;
}
export const NO_INPUT: PlayerInput = { drive: IDLE, fire: false, drop: false };

export interface RaceOptions {
  seed: number;
  machine: Machine;
  charges?: number;
  league?: number;
  /** The player's car drives itself (title attract race, balance probes). */
  autopilot?: boolean;
}

export class Race {
  readonly track: Track;
  cars: Racer[];
  readonly player: Racer;
  darts: Dart[] = [];
  mines: Mine[] = [];
  pickups: Pickup[];
  hazards: Hazard[];
  phase: Phase = 'grid';
  /** Seconds left in the current phase (grid countdown, the after-finish hold). */
  phaseT: number = RACE.countdown;
  /** Seconds since GO. */
  raceT = 0;
  finishOrder: Racer[] = [];
  /** The player's completed lap times. */
  lapTimes: number[] = [];
  /** The final standings, set when the results board comes up. */
  results: Racer[] | null = null;
  /** Points scored in this race. */
  score = 0;
  charges: number;
  machine: Machine;
  autopilot: boolean;
  /** Dev: rivals hold still. */
  frozen = false;
  readonly league: number;
  private events: RaceEvent[] = [];
  private readonly rng: () => number;

  constructor(readonly def: TrackDef, opts: RaceOptions) {
    this.league = opts.league ?? 0;
    this.track = buildTrack(def.ctrl, LEAGUES[this.league].reverse);
    this.rng = mulberry32(opts.seed);
    this.machine = opts.machine;
    this.charges = clamp(opts.charges ?? WEAPONS.startCharges, 0, WEAPONS.maxCharges);
    this.autopilot = opts.autopilot ?? false;
    const t = this.track;
    const racer = (kind: Kind, slot: SpriteKey, p: { name: string; initial: string; color: string; grid: number }, pace: number): Racer => {
      const [back, lat] = GRID[p.grid];
      return {
        ...carAt(t, -back / t.n, lat, -1), kind, slot, name: p.name, initial: p.initial, color: p.color, pace,
        lane: lat * 0.3, cool: 0, lapStart: 0, finishT: null,
      };
    };
    this.player = racer('player', this.machine.slot, PLAYER_PILOT, 1);
    this.cars = [this.player, ...RIVALS.map((r) => racer(r.kind, r.slot, r, r.pace))];
    const place = <K extends string>(kind: K, f: number, lat: number) => {
      const p = at(t, f, lat);
      return { kind, x: p.x, y: p.y, seg: p.seg, lat, h: p.h };
    };
    this.pickups = def.pickups.map(([k, f, lat]) => ({ ...place(k, f, lat), t: 0 }));
    this.hazards = def.hazards.map(([k, f, lat]) => place(k, f, lat));
  }

  /** Events since the last call, oldest first. */
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: RaceEvent) {
    this.events.push(e);
  }

  statsOf(c: Racer): Stats {
    if (c === this.player) return this.machine;
    const behind = Math.max(0, -this.progressGap(this.player, c) / this.track.n);
    const catchUp = 1 + Math.min(RIVAL.catchUpMax, behind * RIVAL.catchUp);
    return { top: RIVAL.top * c.pace * LEAGUES[this.league].pace * catchUp, accel: RIVAL.accel, turn: RIVAL.turn, grip: RIVAL.grip };
  }

  /** Samples `b` is ahead of `a`, counting laps. */
  progressGap(a: Racer, b: Racer) {
    return (b.laps * this.track.n + b.seg) - (a.laps * this.track.n + a.seg);
  }

  /** Current order: finishers in finishing order, then by distance covered. */
  standings(): Racer[] {
    const n = this.track.n;
    const key = (c: Racer) => (c.finished ? 1e9 - this.finishOrder.indexOf(c) : c.laps * n + c.seg);
    return [...this.cars].sort((a, b) => key(b) - key(a));
  }

  placeOf(c: Racer) {
    return this.standings().indexOf(c) + 1;
  }

  step(dt: number, input: PlayerInput = NO_INPUT) {
    if (this.phase === 'results') return;
    if (this.phase === 'grid') {
      const before = lightsLit(this.phaseT);
      this.phaseT -= dt;
      const lit = lightsLit(this.phaseT);
      if (lit > before && this.phaseT > 0) this.emit({ type: 'light', lit });
      if (this.phaseT <= 0) {
        this.phase = 'race';
        this.emit({ type: 'go' });
      }
    } else {
      this.raceT += dt;
      if (this.phase === 'race' && this.raceT > RACE.cap) { this.phase = 'done'; this.phaseT = 0; }
      if (this.phase === 'done') {
        this.phaseT -= dt;
        const allHome = this.cars.every((c) => c.finished) && RACE.doneHold - this.phaseT >= RACE.doneMin;
        if (this.phaseT <= 0 || allHome) {
          this.phase = 'results';
          this.results = this.standings();
          this.emit({ type: 'results' });
          return;
        }
      }
    }

    const moving = this.phase !== 'grid';
    for (const c of this.cars) {
      c.cool = Math.max(0, c.cool - dt);
      const st = this.statsOf(c);
      let ctl: Control;
      if (!moving || (this.frozen && c !== this.player)) ctl = HOLD;
      else if (c === this.player && !c.finished && !this.autopilot) ctl = input.drive;
      else ctl = this.aiControl(c, st, c === this.player);
      const r = drive(this.track, c, ctl, st, dt);
      if (c.finished) { c.vx *= Math.exp(-1.2 * dt); c.vy *= Math.exp(-1.2 * dt); }
      if (r.wall > CAR.scrape) this.emit({ type: 'wall', car: c, speed: r.wall, x: c.x, y: c.y });
      if (r.crossed > 0) this.crossLine(c);
    }
    if (moving && !this.player.finished) {
      if (this.autopilot) this.pilotWeapons(this.player);
      else {
        if (input.fire) this.fire(this.player);
        if (input.drop) this.drop(this.player);
      }
    }
    this.contact();
    this.updatePickups(dt, moving);
    this.updateHazards();
    this.updateDarts(dt);
    this.updateMines(dt);
  }

  private crossLine(c: Racer) {
    if (c.laps < 1) { c.lapStart = this.raceT; return; }
    if (c.finished) return;
    const lapTime = this.raceT - c.lapStart;
    c.lapStart = this.raceT;
    if (c === this.player) this.lapTimes.push(lapTime);
    if (c.laps >= this.def.laps) {
      c.finished = true;
      c.finishT = this.raceT;
      this.finishOrder.push(c);
      const place = this.finishOrder.length;
      const points = c === this.player ? SCORE.place[place - 1] ?? 0 : 0;
      if (c === this.player) {
        this.score += points;
        this.phase = 'done';
        this.phaseT = RACE.doneHold;
      }
      this.emit({ type: 'finish', car: c, place, points });
    } else if (c === this.player) {
      this.emit(c.laps === this.def.laps - 1 ? { type: 'finalLap' } : { type: 'lap', time: lapTime });
    }
  }

  // ---- Driving ----

  private ahead(c: Racer, k: number) {
    return this.track.pts[(c.seg + k) % this.track.n];
  }

  /**
   * Line following: aim at a point a speed-dependent distance ahead, at the car's lane, steering round slicks and
   * coolant, and lift or brake when a sharp bend is coming. The autopilot (`pilot`) also takes the inside of bends
   * and drives through charge cells.
   */
  aiControl(c: Racer, st: Stats, pilot = false): Control {
    const n = this.track.n, sp = speedOf(c);
    const look = 6 + Math.floor(sp / 14);
    let lane = c.lane;
    if (pilot) {
      lane = clamp(this.ahead(c, look + 6).curv * 34, -15, 15);
      for (const pk of this.pickups) {
        if (pk.t > 0) continue;
        const d = (pk.seg - c.seg + n) % n;
        if (d > 4 && d < 40) { lane = pk.lat; break; }
      }
    }
    const margin = pilot ? 15 : 14, swerve = pilot ? 20 : 18;
    for (const hz of this.hazards) {
      const d = (hz.seg - c.seg + n) % n;
      if (d > 0 && d < (pilot ? 26 : 22) && Math.abs(lane - hz.lat) < margin) lane = hz.lat > 0 ? hz.lat - swerve : hz.lat + swerve;
    }
    lane = clamp(lane, -TRACK.halfWidth + 6, TRACK.halfWidth - 6);
    const p = this.ahead(c, look), tx = p.x + p.nx * lane, ty = p.y + p.ny * lane;
    const heading = Math.atan2(ty - c.y, tx - c.x);
    const bend = Math.abs(angDiff(this.ahead(c, look + 12).h, c.a));
    let throttle = 1, brake = false;
    if (bend > 0.7 && sp > st.top * 0.7) { throttle = 0; brake = bend > 1.05; }
    return { heading, throttle, brake, turn: 0 };
  }

  /** The autopilot's trigger finger: now and then a dart at a car just ahead, or a mine for one just behind. */
  private pilotWeapons(c: Racer) {
    if (c.cool > 0 || this.charges <= 1) return;
    for (const o of this.cars) {
      if (o === c || o.finished) continue;
      const g = this.progressGap(c, o);
      if (g > 3 && g < 22 && Math.abs(o.lat - c.lat) < 12 && this.rng() < 0.015) { this.fire(c); c.cool = 2.5; return; }
      if (g < -2 && g > -9 && this.rng() < 0.008) { this.drop(c); c.cool = 2.5; return; }
    }
  }

  private contact() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= 0 || d >= CONTACT.dist) continue;
      const push = (CONTACT.dist - d) / 2, ux = dx / d, uy = dy / d;
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
      if (rel < 0) {
        const k = rel * CONTACT.transfer;
        a.vx += ux * k; a.vy += uy * k;
        b.vx -= ux * k; b.vy -= uy * k;
        if (rel < -CONTACT.hard) this.emit({ type: 'bump', a, b, speed: -rel, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }

  // ---- Weapons ----

  fire(c: Racer) {
    if (this.phase !== 'race' || c.finished || c.spin > 0 || c.cool > 0) return false;
    if (this.charges <= 0) { this.emit({ type: 'empty' }); return false; }
    this.charges--;
    c.cool = WEAPONS.cool;
    const D = WEAPONS.dart;
    this.darts.push({ x: c.x + Math.cos(c.a) * 9, y: c.y + Math.sin(c.a) * 9, a: c.a, v: speedOf(c) + D.speed, life: D.life, owner: c, seg: c.seg, lat: c.lat, laps: 0 });
    this.emit({ type: 'fire', car: c });
    return true;
  }

  drop(c: Racer) {
    if (this.phase !== 'race' || c.finished || c.cool > 0) return false;
    if (this.charges <= 0) { this.emit({ type: 'empty' }); return false; }
    this.charges--;
    c.cool = WEAPONS.cool;
    const M = WEAPONS.mine;
    this.mines.push({ x: c.x - Math.cos(c.a) * M.behind, y: c.y - Math.sin(c.a) * M.behind, arm: M.arm, t: 0, owner: c, dead: false });
    this.emit({ type: 'drop', car: c });
    return true;
  }

  /** Spins a car out. A hit by the player scores. Returns false if it was already spinning. */
  spinOut(c: Racer, by: Racer | null, secs: number) {
    if (c.spin > 0) return false;
    c.spin = secs;
    c.spinDir = this.rng() < 0.5 ? -1 : 1;
    this.emit({ type: 'spin', car: c, by, x: c.x, y: c.y });
    if (by === this.player && c !== this.player) this.addScore(SCORE.hit, `+${SCORE.hit}`, c.x, c.y);
    return true;
  }

  private addScore(points: number, label: string, x: number, y: number) {
    this.score += points;
    this.emit({ type: 'score', points, label, x, y });
  }

  private updateDarts(dt: number) {
    const D = WEAPONS.dart;
    for (const d of this.darts) {
      let target: Racer | null = null, best: number = D.homeRange;
      for (const c of this.cars) {
        if (c === d.owner) continue;
        const dx = c.x - d.x, dy = c.y - d.y, r = Math.hypot(dx, dy);
        if (r < best && Math.abs(angDiff(Math.atan2(dy, dx), d.a)) < D.homeCone) { best = r; target = c; }
      }
      if (target) d.a += clamp(angDiff(Math.atan2(target.y - d.y, target.x - d.x), d.a), -D.homeTurn * dt, D.homeTurn * dt);
      d.x += Math.cos(d.a) * d.v * dt;
      d.y += Math.sin(d.a) * d.v * dt;
      d.life -= dt;
      locate(this.track, d);
      if (Math.abs(d.lat) > TRACK.halfWidth + TRACK.apron) d.life = 0;
      for (const c of this.cars) {
        if (c === d.owner || d.life <= 0 || dist(c, d) >= D.hitR) continue;
        this.spinOut(c, d.owner, D.spin);
        d.life = 0;
      }
    }
    this.darts = this.darts.filter((d) => d.life > 0);
  }

  private updateMines(dt: number) {
    const M = WEAPONS.mine;
    for (const m of this.mines) {
      const wasArmed = m.arm <= 0;
      m.arm -= dt;
      m.t += dt;
      if (m.arm <= 0 && !wasArmed) this.emit({ type: 'armed', mine: m });
      if (m.arm > 0) continue;
      const hit = this.cars.find((c) => dist(c, m) < M.hitR);
      if (hit) { this.spinOut(hit, m.owner, M.spin); m.dead = true; }
    }
    this.mines = this.mines.filter((m) => !m.dead && m.t < M.life);
  }

  // ---- Pickups and hazards ----

  private updatePickups(dt: number, moving: boolean) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.t > 0) { pk.t = Math.max(0, pk.t - dt); continue; }
      if (!moving || p.finished || dist(p, pk) >= PICKUP.r) continue;
      pk.t = PICKUP.respawn;
      this.charges = Math.min(WEAPONS.maxCharges, this.charges + PICKUP.cellCharges);
      this.emit({ type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y });
      this.addScore(SCORE.pickup, `+${PICKUP.cellCharges} CHARGE`, pk.x, pk.y);
    }
  }

  private updateHazards() {
    for (const hz of this.hazards) for (const c of this.cars) {
      const d = dist(c, hz);
      if (hz.kind === 'coolant' && d < HAZARD.coolant.r) {
        if (c.wet <= 0) this.emit({ type: 'coolant', car: c });
        c.wet = HAZARD.coolant.hold;
      }
      if (hz.kind === 'slick' && d < HAZARD.slick.r && speedOf(c) > HAZARD.slick.minSpeed) this.spinOut(c, null, HAZARD.slick.spin);
    }
  }

  // ---- Dev hooks ----

  /** Moves a car to `frac` of the way round, `lat` px right of the centreline, stopped, facing along the track + `turn`. */
  place(c: Racer, frac: number, lat = 0, turn = 0) {
    const p = at(this.track, frac, lat);
    Object.assign(c, { x: p.x, y: p.y, seg: p.seg, lat, a: p.h + turn, vx: 0, vy: 0, spin: 0, wet: 0 });
  }

  /** Takes the rivals off the track: you race alone. */
  solo() {
    this.cars = [this.player];
  }

  /** Skips the grid lights. */
  go() {
    this.phaseT = 0;
    this.phase = 'race';
  }

  /** Samples between two racers along the track, ignoring laps. */
  gapAlong(a: Racer, b: Racer) {
    return segGap(this.track, a.seg, b.seg);
  }
}
