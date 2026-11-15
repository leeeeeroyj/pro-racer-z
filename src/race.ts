// One race, pure: hover physics, the rivals' driving, darts, mines, pickups, hazards, car contact and standings.
// The scene draws it and turns its events into sounds and effects. Tests run whole races here without rendering.
import {
  CAR, CONTACT, GRID, HAZARD, HEAT, LEAGUES, MACHINES, OVERDRIVE, PICKUP, PLAYER_PILOT, RACE, RIVAL, RIVALS, SCORE, SPIN,
  TRACK, UPGRADE, WALL, WEAPONS, WORD, type Kind, type Machine, type SpriteKey, type Upgrade,
} from './config';
import type { HazardKind, PickupKind, TrackDef } from './data/tracks';
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
  /** Seconds of boost-pad thrust left. */
  boost: number;
  /** A shield soaks up the next spin. */
  shield: boolean;
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
  return { x: p.x, y: p.y, seg: p.seg, lat, laps, a: p.h, vx: 0, vy: 0, finished: false, spin: 0, spinDir: 1, wet: 0, boost: 0, shield: false };
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

/** Multipliers from the weather (a storm cloud overhead). */
export interface Env { top: number; grip: number }
const CLEAR: Env = { top: 1, grip: 1 };

/**
 * One physics step. The car keeps forward and sideways velocity separately: steering turns the body, grip bleeds the
 * sideways part away, so it slides a little like a hovercraft. The apron, coolant and rain slow it; a boost pad
 * speeds it up; a spinning car has no control; the wall stops it and bounces.
 */
export function drive(track: Track, c: Car, ctl: Control, st: Stats, dt: number, env: Env = CLEAR): DriveResult {
  let topMul = env.top, gripMul = env.grip, accelMul = 1;
  if (Math.abs(c.lat) > TRACK.halfWidth) { topMul *= TRACK.apronTop; gripMul *= TRACK.apronGrip; }
  if (c.wet > 0) topMul *= HAZARD.coolant.factor;
  if (c.boost > 0) { topMul *= HAZARD.boost.top; accelMul = HAZARD.boost.accel; }
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
    if (ctl.throttle > 0 && fwd < top) fwd = Math.min(top, fwd + st.accel * accelMul * ctl.throttle * dt);
    if (ctl.hold) {
      fwd *= Math.exp(-CAR.hold * dt);
      side *= Math.exp(-CAR.hold * dt);
    } else if (ctl.brake) {
      fwd -= (fwd > 0 ? CAR.brake : CAR.reverseAccel) * dt;
    }
    if (!ctl.throttle && !ctl.brake && !ctl.hold) fwd *= Math.exp(-CAR.coast * dt);
    side *= Math.exp(-st.grip * gripMul * dt);
  }
  // Above the limit (on to the apron at speed, into coolant, off a boost) the car eases down rather than stopping dead.
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
  c.boost = Math.max(0, c.boost - dt);
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
  /** The slick under the car, if any: a slick spins you as you drive on to it, not again while you pull away. */
  slick: Hazard | null;
}
export interface Dart extends Rider { a: number; v: number; life: number; owner: Racer }
export interface Mine { x: number; y: number; arm: number; t: number; owner: Racer; dead: boolean }
interface Spot { x: number; y: number; seg: number; lat: number; h: number }
export interface Pickup extends Spot {
  kind: PickupKind | 'letter';
  /** Letter index into WORD, for letters. */
  idx: number;
  /** Seconds until it's back. */
  t: number;
  /** Taken for good (letters don't come back). */
  gone: boolean;
}
/** Things on the asphalt. `rest` is a glitch skull's pause after it bites. */
export interface Hazard extends Spot { kind: 'coolant' | 'slick' | 'boost' | 'glitch'; rest: number }
export interface Cloud { f: number; speed: number; x: number; y: number; seg: number; flick: number }
export interface Gate extends Spot { t: number }
export interface Drone { seg: number; ph: number; x: number; y: number; lat: number; h: number }

