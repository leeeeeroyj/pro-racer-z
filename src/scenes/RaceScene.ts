import Phaser from 'phaser';
import { CAMERA, CAR, HEIGHT, HUD_STATE, MACHINES, RACE, TEXT, WIDTH, spriteAngle, type Machine } from '../config';
import { Controls, type Device } from '../controls';
import { TRACKS, type TrackDef } from '../data/tracks';
import { IDLE, carAt, drive, speedOf, type Car, type Control } from '../race';
import { playSound, registerSounds, restoreMute, toggleMute, type SoundName } from '../sfx';
import { at } from '../track';
import { TrackView } from '../trackView';

export interface HudState {
  track: string;
  place: number;
  of: number;
  /** 1-based lap shown on the HUD, clamped to the race's laps. */
  lap: number;
  laps: number;
  raceTime: number;
  device: Device;
  /** Controls hint at the start of a race. */
  hint: boolean;
  banner: { text: string; color: string } | null;
}

/** Grid slot: samples behind the start line and lateral offset. M1 has only the player, on pole. */
const POLE = { back: 8, lat: -10 };

export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export class RaceScene extends Phaser.Scene {
  private def!: TrackDef;
  private view!: TrackView;
  private car!: Car;
  private machine!: Machine;
  private sprite!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private controls!: Controls;
  private raceT = 0;
  private lapStart = 0;
  private lapTimes: number[] = [];
  private finishedAt: number | null = null;
  private banner: { text: string; color: string; until: number } | null = null;
  private leaving = false;
  /** Dev only: the last sounds played, for tests. */
  played: SoundName[] = [];

  constructor() {
    super('race');
  }

  create(data: { track?: number; mk?: number }) {
    this.def = TRACKS[data.track ?? 0];
    this.machine = MACHINES[data.mk ?? 0];
    this.controls = new Controls(this);
    registerSounds(this);
    restoreMute(this);
    this.view = new TrackView(this, this.def);
    const t = this.view.track;
    this.car = carAt(t, -POLE.back / t.n, POLE.lat, -1);
    this.shadow = this.add.image(0, 0, this.machine.slot).setTint(0x000000).setAlpha(0.45).setDepth(4);
    this.sprite = this.add.image(0, 0, this.machine.slot).setDepth(5);
    this.raceT = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.finishedAt = null;
    this.banner = null;
    this.leaving = false;
    this.played = [];
    this.view.look(this.car.x - WIDTH / 2, this.car.y - HEIGHT / 2 + CAMERA.down);
    this.place();
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.cameras.main.fadeIn(250);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.registry.remove(HUD_STATE));
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.back) return this.leave();

    const c = this.car;
    this.raceT += dt;
    const ctl: Control = c.finished ? { ...IDLE, hold: true } : input.drive;
    const r = drive(this.view.track, c, ctl, this.machine, dt);
    if (r.wall > CAR.scrape) this.cue('bump', { volume: Math.min(1, r.wall / 150) });
    if (r.crossed > 0) this.crossLine();
    if (this.finishedAt !== null && this.raceT - this.finishedAt > RACE.finishHold) this.leave();

    // The camera leads the car by its velocity, so you see further the way you're going.
    const v = this.view;
    const lx = Phaser.Math.Clamp(c.vx * CAMERA.lead, -CAMERA.maxX, CAMERA.maxX);
    const ly = Phaser.Math.Clamp(c.vy * CAMERA.lead, -CAMERA.maxY, CAMERA.maxY);
    const k = Math.min(1, CAMERA.ease * dt);
    v.look(v.camX + (c.x + lx - WIDTH / 2 - v.camX) * k, v.camY + (c.y + ly - HEIGHT / 2 + CAMERA.down - v.camY) * k);
    this.place();

    if (this.banner && this.raceT > this.banner.until) this.banner = null;
    const hud: HudState = {
      track: this.def.name,
      place: 1,
      of: 1,
      lap: Phaser.Math.Clamp(c.laps + 1, 1, this.def.laps),
      laps: this.def.laps,
      raceTime: this.finishedAt ?? this.raceT,
      device: input.device,
      hint: this.raceT < 6,
      banner: this.banner && { text: this.banner.text, color: this.banner.color },
    };
    this.registry.set(HUD_STATE, hud);
  }

  private place() {
    const c = this.car, angle = spriteAngle(this.machine.slot, c.a);
    this.sprite.setPosition(c.x, c.y).setRotation(angle);
    this.shadow.setPosition(c.x + 1.5, c.y + 2.5).setRotation(angle);
  }

  private crossLine() {
    const c = this.car;
    if (c.laps < 1 || c.finished) {
      this.lapStart = this.raceT;
      return;
    }
    this.lapTimes.push(this.raceT - this.lapStart);
    this.lapStart = this.raceT;
    if (c.laps >= this.def.laps) {
      c.finished = true;
      this.finishedAt = this.raceT;
      this.showBanner(`FINISH  ${fmtTime(this.raceT)}`, TEXT.amber, RACE.finishHold + 1);
      this.cue('finish');
    } else if (c.laps === this.def.laps - 1) {
      this.showBanner('FINAL LAP', TEXT.amber, 1.6);
      this.cue('finalLap');
    } else {
      this.showBanner(`LAP ${fmtTime(this.lapTimes[this.lapTimes.length - 1])}`, TEXT.ink, 1.6);
      this.cue('lap');
    }
  }

  private showBanner(text: string, color: string, secs: number) {
    this.banner = { text, color, until: this.raceT + secs };
  }

  private cue(name: SoundName, config?: Phaser.Types.Sound.SoundConfig) {
    playSound(this, name, config);
    if (import.meta.env.DEV) this.played = [...this.played.slice(-39), name];
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('hud');
      this.scene.start('title');
    });
  }

  // ---- Dev hooks (tests and the console) ----

  /** A plain snapshot of the race. */
  snapshot() {
    const c = this.car;
    return {
      x: c.x, y: c.y, a: c.a, vx: c.vx, vy: c.vy, speed: speedOf(c), seg: c.seg, lat: c.lat, laps: c.laps,
      finished: c.finished, n: this.view.track.n, raceT: this.raceT, lapTimes: [...this.lapTimes],
      camX: this.view.camX, camY: this.view.camY, machine: this.machine.name, top: this.machine.top,
    };
  }

  /** Moves the car to `frac` of the way round, `lat` px right of the centreline, stopped, facing along the track plus `turn` radians. */
  teleport(frac: number, lat = 0, turn = 0) {
    const t = this.view.track, p = at(t, frac, lat), c = this.car;
    Object.assign(c, { x: p.x, y: p.y, seg: p.seg, lat, a: p.h + turn, vx: 0, vy: 0 });
    this.view.look(c.x - WIDTH / 2, c.y - HEIGHT / 2 + CAMERA.down);
    this.place();
  }
}
