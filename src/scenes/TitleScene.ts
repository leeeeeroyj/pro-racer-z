import Phaser from 'phaser';
import { FONT, HEIGHT, MACHINES, SPRITES, TEXT, WIDTH, spriteAngle, type SpriteKey } from '../config';
import { Controls } from '../controls';
import { TRACKS } from '../data/tracks';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { TrackView } from '../trackView';

/** The title camera glides round the track at this speed, px/s. */
const GLIDE = 70;

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private view!: TrackView;
  private padStatus: Phaser.GameObjects.Text | undefined;
  private start!: Phaser.GameObjects.Text;
  private leaving = false;
  private clock = 0;

  constructor() {
    super('title');
  }

  preload() {
    for (const key of SPRITES) this.load.image(key, `sprites/${key}.png`);
  }

  create() {
    this.leaving = false;
    this.padStatus = undefined;
    this.clock = 0;
    this.controls = new Controls(this);
    registerSounds(this);
    restoreMute(this);
    this.view = new TrackView(this, TRACKS[0]);
    this.glide();
    this.cameras.main.fadeIn(250);

    // Everything below is fixed to the screen, over a dark veil.
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) => o.setScrollFactor(0).setDepth(21);
    // With scroll factor 0, screen (0, 0) sits at the camera's unzoomed origin; this offset maps it to the view's corner.
    const cam = this.cameras.main, ox = (cam.width - WIDTH) / 2, oy = (cam.height - HEIGHT) / 2;
    fixed(this.add.rectangle(ox, oy, WIDTH, HEIGHT, 0x04050b, 0.72).setOrigin(0)).setDepth(20);
    const text = (x: number, y: number, str: string, size: number, color: string) =>
      fixed(this.add.text(ox + x, oy + y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5, 0));
    const sprite = (key: SpriteKey, x: number, y: number) => fixed(this.add.image(ox + x, oy + y, key).setRotation(spriteAngle(key, -Math.PI / 2)));

    const cx = WIDTH / 2;
    text(cx, 14, 'ROOFTOP HOVER RACING  ·  NEON CITY', 8, TEXT.dim);
    text(cx, 26, 'PRO RACER Z', 24, TEXT.kerb);
    text(cx, 56, 'BEAT THREE RIVAL PILOTS ROUND THE RAISED CIRCUITS.', 8, TEXT.ink);
    MACHINES.forEach((m, i) => sprite(m.slot, cx - 36 + i * 36, 82));

    this.start = text(cx, 100, '> START <', 16, TEXT.kerb);
    this.start.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-24, -8, this.start.width + 48, this.start.height + 16), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.start.on('pointerdown', () => this.begin());
    text(cx, 122, 'PRESS ENTER OR A, OR CLICK START', 8, TEXT.dim);

    const column = (x: number, title: string, keys: string, actions: string) => {
      text(x, 142, title, 8, TEXT.kerb);
      fixed(this.add.text(ox + x - 4, oy + 154, keys, { fontFamily: FONT, fontSize: '8px', color: TEXT.ink, align: 'right', lineSpacing: 2 }).setOrigin(1, 0));
      fixed(this.add.text(ox + x + 4, oy + 154, actions, { fontFamily: FONT, fontSize: '8px', color: TEXT.dim, lineSpacing: 2 }));
    };
    column(112, 'KEYBOARD', 'LEFT / RIGHT\nUP\nDOWN\nM\nESC', 'TURN\nGO\nBRAKE, REVERSE\nSOUND ON/OFF\nBACK TO TITLE');
    column(308, 'CONTROLLER', 'D-PAD\nLEFT STICK\nA / RT\nB / LT\nBACK', 'TURN\nPOINT THE WAY\nGO\nBRAKE, REVERSE\nBACK TO TITLE');
    this.padStatus = text(cx, 214, '', 8, TEXT.dim);
  }

  /** Puts the camera on the point the title glide has reached, a little ahead of the centreline. */
  private glide() {
    const t = this.view.track, i = Math.floor((this.clock * GLIDE) / 6) % t.n, p = t.pts[i];
    this.view.look(p.x - WIDTH / 2, p.y - HEIGHT / 2);
  }

  update(_time: number, delta: number) {
    this.clock += Math.min(0.05, delta / 1000);
    this.glide();
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.confirm) this.begin();
    this.start.setAlpha(Math.sin(this.clock * 4) > -0.5 ? 1 : 0.5);
    const pad = this.controls.pad();
    this.padStatus?.setText(pad ? 'CONTROLLER CONNECTED' : 'USING A CONTROLLER? PRESS ANY BUTTON ON IT').setColor(pad ? TEXT.cyan : TEXT.dim);
  }

  private begin() {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, 'start');
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('race', { track: 0, mk: 0 }));
  }
}