export type GateState = 'off' | 'warn' | 'on';
const GATE = HAZARD.gate, CYCLE = GATE.off + GATE.warn + GATE.on;
export const gateState = (g: Gate): GateState => {
  const t = g.t % CYCLE;
  return t < GATE.off ? 'off' : t < GATE.off + GATE.warn ? 'warn' : 'on';
};
/** Seconds until the gate's state next changes. */
export const gateLeft = (g: Gate) => {
  const t = g.t % CYCLE;
  return t < GATE.off ? GATE.off - t : t < GATE.off + GATE.warn ? GATE.off + GATE.warn - t : CYCLE - t;
};

/** A drone's lateral offset at phase `ph`: it sweeps the track's width and back. */
export const droneLat = (ph: number) => Math.sin(ph * HAZARD.drone.rate) * (TRACK.halfWidth - HAZARD.drone.edge);

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
  | { type: 'shield'; car: Racer }
  | { type: 'score'; points: number; label: string; x: number; y: number }
  | { type: 'pickup'; kind: Pickup['kind']; x: number; y: number }
  | { type: 'upgrade'; kind: Upgrade; level: number }
  | { type: 'letter'; idx: number }
  | { type: 'overdrive'; mk: number; retry: boolean }
  | { type: 'coolant'; car: Racer }
  | { type: 'boost'; car: Racer }
  | { type: 'glitch'; lost: number }
  | { type: 'gateWarn'; gate: Gate }
  | { type: 'heat'; heat: number }
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
  /** Machine index into MACHINES. */
  mk?: number;
  charges?: number;
  letters?: readonly boolean[];
  up?: Readonly<Record<Upgrade, number>>;
  heat?: number;
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
  hazards: Hazard[] = [];
  clouds: Cloud[] = [];
  gates: Gate[] = [];
  drones: Drone[] = [];
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
  mk: number;
  letters: boolean[];
  up: Record<Upgrade, number>;
  /** Dynamo's grudge, 0..HEAT.max. */
  heat: number;
  /** Retries won in this race (OVERDRIVE in the Mk III). */
  retriesWon = 0;
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
    this.mk = opts.mk ?? 0;
    this.charges = clamp(opts.charges ?? WEAPONS.startCharges, 0, WEAPONS.maxCharges);
    this.letters = [...(opts.letters ?? Array<boolean>(WORD.length).fill(false))];
    this.up = { thruster: 0, core: 0, grip: 0, ...opts.up };
    this.heat = opts.heat ?? 0;
    this.autopilot = opts.autopilot ?? false;
    const t = this.track;
    const racer = (kind: Kind, slot: SpriteKey, p: { name: string; initial: string; color: string; grid: number }, pace: number): Racer => {
      const [back, lat] = GRID[p.grid];
      return {
        ...carAt(t, -back / t.n, lat, -1), kind, slot, name: p.name, initial: p.initial, color: p.color, pace,
        lane: lat * 0.3, cool: 0, lapStart: 0, finishT: null, slick: null,
      };
    };
    this.player = racer('player', this.machine.slot, PLAYER_PILOT, 1);
    this.cars = [this.player, ...RIVALS.map((r) => racer(r.kind, r.slot, r, r.pace))];
    this.pickups = def.pickups.map(([k, f, lat]) => this.makePickup(k, f, lat));
    const missing = this.letters.map((got, i) => (got ? -1 : i)).filter((i) => i >= 0);
    def.letters.forEach(([f, lat], k) => { if (k < missing.length) this.pickups.push(this.makePickup('letter', f, lat, missing[k])); });
    for (const [kind, f, lat, from = 0] of def.hazards) if (this.league >= from) this.spawn(kind, f, lat);
  }

  get machine(): Machine {
    return MACHINES[this.mk];
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

  private spot(f: number, lat: number): Spot {
    const p = at(this.track, f, lat);
    return { x: p.x, y: p.y, seg: p.seg, lat, h: p.h };
  }

  private makePickup(kind: Pickup['kind'], f: number, lat: number, idx = -1): Pickup {
    return { ...this.spot(f, lat), kind, idx, t: 0, gone: false };
  }

  statsOf(c: Racer): Stats {
    if (c === this.player) {
      const m = this.machine, u = this.up;
      return { top: m.top + u.core * UPGRADE.top, accel: m.accel * (1 + UPGRADE.accel * u.thruster), turn: m.turn + u.grip * UPGRADE.turn, grip: m.grip + u.grip * UPGRADE.grip };
    }
    const behind = Math.max(0, -this.progressGap(this.player, c) / this.track.n);
    const catchUp = 1 + Math.min(RIVAL.catchUpMax, behind * RIVAL.catchUp);
    const grudge = c.kind === 'dynamo' && this.heat >= HEAT.max ? HEAT.boost : 1;
    return { top: RIVAL.top * c.pace * LEAGUES[this.league].pace * catchUp * grudge, accel: RIVAL.accel, turn: RIVAL.turn, grip: RIVAL.grip };
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

  /** Rain under any storm cloud. */
  envAt(c: Car): Env {
    const C = HAZARD.cloud;
    return this.clouds.some((cl) => dist(c, cl) < C.r) ? { top: C.top, grip: C.grip } : CLEAR;
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
      const r = drive(this.track, c, ctl, st, dt, this.envAt(c));
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
    this.updateHazards(dt);
    this.updateWeather(dt);
    this.updateGates(dt);
    this.updateDrones(dt);
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
   * Line following: aim at a point a speed-dependent distance ahead, at the car's lane, steering round hazards and
   * drones and lifting or braking for sharp bends and live laser gates. Lanes by personality: Halo (and the autopilot)
   * take the inside of every bend; Vex moves across to block you when you're close behind him; Dynamo sits right of centre.
   * The autopilot also drives through pickups.
   */
  aiControl(c: Racer, st: Stats, pilot = false): Control {
    const n = this.track.n, sp = speedOf(c), you = this.player;
    const look = 6 + Math.floor(sp / 14);
    const bendAhead = this.ahead(c, look + 6).curv;
    let lane = c.lane;
    if (c.kind === 'halo' || pilot) lane = clamp(bendAhead * 34, -15, 15);
    if (c.kind === 'vex') {
      const g = this.progressGap(you, c);
      lane = g > 0 && g < 12 && !you.finished ? clamp(you.lat, -16, 16) : clamp(bendAhead * 20, -12, 12);
    }
    if (c.kind === 'dynamo') lane = 6;
    if (pilot) {
      for (const pk of this.pickups) {
        if (pk.t > 0 || pk.gone) continue;
        const d = (pk.seg - c.seg + n) % n;
        if (d > 4 && d < 40) { lane = pk.lat; break; }
      }
    }
    const margin = pilot ? 15 : 14, swerve = pilot ? 20 : 18;
    const dodge = (lat: number) => { if (Math.abs(lane - lat) < margin) lane = lat > 0 ? lat - swerve : lat + swerve; };
    const near = (seg: number) => { const d = (seg - c.seg + n) % n; return d > 0 && d < look + (pilot ? 20 : 16) ? d : 0; };
    for (const hz of this.hazards) {
      if (hz.kind === 'boost' || (hz.kind === 'glitch' && !pilot)) continue;
      if (near(hz.seg)) dodge(hz.lat);
    }
    // A drone is dodged where it will be when we get there.
    for (const dr of this.drones) {
      const d = near(dr.seg);
      if (d) dodge(droneLat(dr.ph + (d * TRACK.step) / Math.max(sp, 40)));
    }
    lane = clamp(lane, -TRACK.halfWidth + 6, TRACK.halfWidth - 6);
    // Chasing a point L ahead round a bend of curvature κ settles L²κ/2 inside the line, so aim that much wide.
    const L = look * TRACK.step, kappa = this.ahead(c, look >> 1).curv / (10 * TRACK.step);
    const aim = lane - (L * L * kappa) / 2;
    const p = this.ahead(c, look), tx = p.x + p.nx * aim, ty = p.y + p.ny * aim;
    const heading = Math.atan2(ty - c.y, tx - c.x);
    const bend = Math.abs(angDiff(this.ahead(c, look + 12).h, c.a));
    let throttle = 1, brake = false;
    if (bend > 0.7 && sp > st.top * 0.7) { throttle = 0; brake = bend > 1.05; }
    // Wait for a gate that will still be live when we reach it.
    for (const g of this.gates) {
      const d = (g.seg - c.seg + n) % n;
      if (d > 0 && d < 16 && gateState(g) !== 'off' && gateLeft(g) > d / 60) { throttle = 0; brake = sp > 30; }
    }
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

  /**
   * Spins a car out, unless it's already spinning or a shield takes the hit. A rival spun by the player scores and
   * adds to Dynamo's heat. Returns whether it spun.
   */
  spinOut(c: Racer, by: Racer | null, secs: number) {
    if (c.spin > 0) return false;
    if (c.shield) {
      c.shield = false;
      this.emit({ type: 'shield', car: c });
      return false;
    }
    c.spin = secs;
    c.spinDir = this.rng() < 0.5 ? -1 : 1;
    this.emit({ type: 'spin', car: c, by, x: c.x, y: c.y });
    if (by === this.player && c !== this.player) {
      this.addScore(SCORE.hit, `+${SCORE.hit}`, c.x, c.y);
      if (this.heat < HEAT.max) {
        this.heat++;
        this.emit({ type: 'heat', heat: this.heat });
      }
    }
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

  // ---- Pickups ----

  private updatePickups(dt: number, moving: boolean) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.gone) continue;
      if (pk.t > 0) { pk.t = Math.max(0, pk.t - dt); continue; }
      if (!moving || p.finished || dist(p, pk) >= PICKUP.r) continue;
      this.collect(pk);
    }
  }

  private collect(pk: Pickup) {
    this.emit({ type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y });
    if (pk.kind === 'letter') {
      pk.gone = true;
      this.letters[pk.idx] = true;
      this.addScore(SCORE.letter, `${WORD[pk.idx]} +${SCORE.letter}`, pk.x, pk.y);
      this.emit({ type: 'letter', idx: pk.idx });
      if (this.letters.every(Boolean)) this.overdrive();
      return;
    }
    pk.t = PICKUP.respawn;
    if (pk.kind === 'cell') {
      this.charges = Math.min(WEAPONS.maxCharges, this.charges + PICKUP.cellCharges);
      this.addScore(SCORE.pickup, `+${PICKUP.cellCharges} CHARGE`, pk.x, pk.y);
    } else if (pk.kind === 'shield') {
      this.player.shield = true;
      this.addScore(SCORE.pickup, 'SHIELD', pk.x, pk.y);
    } else {
      const k = pk.kind, maxed = this.up[k] >= UPGRADE.max;
      if (!maxed) this.up[k]++;
      this.addScore(SCORE.pickup, `${k.toUpperCase()} ${maxed ? 'MAX' : this.up[k]}`, pk.x, pk.y);
      this.emit({ type: 'upgrade', kind: k, level: this.up[k] });
    }
  }

  /** All nine letters: the next machine (with fresh upgrades), or in the Mk III big points and a retry. */
  private overdrive() {
    this.letters = this.letters.map(() => false);
    const p = this.player, top = this.mk >= MACHINES.length - 1;
    if (top) {
      this.retriesWon++;
      this.addScore(OVERDRIVE.topPoints, `+${OVERDRIVE.topPoints.toLocaleString('en')}`, p.x, p.y - 12);
    } else {
      this.mk++;
      this.up = { thruster: 0, core: 0, grip: 0 };
      p.slot = this.machine.slot;
      this.addScore(OVERDRIVE.points, `+${OVERDRIVE.points.toLocaleString('en')}`, p.x, p.y - 12);
    }
    this.emit({ type: 'overdrive', mk: this.mk, retry: top });
  }

  // ---- Hazards ----

  private updateHazards(dt: number) {
    const H = HAZARD;
    for (const hz of this.hazards) {
      hz.rest = Math.max(0, hz.rest - dt);
      for (const c of this.cars) {
        const d = dist(c, hz);
        if (hz.kind === 'slick') {
          if (d >= H.slick.r) { if (c.slick === hz) c.slick = null; continue; }
          if (c.slick !== hz && speedOf(c) > H.slick.minSpeed) this.spinOut(c, null, H.slick.spin);
          c.slick = hz;
        } else if (hz.kind === 'coolant' && d < H.coolant.r) {
          if (c.wet <= 0) this.emit({ type: 'coolant', car: c });
          c.wet = H.coolant.hold;
        } else if (hz.kind === 'boost' && d < H.boost.r && c.boost <= H.boost.secs - H.boost.rearm) {
          c.boost = H.boost.secs;
          this.emit({ type: 'boost', car: c });
        } else if (hz.kind === 'glitch' && c === this.player && d < H.glitch.r && hz.rest <= 0) {
          hz.rest = H.glitch.rest;
          const lost = Math.min(H.glitch.charges, this.charges);
          this.charges -= lost;
          this.emit({ type: 'glitch', lost });
        }
      }
    }
  }

  private updateWeather(dt: number) {
    for (const cl of this.clouds) {
      cl.f = (cl.f + cl.speed * dt) % 1;
      this.placeCloud(cl);
      cl.flick = Math.max(0, cl.flick - dt);
      if (this.rng() < dt * 0.15) cl.flick = 0.25;
    }
  }

  private placeCloud(cl: Cloud) {
    const p = at(this.track, cl.f, HAZARD.cloud.lat);
    Object.assign(cl, { x: p.x, y: p.y, seg: p.seg });
  }

  private updateGates(dt: number) {
    const you = this.player;
    for (const g of this.gates) {
      const before = gateState(g);
      g.t += dt;
      const now = gateState(g);
      if (now === 'warn' && before !== 'warn' && dist(you, g) < GATE.warnRange) this.emit({ type: 'gateWarn', gate: g });
      if (now !== 'on') continue;
      for (const c of this.cars) {
        if (Math.abs(segGap(this.track, g.seg, c.seg)) > 1) continue;
        if (this.spinOut(c, null, GATE.spin)) { c.vx *= GATE.stop; c.vy *= GATE.stop; }
      }
    }
  }

  private updateDrones(dt: number) {
    const D = HAZARD.drone;
    for (const dr of this.drones) {
      dr.ph += dt;
      this.placeDrone(dr);
      for (const c of this.cars) if (dist(c, dr) < D.r) this.spinOut(c, null, D.spin);
    }
  }

  private placeDrone(dr: Drone) {
    const p = this.track.pts[dr.seg];
    dr.lat = droneLat(dr.ph);
    Object.assign(dr, { x: p.x + p.nx * dr.lat, y: p.y + p.ny * dr.lat, h: p.h });
  }

  // ---- Placement and dev hooks ----

  /** Puts a hazard on the track (from the track data, or a test). */
  spawn(kind: HazardKind, f: number, lat = 0) {
    const C = HAZARD.cloud;
    if (kind === 'cloud') {
      const cl: Cloud = { f, speed: C.speed + this.clouds.length * C.speedStep, x: 0, y: 0, seg: 0, flick: 0 };
      this.placeCloud(cl);
      this.clouds.push(cl);
      return cl;
    }
    if (kind === 'gate') {
      const g: Gate = { ...this.spot(f, 0), t: this.gates.length * 2.1 };
      this.gates.push(g);
      return g;
    }
    if (kind === 'drone') {
      const dr: Drone = { seg: this.spot(f, 0).seg, ph: this.drones.length * 1.7, x: 0, y: 0, lat: 0, h: 0 };
      this.placeDrone(dr);
      this.drones.push(dr);
      return dr;
    }
    const hz: Hazard = { ...this.spot(f, lat), kind, rest: 0 };
    this.hazards.push(hz);
    return hz;
  }

  /** Puts a pickup on the track; `idx` picks the letter. */
  spawnPickup(kind: Pickup['kind'], f: number, lat = 0, idx = 0) {
    const pk = this.makePickup(kind, f, lat, kind === 'letter' ? idx : -1);
    this.pickups.push(pk);
    return pk;
  }

  /** Moves a car to `frac` of the way round, `lat` px right of the centreline, stopped, facing along the track + `turn`. */
  place(c: Racer, frac: number, lat = 0, turn = 0) {
    const p = at(this.track, frac, lat);
    Object.assign(c, { x: p.x, y: p.y, seg: p.seg, lat, a: p.h + turn, vx: 0, vy: 0, spin: 0, wet: 0, boost: 0, slick: null });
  }

  /** Takes the rivals off the track: you race alone. */
  solo() {
    this.cars = [this.player];
  }

  /** Clears every pickup and hazard. */
  clear() {
    this.pickups = [];
    this.hazards = [];
    this.clouds = [];
    this.gates = [];
    this.drones = [];
  }

  /** Skips the grid lights. */
  go() {
    this.phaseT = 0;
    this.phase = 'race';
  }
}
