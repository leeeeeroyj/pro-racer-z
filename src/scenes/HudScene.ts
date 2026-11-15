import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, HUD_H, HUD_SCALE, HUD_STATE, TEXT, WIDTH } from '../config';
import type { Device } from '../controls';
import { MUTED, toggleMute } from '../sfx';
import { fitCamera } from '../view';
import { fmtTime, ordinal, type HudState } from './RaceScene';

// HUD space is the design size × HUD_SCALE (832×456): 16 px text here is 8 game pixels.
const S = HUD_SCALE;
const W = WIDTH * S, H = HEIGHT * S, BAR = HUD_H * S;
const HINTS: Record<Device, string> = {
  kbm: 'LEFT / RIGHT TURN  ·  UP GO  ·  DOWN BRAKE  ·  Z DART  ·  X MINE',
  pad: 'D-PAD TURNS  ·  STICK POINTS  ·  A GO  ·  B BRAKE  ·  X DART  ·  Y MINE',
  touch: 'TOUCH CONTROLS ARRIVE IN A LATER BUILD',
};
const RESULT_HINTS: Record<Device, string> = {
  kbm: 'ENTER NEXT RACE  ·  ESC TITLE',
  pad: 'A NEXT RACE  ·  BACK TITLE',
  touch: 'TAP A BUTTON',
};
const SPEAKER = { x: W - 28, y: 6, w: 20, h: 16 };
/** Results board, centred below the bar. Buttons are 48 units tall: 36 CSS px or more on a landscape phone. */
const BOARD = { x: W / 2, y: BAR + (H - BAR) / 2, w: 440, h: 330 };
const pts = (n: number) => n.toLocaleString('en');

/** Top bar: place, lap, race time, charges, score, track, sound. Then grid lights, the hint strip, banners and the results board. */
export class HudScene extends Phaser.Scene {
  private place!: Phaser.GameObjects.Text;
  private of!: Phaser.GameObjects.Text;
  private lap!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private charges!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private trackName!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hintBg!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;
  private dynamic!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Container;
  private boardTitle!: Phaser.GameObjects.Text;
  private boardRows: Phaser.GameObjects.Text[][] = [];
  private boardPoints!: Phaser.GameObjects.Text;
  private boardHint!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Zone[] = [];
  private buttonArt: Phaser.GameObjects.GameObject[] = [];

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
    this.add.image(336, 14, 'dart').setScale(1);
    this.charges = label(348, 6, '', TEXT.ink);
    this.score = label(520, 6, '', TEXT.ink).setOrigin(1, 0);
    this.trackName = label(SPEAKER.x - 16, 6, '').setOrigin(1, 0);
    this.hintBg = this.add.rectangle(W / 2, H - 46, 10, 22, COLORS.panel, 0.7);
    this.hint = label(W / 2, H - 46, '').setOrigin(0.5);
    this.banner = this.add.text(W / 2, 92, '', { fontFamily: FONT, fontSize: '32px', color: TEXT.amber, stroke: '#04050b', strokeThickness: 6 }).setOrigin(0.5);
    this.dynamic = this.add.graphics();
    this.buildBoard(label);

