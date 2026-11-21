import Phaser from 'phaser';
import { ATTRACT, DEMO_SECS } from '../attract';
import { FX, HEAT, HUD_STATE, LEAGUES, MACHINES, RACE, SCORE, TEXT, UPGRADE, WORD, type Upgrade } from '../config';
import { reducedMotion } from '../motion';
import { LEAGUE_SONGS, pauseMusic, playMusic, prepareMusic, stopMusic } from '../music';
import { FrameClock } from '../clock';
import { Controls, type ControlState, type Device } from '../controls';
import { TRACKS, type TrackDef } from '../data/tracks';
import { NO_INPUT, Race, gateState, lightsLit, speedOf, type RaceEvent } from '../race';
import { RaceView } from '../raceView';
import { RACES, afterRace, leagueOf, newCareer, rampOf, trackOf, type Career, type Verdict } from '../season';
import { loadLap, saveLap } from '../store';
import { playSound, registerSounds, restoreMute, toggleMute, type SoundName } from '../sfx';
import { TrackView } from '../trackView';
import { touchControls } from '../touch';

/** Registry key for what carries between races (`season.ts`). */
export const CAREER = 'career';

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
  /** 1-based race number in the season, and how many there are. */
  race: number;
  races: number;
  place: number;
  of: number;
  /** 1-based lap shown on the HUD, clamped to the race's laps. */
  lap: number;
  laps: number;
  raceTime: number;
  charges: number;
  score: number;
  /** Letters of OVERDRIVE collected so far. */
  letters: boolean[];
  shield: boolean;
  machine: string;
  device: Device;
  /** Controls hint on the grid and early in the race. */
  hint: boolean;
  /** Grid lights lit, 0–3, or null once the race is on. */
  lights: number | null;
  banner: { text: string; color: string; sub: string } | null;
  /** Your speed and top speed, px/s, and whether you're on a boost. */
  speed: number;
  top: number;
  boosting: boolean;
  up: Record<Upgrade, number>;
  /** Dynamo's heat. */
  heat: number;
  /** The track's centreline for the minimap (flat x, y pairs, world px), the same object all race. */
  map: { id: string; pts: number[] };
  /** Cars on the minimap: rivals by initial, you by an arrow. */
  dots: Array<{ x: number; y: number; a: number; initial: string; color: string; you: boolean }>;
  gates: Array<{ x: number; y: number; nx: number; ny: number; state: 'off' | 'warn' | 'on' }>;
  /** White screen flash, 0–1. */
  flash: number;
  paused: boolean;
  /** Attract mode: no hints, pause or sound buttons. */
  attract: boolean;
  results: { rows: ResultRow[]; points: number; total: number; ready: boolean; verdict: Verdict; retries: number } | null;
}

