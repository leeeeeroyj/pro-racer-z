import Phaser from 'phaser';
import { CAMERA, FONT, FX, HAZARD, HEIGHT, TRACK, WIDTH, spriteAngle } from './config';
import { reducedMotion } from './motion';
import { HAZARD_FRAMES, bakeProps } from './bake';
import { gateLeft, gateState, type Race, type RaceEvent, type Racer } from './race';
import type { TrackView } from './trackView';

const DEPTH = { hazard: 2, pickup: 3, mine: 3, shadow: 4, car: 5, dart: 6, drone: 6.5, fx: 7, cloud: 8, popup: 9 } as const;
/** Seconds a car shows white after it's hit. */
const FLASH = 0.15;
const blink = (t: number, hz: number) => Math.floor(t * hz) % 2 === 0;
/** Warning lines: light, so they read by brightness, not by being red. */
const WARN = 0xffb0bc;
const SPARK = 0xffd27a;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: number }

/**
 * Draws a race on its track: hazards, pickups, mines, cars and their shadows, darts, gates, drones, storm clouds and
 * score popups. Owns the camera follow. Every warning reads by shape or brightness as well as colour.
 */
export class RaceView {
  private readonly cars = new Map<Racer, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; flash: number; trail: number[]; color: number }>();
  private sparks: Spark[] = [];
  private popups: Phaser.GameObjects.Text[] = [];
  private rings: Ring[] = [];
  /** Dev: effects started so far, for tests. */
  readonly fxCount = { sparks: 0, rings: 0, shakes: 0 };
  private readonly things = new Map<object, Phaser.GameObjects.Image>();
  private readonly darts: Phaser.GameObjects.Image[] = [];
  private readonly mines: Phaser.GameObjects.Image[] = [];
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly over: Phaser.GameObjects.Graphics;
  private clock = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly race: Race, readonly view: TrackView) {
    bakeProps(scene);
    this.under = scene.add.graphics().setDepth(DEPTH.hazard + 0.5);
    this.over = scene.add.graphics().setDepth(DEPTH.fx);
    for (const c of race.cars) {
      this.cars.set(c, {
        shadow: scene.add.image(0, 0, c.slot).setTint(0x000000).setAlpha(0.45).setDepth(DEPTH.shadow),
        img: scene.add.image(0, 0, c.slot).setDepth(DEPTH.car + (c === race.player ? 0.5 : 0)),
        flash: 0,
        trail: [],
        color: c === race.player ? 0xff3ea5 : parseInt(c.color.slice(1), 16),
      });
    }
    this.snapCamera();
    this.sync(0, []);
  }

  /** Puts the camera straight on the player, no easing. */
  snapCamera() {
    const p = this.race.player;
    this.view.look(p.x - WIDTH / 2, p.y - HEIGHT / 2 + CAMERA.down);
  }

  /** The camera leads the player by its velocity, so you see further the way you're going. */
  follow(dt: number) {
    const c = this.race.player, v = this.view;
    const lx = Phaser.Math.Clamp(c.vx * CAMERA.lead, -CAMERA.maxX, CAMERA.maxX);
    const ly = Phaser.Math.Clamp(c.vy * CAMERA.lead, -CAMERA.maxY, CAMERA.maxY);
    const k = Math.min(1, CAMERA.ease * dt);
    v.look(v.camX + (c.x + lx - WIDTH / 2 - v.camX) * k, v.camY + (c.y + ly - HEIGHT / 2 + CAMERA.down - v.camY) * k);
  }

  sync(dt: number, events: RaceEvent[]) {
    this.clock += dt;
    const r = this.race, t = this.clock;
    for (const e of events) {
      this.effect(e);
      if (e.type === 'spin') this.cars.get(e.car)!.flash = FLASH;
      if (e.type === 'score') this.popup(e.x, e.y - 10, e.label);
      if (e.type === 'glitch') this.popup(r.player.x, r.player.y - 12, e.lost ? `-${e.lost} CHARGE` : 'GLITCH');
      if (e.type === 'shield' && e.car === r.player) this.popup(r.player.x, r.player.y - 12, 'SHIELD UP');
    }
    const seen = new Set<object>();
    const thing = (o: object, key: string, depth: number) => {
      seen.add(o);
      let img = this.things.get(o);
      if (!img) { img = this.scene.add.image(0, 0, key).setDepth(depth); this.things.set(o, img); }
      return img.setTexture(key);
    };

    r.hazards.forEach((hz, i) => {
      if (hz.kind === 'coolant' || hz.kind === 'slick') {
        // Animated pools, upright (turning pixel art makes it jagged); each starts at its own point in the loop.
        const a = HAZARD_FRAMES[hz.kind];
        thing(hz, `hz-${hz.kind}-${Math.floor(t * a.fps + i * 5) % a.n}`, DEPTH.hazard).setPosition(hz.x, hz.y);
        return;
      }
      const img = thing(hz, hz.kind === 'glitch' ? 'glitch' : `hz-${hz.kind}`, DEPTH.hazard).setPosition(hz.x, hz.y);
      if (hz.kind === 'glitch') {
        // A skull that jitters while it's hungry and fades while it rests.
        img.setAlpha(hz.rest > 0 ? 0.35 : 1).setPosition(hz.x + (blink(t, 7) && hz.rest <= 0 ? 0.5 : 0), hz.y);
      } else {
        img.setRotation(hz.h).setAlpha(0.6 + 0.4 * Math.abs(Math.sin(t * 5)));
      }
    });
    r.pickups.forEach((pk, i) => {
      const img = thing(pk, pk.kind === 'letter' ? `letter-${pk.idx}` : pk.kind, DEPTH.pickup);
      img.setVisible(!pk.gone && pk.t <= 0).setPosition(pk.x, pk.y + Math.round(Math.sin(t * 4 + i) * 1.5));
    });
    for (const dr of r.drones) thing(dr, 'drone', DEPTH.drone).setPosition(dr.x, dr.y);
    for (const cl of r.clouds) {
      // The cloud floats high, so it sits up and to the left of the rain it drops.
      thing(cl, 'storm', DEPTH.cloud).setPosition(cl.x - 10, cl.y - 18).setScale(3).setAlpha(0.88);
    }
    for (const [o, img] of this.things) if (!seen.has(o)) { img.destroy(); this.things.delete(o); }

    for (const [c, v] of this.cars) {
      const on = r.cars.includes(c);
      v.img.setVisible(on);
      v.shadow.setVisible(on);
      if (v.img.texture.key !== c.slot) { v.img.setTexture(c.slot); v.shadow.setTexture(c.slot); }
      const angle = spriteAngle(c.slot, c.a);
      v.flash = Math.max(0, v.flash - dt);
      v.img.setPosition(c.x, c.y).setRotation(angle).setTint(0xffffff).setTintMode(v.flash > 0 ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
      v.shadow.setPosition(c.x + 1.5, c.y + 2.5).setRotation(angle);
      // A hover trail when it's flying: the last few positions, fading.
      if (on && Math.hypot(c.vx, c.vy) > r.statsOf(c).top * FX.trail) v.trail.push(c.x - Math.cos(c.a) * 6, c.y - Math.sin(c.a) * 6);
      else v.trail.splice(0, 2);
      if (v.trail.length > FX.trailLen * 2) v.trail.splice(0, v.trail.length - FX.trailLen * 2);
    }
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 4 * dt; s.vy *= 1 - 4 * dt; }
    this.rings = this.rings.filter((g) => (g.life -= dt) > 0);
    this.pool(this.darts, r.darts.length, 'dart', DEPTH.dart).forEach((img, i) => {
      const d = r.darts[i];
      img.setPosition(d.x, d.y).setRotation(spriteAngle('dart', d.a));
    });
    // An unarmed mine is see-through; an armed one is solid and pulses.
    this.pool(this.mines, r.mines.length, 'mine', DEPTH.mine).forEach((img, i) => {
      const m = r.mines[i];
      img.setPosition(m.x, m.y).setAlpha(m.arm > 0 ? 0.45 : 1).setScale(m.arm > 0 ? 0.8 : 1 + 0.12 * Math.max(0, Math.sin(t * 10)));
    });
    this.drawFx();
  }

  /** Vector effects: cloud shadows and rain, gate posts and beams, drone scan lines, the shield bubble, boost streaks. */
  private drawFx() {
    const r = this.race, t = this.clock, u = this.under.clear(), o = this.over.clear();
    const HW = TRACK.halfWidth + TRACK.apron;
    for (const cl of r.clouds) {
      u.fillStyle(0x000010, 0.38).fillCircle(cl.x, cl.y, HAZARD.cloud.r);
      o.lineStyle(1, 0xb8d8ff, 0.5);
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4, rr = ((k * 13) % HAZARD.cloud.r) * 0.95, y = ((t * 90 + k * 17) % 30) - 15;
        const x0 = cl.x + Math.cos(a) * rr, y0 = cl.y + Math.sin(a) * rr * 0.7 + y;
        o.lineBetween(x0, y0, x0 - 1, y0 + 4);
      }
      if (cl.flick > 0) o.fillStyle(0xffffff, 0.25).fillCircle(cl.x, cl.y, HAZARD.cloud.r);
    }
    for (const g of r.gates) {
      const p = r.track.pts[g.seg], st = gateState(g);
      const ax = g.x + p.nx * HW, ay = g.y + p.ny * HW, bx = g.x - p.nx * HW, by = g.y - p.ny * HW;
      // Posts: always there, so you know where a gate is.
      o.fillStyle(0x2a2d4c).fillRect(ax - 2, ay - 2, 4, 4).fillRect(bx - 2, by - 2, 4, 4);
      if (st === 'warn') {
        // Warning: the posts blink white and a thin dashed line shows where the beam will be, blinking faster near the end.
        const on = blink(t, gateLeft(g) < 0.4 ? 12 : 6);
        o.fillStyle(on ? 0xffffff : 0xff5470).fillRect(ax - 2, ay - 2, 4, 4).fillRect(bx - 2, by - 2, 4, 4);
        if (on) this.dashed(o, ax, ay, bx, by, 1, WARN, 0.9);
      } else if (st === 'on') {
        o.lineStyle(4, 0xff5470, 0.55).lineBetween(ax, ay, bx, by);
        o.lineStyle(2, 0xffe0e6, 1).lineBetween(ax, ay, bx, by);
        o.fillStyle(0xffffff).fillRect(ax - 2, ay - 2, 4, 4).fillRect(bx - 2, by - 2, 4, 4);
      }
    }
    for (const dr of r.drones) {
      // The scan line spans the track at the drone's post and blinks, so its sweep is visible before it reaches you.
      const p = r.track.pts[dr.seg];
      if (blink(t, 4)) this.dashed(u, p.x + p.nx * TRACK.halfWidth, p.y + p.ny * TRACK.halfWidth, p.x - p.nx * TRACK.halfWidth, p.y - p.ny * TRACK.halfWidth, 1, WARN, 0.7);
    }
    for (const v of this.cars.values()) {
      const tr = v.trail, k = tr.length / 2;
      for (let i = 1; i < k; i++) u.lineStyle(2, v.color, (0.4 * i) / k).lineBetween(tr[i * 2 - 2], tr[i * 2 - 1], tr[i * 2], tr[i * 2 + 1]);
    }
    for (const s of this.sparks) o.fillStyle(s.color, Math.min(1, (s.life / s.max) * 1.5)).fillRect(s.x - 0.5, s.y - 0.5, 1, 1);
    for (const g of this.rings) {
      const f = 1 - g.life / g.max;
      o.lineStyle(1, g.color, 1 - f).strokeCircle(g.x, g.y, g.r0 + (g.r1 - g.r0) * f);
    }
    const you = r.player;
    if (you.shield) o.lineStyle(1, 0x36e2ff, 0.6 + 0.4 * Math.sin(t * 6)).strokeCircle(you.x, you.y, 10);
    for (const c of r.cars) {
      if (c.boost <= 0) continue;
      const bx = Math.cos(c.a), by = Math.sin(c.a);
      o.lineStyle(1, 0xa8ff4f, 0.8);
      for (const s of [-3, 3]) o.lineBetween(c.x - bx * 8 - by * s, c.y - by * 8 + bx * s, c.x - bx * 14 - by * s, c.y - by * 14 + bx * s);
    }
  }

  /** Sparks, rings and shake for what just happened. */
  private effect(e: RaceEvent) {
    const you = this.race.player;
    switch (e.type) {
      case 'wall':
        if (e.speed > 30) this.burst(e.x, e.y, Math.min(10, Math.round(e.speed / 15)), SPARK, e.speed * 0.6);
        if (e.car === you && e.speed > FX.wallShake) this.shake(FX.shake.wall);
        break;
      case 'bump': this.burst(e.x, e.y, 4, 0xffffff, 50); break;
      case 'spin':
        this.ring(e.x, e.y, 4, 18, 0.35, 0xffffff);
        this.burst(e.x, e.y, 8, SPARK, 80);
        if (e.car === you) this.shake(FX.shake.spin);
        break;
      case 'shield': this.ring(e.car.x, e.car.y, 8, 20, 0.3, 0x36e2ff); break;
      case 'pickup': this.ring(e.x, e.y, 3, 14, 0.3, e.kind === 'letter' ? 0xff3ea5 : 0xe9efff); break;
      case 'boost': this.ring(e.car.x, e.car.y, 4, 16, 0.25, 0xa8ff4f); break;
      case 'overdrive':
        this.ring(you.x, you.y, 4, 48, 0.7, 0xff3ea5);
        this.ring(you.x, you.y, 2, 30, 0.5, 0xffffff);
        this.burst(you.x, you.y, 16, 0xff3ea5, 120);
        this.shake(FX.shake.overdrive);
        break;
      case 'glitch': this.burst(you.x, you.y, 10, 0xa979ff, 70); break;
      case 'armed': if (this.race.mines.includes(e.mine)) this.ring(e.mine.x, e.mine.y, 2, 8, 0.25, 0xe9efff); break;
    }
  }

  private burst(x: number, y: number, n: number, color: number, speed: number) {
    if (reducedMotion()) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6), max = 0.25 + Math.random() * 0.2;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color });
    }
    this.fxCount.sparks += n;
  }

  private ring(x: number, y: number, r0: number, r1: number, secs: number, color: number) {
    this.rings.push({ x, y, r0, r1, life: secs, max: secs, color });
    this.fxCount.rings++;
  }

  private shake([secs, amount]: readonly [number, number]) {
    if (reducedMotion()) return;
    this.scene.cameras.main.shake(secs * 1000, amount);
    this.fxCount.shakes++;
  }

  private dashed(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, w: number, color: number, alpha: number) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 4);
    g.lineStyle(w, color, alpha);
    for (let k = 0; k < n; k += 2) {
      const f0 = k / n, f1 = Math.min(1, (k + 1) / n);
      g.lineBetween(ax + (bx - ax) * f0, ay + (by - ay) * f0, ax + (bx - ax) * f1, ay + (by - ay) * f1);
    }
  }

  private pool(imgs: Phaser.GameObjects.Image[], count: number, key: string, depth: number) {
    while (imgs.length < count) imgs.push(this.scene.add.image(0, 0, key).setDepth(depth));
    imgs.forEach((img, i) => img.setVisible(i < count));
    return imgs.slice(0, count);
  }

  /** Score text that floats up and fades; one that starts near another stacks above it. */
  private popup(x: number, y: number, text: string) {
    this.popups = this.popups.filter((p) => p.active);
    while (this.popups.some((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 8)) y -= 9;
    const t = this.scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '8px', color: '#e9efff', stroke: '#04050b', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(DEPTH.popup);
    this.popups.push(t);
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, delay: 500, duration: 600, onComplete: () => t.destroy() });
  }
}
