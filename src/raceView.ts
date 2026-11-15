import Phaser from 'phaser';
import { CAMERA, FONT, HEIGHT, WIDTH, spriteAngle } from './config';
import { bakeProps } from './bake';
import type { Race, RaceEvent, Racer } from './race';
import type { TrackView } from './trackView';

const DEPTH = { hazard: 2, pickup: 3, mine: 3, shadow: 4, car: 5, dart: 6, popup: 8 } as const;
/** Seconds a car shows white after it's hit. */
const FLASH = 0.15;

/** Draws a race on its track: hazards, pickups, mines, cars and their shadows, darts and score popups. Owns the camera follow. */
export class RaceView {
  private readonly cars = new Map<Racer, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; flash: number }>();
  private readonly pickups: Phaser.GameObjects.Image[];
  private readonly darts: Phaser.GameObjects.Image[] = [];
  private readonly mines: Phaser.GameObjects.Image[] = [];
  private clock = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly race: Race, readonly view: TrackView) {
    bakeProps(scene);
    for (const hz of race.hazards) scene.add.image(hz.x, hz.y, `hz-${hz.kind}`).setRotation(hz.h + (hz.kind === 'slick' ? 0.6 : 0)).setDepth(DEPTH.hazard);
    this.pickups = race.pickups.map((pk) => scene.add.image(pk.x, pk.y, pk.kind).setDepth(DEPTH.pickup));
    for (const c of race.cars) {
      this.cars.set(c, {
        shadow: scene.add.image(0, 0, c.slot).setTint(0x000000).setAlpha(0.45).setDepth(DEPTH.shadow),
        img: scene.add.image(0, 0, c.slot).setDepth(DEPTH.car + (c === race.player ? 0.5 : 0)),
        flash: 0,
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
    for (const e of events) {
      if (e.type === 'spin') this.cars.get(e.car)!.flash = FLASH;
      if (e.type === 'score') this.popup(e.x, e.y - 10, e.label);
    }
    for (const [c, v] of this.cars) {
      const on = this.race.cars.includes(c);
      v.img.setVisible(on);
      v.shadow.setVisible(on);
      const angle = spriteAngle(c.slot, c.a);
      v.flash = Math.max(0, v.flash - dt);
      v.img.setPosition(c.x, c.y).setRotation(angle).setTint(0xffffff).setTintMode(v.flash > 0 ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
      v.shadow.setPosition(c.x + 1.5, c.y + 2.5).setRotation(angle);
    }
    this.race.pickups.forEach((pk, i) => {
      this.pickups[i].setVisible(pk.t <= 0).setY(pk.y + Math.round(Math.sin(this.clock * 4 + i) * 1.5));
    });
    this.pool(this.darts, this.race.darts.length, 'dart', DEPTH.dart).forEach((img, i) => {
      const d = this.race.darts[i];
      img.setPosition(d.x, d.y).setRotation(spriteAngle('dart', d.a));
    });
    // An unarmed mine is see-through; an armed one is solid and pulses. Readable without colour.
    this.pool(this.mines, this.race.mines.length, 'mine', DEPTH.mine).forEach((img, i) => {
      const m = this.race.mines[i];
      img.setPosition(m.x, m.y).setAlpha(m.arm > 0 ? 0.45 : 1).setScale(m.arm > 0 ? 0.8 : 1 + 0.12 * Math.max(0, Math.sin(this.clock * 10)));
    });
  }

  private pool(imgs: Phaser.GameObjects.Image[], count: number, key: string, depth: number) {
    while (imgs.length < count) imgs.push(this.scene.add.image(0, 0, key).setDepth(depth));
    imgs.forEach((img, i) => img.setVisible(i < count));
    return imgs.slice(0, count);
  }

  private popup(x: number, y: number, text: string) {
    const t = this.scene.add.text(x, y, text, { fontFamily: FONT, fontSize: '8px', color: '#e9efff', stroke: '#04050b', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(DEPTH.popup);
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, delay: 500, duration: 600, onComplete: () => t.destroy() });
  }
}