/** Attract mode's stand-in for the controls: nothing pressed. */
const DEMO_INPUT: ControlState = { ...NO_INPUT, confirm: false, back: false, mute: false, pause: false, device: 'kbm' };

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
  private league = 0;
  private career!: Career;
  /** What the results decided: set when the board comes up. */
  private verdict: Verdict = 'next';
  private banner: { text: string; color: string; sub: string; until: number } | null = null;
  private clock = 0;
  private resultsAt = 0;
  private map!: HudState['map'];
  /** Paused: the race doesn't step and the HUD shows RESUME and TITLE. */
  paused = false;
  private flash = 0;
  private leaving = false;
  /** Dev only: the last sounds played, for tests. */
  played: SoundName[] = [];
  /** Attract mode: this demo's seed (the next demo uses the one after). */
  private demoSeed = 0;
  /** Dev: demos started since the page loaded (attract mode). */
  static demos = 0;

  constructor() {
    super('race');
  }

  /**
   * The career's next race; `track` and `league` override it (dev and tests). `attract` (a seed) runs a demo instead:
   * the autopilot from GO on a race of the season picked by the seed, in a machine to suit the league.
   */
  create(data: { track?: number; league?: number; seed?: number; attract?: number }) {
    const demo = data.attract !== undefined;
    if (demo) {
      this.demoSeed = data.attract!;
      RaceScene.demos++;
      const n = this.demoSeed % RACES, league = leagueOf(n), lvl = Math.min(UPGRADE.max, league + Math.floor(trackOf(n) / 3));
      this.career = { ...newCareer(), race: n, mk: Math.min(league, MACHINES.length - 1), up: { thruster: lvl, core: lvl, grip: lvl } };
    } else {
      if (!this.registry.has(CAREER)) this.registry.set(CAREER, newCareer());
      this.career = this.registry.get(CAREER) as Career;
    }
    const k = this.career;
    this.trackIndex = data.track ?? trackOf(k.race);
    this.league = data.league ?? leagueOf(k.race);
    this.def = TRACKS[this.trackIndex];
    if (!demo) {
      this.controls = new Controls(this);
      registerSounds(this);
      restoreMute(this);
      // Quiet on the grid; the league's theme starts at GO, rendered now so GO doesn't stutter.
      stopMusic();
      prepareMusic(this, LEAGUE_SONGS[this.league]);
    }
    this.verdict = 'next';
    this.race = new Race(this.def, {
      seed: demo ? this.demoSeed : data.seed ?? Math.floor(Math.random() * 2 ** 31),
      mk: k.mk, charges: k.charges, letters: k.letters, up: k.up, heat: k.heat, league: this.league,
      ramp: rampOf(k.race), record: demo ? null : loadLap(this.def.id, this.league), autopilot: demo,
    });
    if (demo) this.race.go();
    const track = new TrackView(this, this.def, this.race.track, this.race.league);
    this.view = new RaceView(this, this.race, track);
    const pts = this.race.track.pts.filter((_, i) => i % 3 === 0).flatMap((p) => [p.x, p.y]);
    this.map = { id: `${this.def.id}/${this.league}`, pts };
    this.flash = 0;
    this.banner = null;
    this.clock = 0;
    this.resultsAt = 0;
    this.leaving = false;
    this.played = [];
    this.flashes = 0;
    this.frames = new FrameClock();
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.cameras.main.fadeIn(250);
    this.paused = false;
    // A phone call, a tab switch or the screen locking pauses the race.
    const hidden = () => { if (document.hidden) this.setPaused(true); };
    if (!ATTRACT) document.addEventListener('visibilitychange', hidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.remove(HUD_STATE);
      document.removeEventListener('visibilitychange', hidden);
      touchControls.show(false);
    });
  }

  update(time: number) {
    const steps = this.frames.steps(time);
    if (ATTRACT) return this.demoFrame(steps);
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (this.paused) {
      if (input.back) return this.leave('title');
      if (input.pause || input.confirm) this.setPaused(false);
      touchControls.show(false);
      this.publishHud(input.device);
      return;
    }
    const dt = steps.reduce((a, b) => a + b, 0);
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt * this.flashRate);
    if (input.back) return this.leave('title');
    const r = this.race;
    if (input.pause && r.phase !== 'results') return this.setPaused(true);
    touchControls.show(r.phase !== 'results' && !this.leaving);
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

  /** Attract mode: the autopilot races; at the results (or the time limit) the next demo starts. */
  private demoFrame(steps: number[]) {
    const dt = steps.reduce((a, b) => a + b, 0), r = this.race;
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt * this.flashRate);
    if (this.leaving) return;
    for (const s of steps) r.step(s);
    const events = r.takeEvents();
    for (const e of events) this.play(e);
    this.view.sync(dt, events);
    this.view.follow(dt);
    if (r.phase === 'results' || this.clock > DEMO_SECS) {
      this.leaving = true;
      this.scene.restart({ attract: (this.demoSeed + 1) % 2 ** 31 });
      return;
    }
    this.publishHud(DEMO_INPUT.device);
  }

  private play(e: RaceEvent) {
    const r = this.race, you = r.player;
    switch (e.type) {
      case 'light': this.cue('light'); break;
      case 'go':
        this.cue('go');
        this.showBanner('GO!', TEXT.lime, 0.8);
        if (!ATTRACT) playMusic(this, LEAGUE_SONGS[this.league]);
        break;
      case 'lap': this.cue('lap'); this.showBanner(`LAP ${fmtTime(e.time)}`, TEXT.ink, 1.6); break;
      case 'finalLap': this.cue('finalLap'); this.showBanner('FINAL LAP', TEXT.amber, 1.6); break;
      case 'finish':
        if (e.car !== you) break;
        stopMusic();
        this.cue(e.place <= 3 ? 'place' : 'lose');
        this.showBanner(e.place <= 3 ? `${ordinal(e.place)}!  +${pts(e.points)}` : `${ordinal(e.place)}  ·  NO POINTS`, e.place <= 3 ? TEXT.kerb : TEXT.hurt, RACE.doneHold);
        break;
      case 'results': {
        this.resultsAt = this.clock;
        if (ATTRACT) break;
        const place = r.results!.indexOf(you) + 1;
        const { career, verdict } = afterRace(this.career, {
          place, score: r.score, charges: r.charges, mk: r.mk, letters: r.letters, up: r.up, heat: r.heat, retriesWon: r.retriesWon,
        });
        this.verdict = verdict;
        this.registry.set(CAREER, career);
        const best = loadLap(this.def.id, this.league);
        if (r.record !== null && (best === null || r.record < best)) saveLap(this.def.id, this.league, r.record);
        this.banner = null;
        break;
      }
      case 'record': this.cue('record'); this.showBanner('LAP RECORD', TEXT.kerb, 2, `${fmtTime(e.time)}  ·  +${pts(SCORE.record)}`); break;
      case 'armed': if (r.mines.includes(e.mine)) this.cue('arm', { volume: 0.6 }); break;
      case 'wall': if (e.car === you) this.cue('bump', { volume: Math.min(1, e.speed / 150) }); break;
      case 'bump': if (e.a === you || e.b === you) this.cue('clunk'); break;
      case 'fire': this.cue('dart'); break;
      case 'drop': this.cue('mine'); break;
      case 'empty': this.cue('empty'); break;
      case 'spin':
        this.cue(e.car === you ? 'spin' : 'hit', { volume: e.car === you || e.by === you ? 1 : 0.4 });
        if (e.car === you) this.flashScreen(FX.flash.spin);
        break;
      case 'pickup': if (e.kind === 'cell' || e.kind === 'shield') this.cue('pickup'); break;
      case 'coolant': if (e.car === you) this.cue('coolant'); break;
      case 'shield': this.cue(e.car === you ? 'shieldHit' : 'hit'); break;
      case 'boost': if (e.car === you) this.cue('boost'); break;
      case 'upgrade': this.cue('upgrade', { detune: e.level * 200 }); break;
      case 'letter': this.cue('letter', { detune: e.idx * 100 }); break;
      case 'overdrive':
        this.cue('overdrive');
        this.flashScreen(FX.flash.overdrive);
        this.showBanner('OVERDRIVE!', TEXT.kerb, 2.4, e.retry ? '+1 RETRY' : MACHINES[e.mk].name);
        break;
      case 'glitch': this.cue('glitch'); break;
      case 'gateWarn': this.cue('warn'); break;
      case 'heat':
        if (e.heat >= HEAT.max) { this.cue('grudge'); this.showBanner('DYNAMO', TEXT.amber, 2, 'OVERDRIVE  ·  1.3× TOP SPEED'); }
        break;
    }
  }

  private publishHud(device: Device) {
    const r = this.race, c = r.player;
    if (this.banner && this.clock > this.banner.until) this.banner = null;
    const k = this.registry.get(CAREER) as Career;
    // Once the results are in, the career already holds this race's points (or, after a 4th, doesn't).
    const score = r.phase === 'results' ? k.score : this.career.score + r.score;
    const hud: HudState = {
      track: this.def.name,
      league: LEAGUES[r.league].name,
      race: this.career.race + 1,
      races: RACES,
      place: r.placeOf(c),
      of: r.cars.length,
      lap: Phaser.Math.Clamp(c.laps + 1, 1, r.laps),
      laps: r.laps,
      raceTime: c.finishT ?? r.raceT,
      charges: r.charges,
      score,
      letters: r.letters,
      shield: c.shield,
      machine: r.machine.name,
      device,
      hint: !ATTRACT && (r.phase === 'grid' || r.raceT < 5),
      lights: r.phase === 'grid' ? lightsLit(r.phaseT) : null,
      banner: this.banner && { text: this.banner.text, color: this.banner.color, sub: this.banner.sub },
      speed: speedOf(c),
      top: r.statsOf(c).top,
      boosting: c.boost > 0,
      up: { ...r.up },
      heat: r.heat,
      map: this.map,
      dots: r.cars.map((o) => ({ x: o.x, y: o.y, a: o.a, initial: o === c ? '' : o.name[0], color: o.color, you: o === c })),
      gates: r.gates.map((g) => ({ x: g.x, y: g.y, nx: r.track.pts[g.seg].nx, ny: r.track.pts[g.seg].ny, state: gateState(g) })),
      flash: this.flash,
      paused: this.paused,
      attract: ATTRACT,
      results: r.results && {
        rows: r.results.map((car, i) => ({
          place: i + 1, name: car.name, color: car.color, you: car === c,
          time: car.finishT !== null ? fmtTime(car.finishT) : '--',
        })),
        points: r.score,
        total: score,
        ready: this.clock - this.resultsAt > RACE.resultsLock,
        verdict: this.verdict,
        retries: k.retries,
      },
    };
    this.registry.set(HUD_STATE, hud);
  }

  /** Starts a white flash at `alpha`, unless the player asked for reduced motion. */
  private flashScreen(alpha: number) {
    if (reducedMotion()) return;
    this.flash = Math.max(this.flash, alpha);
    this.flashRate = alpha / FX.flash.secs;
    if (import.meta.env.DEV) this.flashes++;
  }

  private flashRate = 0;
  /** Dev: flashes started this race. */
  flashes = 0;

  /** A big headline (keep it short: it sits between the strip and the minimap) and an optional smaller line under it. */
  private showBanner(text: string, color: string, secs: number, sub = '') {
    this.banner = { text, color, sub, until: this.clock + secs };
  }

  private cue(name: SoundName, config?: Phaser.Types.Sound.SoundConfig) {
    if (ATTRACT) return;
    playSound(this, name, config);
    if (import.meta.env.DEV) this.played = [...this.played.slice(-39), name];
  }

  /** Pauses or resumes the race (not once the results are up). */
  setPaused(on: boolean) {
    if (ATTRACT || on === this.paused || (on && (this.race.phase === 'results' || this.leaving))) return;
    this.paused = on;
    pauseMusic(on);
    this.cue('select');
    if (on) touchControls.show(false);
  }

  /** From the results board: the pit board before the next race (or the retry), or the end of the season. */
  next() {
    if (this.race.phase !== 'results') return;
    this.leave(this.verdict === 'crown' || this.verdict === 'over' ? 'final' : 'pit');
  }

  leave(to: 'title' | 'pit' | 'final' = 'title') {
    if (this.leaving) return;
    this.leaving = true;
    if (!ATTRACT) stopMusic();
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('hud');
      this.scene.start(to, { verdict: this.verdict });
    });
  }

  // ---- Dev hooks (tests and the console) ----

  /** A plain snapshot of the player's car and the race. */
  snapshot() {
    const r = this.race, c = r.player;
    return {
      x: c.x, y: c.y, a: c.a, vx: c.vx, vy: c.vy, speed: speedOf(c), seg: c.seg, lat: c.lat, laps: c.laps, spin: c.spin, wet: c.wet,
      finished: c.finished, n: r.track.n, lapTimes: [...r.lapTimes], phase: r.phase, raceT: r.raceT, charges: r.charges, score: r.score,
      top: r.statsOf(c).top, machine: r.machine.name, mk: r.mk, slot: c.slot, place: r.placeOf(c), shield: c.shield, heat: r.heat,
      letters: r.letters.map((l) => (l ? 1 : 0)).join(''), up: { ...r.up }, word: WORD, track: this.def.id, league: r.league, raceLaps: r.laps,
      race: this.career.race, verdict: this.verdict, record: r.record, ramp: r.ramp, fx: { ...this.view.fxCount, flashes: this.flashes },
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
