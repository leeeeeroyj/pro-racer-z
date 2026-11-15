import Phaser from 'phaser';
import { HUD_STATE, LEAGUES, MACHINES, RACE, TEXT, WEAPONS } from '../config';
import { FrameClock } from '../clock';
import { Controls, type Device } from '../controls';
import { TRACKS, type TrackDef } from '../data/tracks';
import { NO_INPUT, Race, lightsLit, speedOf, type RaceEvent } from '../race';
import { RaceView } from '../raceView';
import { playSound, registerSounds, restoreMute, toggleMute, type SoundName } from '../sfx';
import { TrackView } from '../trackView';

/** Registry keys that last between races: the running score and the charges you carry. */
export const SEASON = { score: 'score', charges: 'charges' } as const;

export interface ResultRow {
  place: number;
  name: string;
  color: string;
  time: string;
  you: boolean;
}

export interface HudState {
  track: string;
  league: string;
  place: number;
  of: number;
  /** 1-based lap shown on the HUD, clamped to the race's laps. */
  lap: number;
  laps: number;
  raceTime: number;
  charges: number;
  score: number;
  device: Device;
  /** Controls hint on the grid and early in the race. */
  hint: boolean;
  /** Grid lights lit, 0–3, or null once the race is on. */
  lights: number | null;
  banner: { text: string; color: string } | null;
  results: { rows: ResultRow[]; points: number; total: number; ready: boolean } | null;
}

export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
export const ordinal = (n: number) => `${n}${['TH', 'ST', 'ND', 'RD'][n] ?? 'TH'}`;
const pts = (n: number) => n.toLocaleString('en');

export class RaceScene extends Phaser.Scene {
  race!: Race;
  private def!: TrackDef;
  private view!: RaceView;
  private controls!: Controls;
  private frames = new FrameClock();
  private trackIndex = 0;
  private mk = 0;
  private banner: { text: string; color: string; until: number } | null = null;
  private clock = 0;
  private resultsAt = 0;
  private leaving = false;
  /** Dev only: the last sounds played, for tests. */
  played: SoundName[] = [];

  constructor() {
    super('race');
  }

