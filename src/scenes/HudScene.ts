import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, HUD_H, HUD_SCALE, HUD_STATE, TEXT, WIDTH } from '../config';
import type { Device } from '../controls';
import { MUTED, toggleMute } from '../sfx';
import { fitCamera } from '../view';
import { fmtTime, type HudState } from './RaceScene';

// HUD space is the design size × HUD_SCALE (832×456): 16 px text here is 8 game pixels.
const S = HUD_SCALE;
const W = WIDTH * S, H = HEIGHT * S, BAR = HUD_H * S;
const HINTS: Record<Device, string> = {
  kbm: 'LEFT / RIGHT TURN  ·  UP GO  ·  DOWN BRAKE  ·  M SOUND  ·  ESC TITLE',
  pad: 'D-PAD TURNS  ·  STICK POINTS  ·  A GO  ·  B BRAKE  ·  BACK TITLE',
  touch: 'TOUCH CONTROLS ARRIVE IN A LATER BUILD',
};
const SPEAKER = { x: W - 28, y: 6, w: 20, h: 16 };
/** Places run 1 to 4. */
const ordinal = (n: number) => `${n}${['TH', 'ST', 'ND', 'RD'][n] ?? 'TH'}`;

/** Top bar: place, lap, race time, track name, sound. Then the hint strip and banners. */
export class HudScene extends Phaser.Scene {
  private place!: Phaser.GameObjects.Text;
  private of!: Phaser.GameObjects.Text;
  private lap!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private trackName!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hintBg!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;
  private dynamic!: Phaser.GameObjects.Graphics;

  constructor() {
    super('hud');
  }

  create() {
    fitCamera(this, HUD_SCALE);
    const label = (x: number, y: number, text: string, color: string = TEXT.dim) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: '16px', color });

    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.86).fillRect(0, 0, W, BAR);
    g.fillStyle(COLORS.line).fillRect(0, BAR, W, 2);
    this.place = label(8, 6, '', TEXT.ink);
    this.of = label(56, 6, '');
    this.lap = label(100, 6, '', TEXT.ink);
    this.clock = label(220, 6, '', TEXT.ink);
    this.trackName = label(SPEAKER.x - 16, 6, '').setOrigin(1, 0);
    this.hintBg = this.add.rectangle(W / 2, H - 46, 10, 22, COLORS.panel, 0.7);
    this.hint = label(W / 2, H - 46, '').setOrigin(0.5);
    this.banner = this.add.text(W / 2, 92, '', { fontFamily: FONT, fontSize: '32px', color: TEXT.amber, stroke: '#04050b', strokeThickness: 6 }).setOrigin(0.5);
    this.dynamic = this.add.graphics();

    // Phones have no M key: the speaker is a tap target, padded for a thumb.
    this.add.zone(W - 64, 0, 64, BAR + 16).setOrigin(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => toggleMute(this));
  }

  update() {
    const s = this.registry.get(HUD_STATE) as HudState | undefined;
    const g = this.dynamic.clear();
    if (!s) return;
    this.place.setText(ordinal(s.place)).setColor(s.place === 1 ? TEXT.kerb : TEXT.ink);
    this.of.setText(`/${s.of}`);
    this.lap.setText(`LAP ${s.lap}/${s.laps}`);
    this.clock.setText(fmtTime(s.raceTime));
    this.trackName.setText(s.track);
    this.hint.setVisible(s.hint).setText(HINTS[s.device]);
    this.hintBg.setVisible(s.hint).setSize(this.hint.width + 20, 22);
    this.hintBg.setOrigin(0.5);
    this.banner.setVisible(!!s.banner);
    if (s.banner) this.banner.setText(s.banner.text).setColor(s.banner.color);

    // Speaker: three waves when on, a cross when muted. Drawn in 2 px blocks to match the game's pixels.
    const muted = this.registry.get(MUTED) === true;
    g.fillStyle(muted ? COLORS.hurt : COLORS.ink);
    const px = (x: number, y: number, w = 1, h = 1) => g.fillRect(SPEAKER.x + x * 2, SPEAKER.y + y * 2, w * 2, h * 2);
    px(0, 2, 2, 3); px(2, 1, 1, 5); px(3, 0, 1, 7);
    if (muted) for (let i = 0; i < 4; i++) { px(5 + i, 1 + i); px(8 - i, 1 + i); }
    else { px(5, 2, 1, 3); px(7, 1, 1, 5); px(9, 0, 1, 7); }
  }
}