    // Phones have no M key: the speaker is a tap target, padded for a thumb.
    this.add.zone(W - 64, 0, 64, BAR + 16).setOrigin(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => toggleMute(this));
  }

  private buildBoard(label: (x: number, y: number, text: string, color?: string) => Phaser.GameObjects.Text) {
    const race = () => this.scene.get('race') as unknown as { next(): void; leave(to?: string): void };
    const { x, y, w, h } = BOARD, top = y - h / 2;
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.street, 0.55).fillRect(0, BAR + 2, W, H - BAR - 2);
    bg.fillStyle(COLORS.panel, 0.96).fillRect(x - w / 2, top, w, h);
    bg.lineStyle(2, COLORS.kerb).strokeRect(x - w / 2, top, w, h);
    this.boardTitle = label(x, top + 14, '').setOrigin(0.5, 0);
    this.boardRows = [0, 1, 2, 3].map((i) => {
      const ry = top + 48 + i * 30;
      return [label(x - 180, ry, ''), label(x - 120, ry, ''), label(x + 170, ry, '').setOrigin(1, 0)];
    });
    this.boardPoints = label(x, top + 176, '', TEXT.ink).setOrigin(0.5, 0);
    const button = (bx: number, text: string, primary: boolean, act: () => void) => {
      const bw = 170, bh = 48, by = top + 210;
      const art = this.add.graphics();
      if (primary) art.fillStyle(COLORS.kerb).fillRect(bx - bw / 2, by, bw, bh);
      else art.lineStyle(2, COLORS.ink).strokeRect(bx - bw / 2 + 1, by + 1, bw - 2, bh - 2);
      const t = label(bx, by + bh / 2, text, primary ? '#04050b' : TEXT.ink).setOrigin(0.5);
      const zone = this.add.zone(bx - bw / 2, by, bw, bh).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', act);
      this.buttons.push(zone);
      this.buttonArt.push(art, t);
      return [art, t, zone];
    };
    this.buttons = [];
    this.buttonArt = [];
    this.boardHint = label(x, top + h - 34, '').setOrigin(0.5, 0);
    this.board = this.add.container(0, 0, [
      bg, this.boardTitle, ...this.boardRows.flat(), this.boardPoints,
      ...button(x - 95, 'NEXT RACE', true, () => race().next()),
      ...button(x + 95, 'TITLE', false, () => race().leave('title')),
      this.boardHint,
    ]).setVisible(false);
  }

  update() {
    const s = this.registry.get(HUD_STATE) as HudState | undefined;
    const g = this.dynamic.clear();
    if (!s) return;
    this.place.setText(ordinal(s.place)).setColor(s.place === 1 ? TEXT.kerb : s.place === s.of ? TEXT.hurt : TEXT.ink);
    this.of.setText(`/${s.of}`);
    this.lap.setText(`LAP ${s.lap}/${s.laps}`);
    this.clock.setText(fmtTime(s.raceTime));
    this.charges.setText(`×${s.charges}`).setColor(s.charges ? TEXT.ink : TEXT.hurt);
    this.score.setText(String(s.score).padStart(7, '0'));
    this.trackName.setText(s.track);
    this.hint.setVisible(s.hint && !s.results).setText(HINTS[s.device]);
    this.hintBg.setVisible(s.hint && !s.results).setSize(this.hint.width + 20, 22).setOrigin(0.5);
    this.banner.setVisible(!!s.banner && !s.results);
    if (s.banner) this.banner.setText(s.banner.text).setColor(s.banner.color);

    // Grid lights: dark until lit, then bright, so they read by brightness as well as colour.
    if (s.lights !== null) {
      const cx = W / 2, cy = 76;
      g.fillStyle(COLORS.panel, 0.92).fillRect(cx - 60, cy - 18, 120, 36);
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k < s.lights ? 0xff5470 : 0x2a1020).fillCircle(cx - 34 + k * 34, cy, 12);
        if (k < s.lights) g.fillStyle(0xffd0d8).fillCircle(cx - 37 + k * 34, cy - 3, 4);
      }
    }

    this.board.setVisible(!!s.results);
    for (const z of this.buttons) z.input!.enabled = !!s.results?.ready;
    for (const a of this.buttonArt) (a as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(s.results?.ready ? 1 : 0.4);
    if (s.results) {
      this.boardTitle.setText(`${s.track}  ·  ${s.league}`);
      s.results.rows.forEach((row, i) => {
        const [p, n, t] = this.boardRows[i];
        p.setText(ordinal(row.place)).setColor(row.place === 1 ? TEXT.kerb : TEXT.ink);
        n.setText(row.you ? `> ${row.name}` : row.name).setColor(row.color);
        t.setText(row.time).setColor(TEXT.dim);
      });
      this.boardPoints.setText(`RACE +${pts(s.results.points)}  ·  SCORE ${pts(s.results.total)}`);
      this.boardHint.setText(RESULT_HINTS[s.device]);
    }

    // Speaker: three waves when on, a cross when muted. Drawn in 2 px blocks to match the game's pixels.
    const muted = this.registry.get(MUTED) === true;
    g.fillStyle(muted ? COLORS.hurt : COLORS.ink);
    const px = (x: number, y: number, w = 1, h = 1) => g.fillRect(SPEAKER.x + x * 2, SPEAKER.y + y * 2, w * 2, h * 2);
    px(0, 2, 2, 3); px(2, 1, 1, 5); px(3, 0, 1, 7);
    if (muted) for (let i = 0; i < 4; i++) { px(5 + i, 1 + i); px(8 - i, 1 + i); }
    else { px(5, 2, 1, 3); px(7, 1, 1, 5); px(9, 0, 1, 7); }
  }
}