  create(data: { track?: number; mk?: number; seed?: number }) {
    this.trackIndex = data.track ?? 0;
    this.mk = data.mk ?? 0;
    this.def = TRACKS[this.trackIndex];
    this.controls = new Controls(this);
    registerSounds(this);
    restoreMute(this);
    if (!this.registry.has(SEASON.score)) this.registry.set(SEASON.score, 0);
    if (!this.registry.has(SEASON.charges)) this.registry.set(SEASON.charges, WEAPONS.startCharges);
    this.race = new Race(this.def, {
      seed: data.seed ?? Math.floor(Math.random() * 2 ** 31),
      machine: MACHINES[this.mk],
      charges: this.registry.get(SEASON.charges),
    });
    const track = new TrackView(this, this.def, this.race.track, this.race.league);
    this.view = new RaceView(this, this.race, track);
    this.banner = null;
    this.clock = 0;
    this.resultsAt = 0;
    this.leaving = false;
    this.played = [];
    this.frames = new FrameClock();
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.cameras.main.fadeIn(250);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.registry.remove(HUD_STATE));
  }

  update(time: number) {
    const steps = this.frames.steps(time);
    const dt = steps.reduce((a, b) => a + b, 0);
    this.clock += dt;
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.back) return this.leave('title');
    const r = this.race;
    if (r.phase === 'results') {
      if (input.confirm && this.clock - this.resultsAt > RACE.resultsLock) this.next();
    } else {
      // Fire and drop are presses: they go in with the first step only.
      steps.forEach((s, i) => r.step(s, i === 0 ? input : { ...NO_INPUT, drive: input.drive }));
    }
    const events = r.takeEvents();
    for (const e of events) this.play(e);
    this.view.sync(dt, events);
    this.view.follow(dt);
    this.publishHud(input.device);
  }

  private play(e: RaceEvent) {
    const r = this.race, you = r.player;
    switch (e.type) {
      case 'light': this.cue('light'); break;
      case 'go': this.cue('go'); this.showBanner('GO!', TEXT.lime, 0.8); break;
      case 'lap': this.cue('lap'); this.showBanner(`LAP ${fmtTime(e.time)}`, TEXT.ink, 1.6); break;
      case 'finalLap': this.cue('finalLap'); this.showBanner('FINAL LAP', TEXT.amber, 1.6); break;
      case 'finish':
        if (e.car !== you) break;
        this.cue(e.place <= 3 ? 'place' : 'lose');
        this.showBanner(e.place <= 3 ? `${ordinal(e.place)}!  +${pts(e.points)}` : `${ordinal(e.place)}  ·  NO POINTS`, e.place <= 3 ? TEXT.kerb : TEXT.hurt, RACE.doneHold);
        break;
      case 'results':
        this.resultsAt = this.clock;
        this.registry.set(SEASON.score, this.registry.get(SEASON.score) + r.score);
        this.registry.set(SEASON.charges, r.charges);
        this.banner = null;
        break;
      case 'wall': if (e.car === you) this.cue('bump', { volume: Math.min(1, e.speed / 150) }); break;
      case 'bump': if (e.a === you || e.b === you) this.cue('clunk'); break;
      case 'fire': this.cue('dart'); break;
      case 'drop': this.cue('mine'); break;
      case 'empty': this.cue('empty'); break;
      case 'spin': this.cue(e.car === you ? 'spin' : 'hit', { volume: e.car === you || e.by === you ? 1 : 0.4 }); break;
      case 'pickup': this.cue('pickup'); break;
      case 'coolant': if (e.car === you) this.cue('coolant'); break;
    }
  }

  private publishHud(device: Device) {
    const r = this.race, c = r.player;
    if (this.banner && this.clock > this.banner.until) this.banner = null;
    const score = this.registry.get(SEASON.score) + (r.phase === 'results' ? 0 : r.score);
    const hud: HudState = {
      track: this.def.name,
      league: LEAGUES[r.league].name,
      place: r.placeOf(c),
      of: r.cars.length,
      lap: Phaser.Math.Clamp(c.laps + 1, 1, this.def.laps),
      laps: this.def.laps,
      raceTime: c.finishT ?? r.raceT,
      charges: r.charges,
      score,
      device,
      hint: r.phase === 'grid' || r.raceT < 5,
      lights: r.phase === 'grid' ? lightsLit(r.phaseT) : null,
      banner: this.banner && { text: this.banner.text, color: this.banner.color },
      results: r.results && {
        rows: r.results.map((car, i) => ({
          place: i + 1, name: car.name, color: car.color, you: car === c,
          time: car.finishT !== null ? fmtTime(car.finishT) : '--',
        })),
        points: r.score,
        total: score,
        ready: this.clock - this.resultsAt > RACE.resultsLock,
      },
    };
    this.registry.set(HUD_STATE, hud);
  }

  private showBanner(text: string, color: string, secs: number) {
    this.banner = { text, color, until: this.clock + secs };
  }

  private cue(name: SoundName, config?: Phaser.Types.Sound.SoundConfig) {
    playSound(this, name, config);
    if (import.meta.env.DEV) this.played = [...this.played.slice(-39), name];
  }

  /** The next race: the same track again for now, keeping score and charges. */
  next() {
    if (this.race.phase !== 'results') return;
    this.leave('race');
  }

  leave(to: 'title' | 'race' = 'title') {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (to === 'title') {
        this.scene.stop('hud');
        this.scene.start('title');
      } else {
        this.scene.restart({ track: this.trackIndex, mk: this.mk });
      }
    });
  }

  // ---- Dev hooks (tests and the console) ----

  /** A plain snapshot of the player's car and the race. */
  snapshot() {
    const r = this.race, c = r.player;
    return {
      x: c.x, y: c.y, a: c.a, vx: c.vx, vy: c.vy, speed: speedOf(c), seg: c.seg, lat: c.lat, laps: c.laps, spin: c.spin, wet: c.wet,
      finished: c.finished, n: r.track.n, lapTimes: [...r.lapTimes], phase: r.phase, raceT: r.raceT, charges: r.charges, score: r.score,
      top: r.machine.top, machine: r.machine.name, place: r.placeOf(c),
      cars: r.cars.map((o) => ({ kind: o.kind, seg: o.seg, laps: o.laps, lat: o.lat, spin: o.spin, finished: o.finished, x: o.x, y: o.y })),
      darts: r.darts.length, mines: r.mines.map((m) => ({ arm: m.arm, x: m.x, y: m.y })),
    };
  }

  /** Moves the player to `frac` of the way round, `lat` px right of the centreline, stopped, facing along the track + `turn`. */
  teleport(frac: number, lat = 0, turn = 0) {
    this.race.place(this.race.player, frac, lat, turn);
    this.view.snapCamera();
  }
}
