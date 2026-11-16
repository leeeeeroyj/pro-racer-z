import Phaser from 'phaser';
import { COLORS, FONT, HEAT, HEIGHT, HUD_H, HUD_SCALE, HUD_STATE, RIVALS, TEXT, UPGRADE, WIDTH, WORD, spriteAngle } from '../config';
import type { Device } from '../controls';
import { MUTED, toggleMute } from '../sfx';
import { fitCamera } from '../view';
import type { Verdict } from '../season';
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
  kbm: 'ENTER CONTINUE  ·  ESC TITLE',
  pad: 'A CONTINUE  ·  BACK TITLE',
  touch: 'TAP A BUTTON',
};
/** The results board's main button, by what the race decided. */
const VERDICT_BUTTON: Record<Verdict, string> = { next: 'NEXT RACE', crown: 'CROWN', retry: 'RETRY', over: 'GAME OVER' };
const SPEAKER = { x: W - 28, y: 6, w: 20, h: 16 };
/** The OVERDRIVE letter row: one box per letter, collected ones solid. */
const LETTERS = { x: 548, y: 5, w: 16, gap: 2 };
const SHIELD = { x: 740, y: 14 };
/** Results board, centred below the bar. Buttons are 48 units tall: 36 CSS px or more on a landscape phone. */
const BOARD = { x: W / 2, y: BAR + (H - BAR) / 2, w: 440, h: 330 };
const pts = (n: number) => n.toLocaleString('en');
/** Minimap (top right) and the speed / upgrade / heat strip (top left): the bottom corners stay free for thumbs. */
const MAP = { x: W - 8 - 150, y: BAR + 8, w: 150, h: 110, pad: 10 };
const STRIP = { x: 8, y: BAR + 8, w: 178, h: 70 };
const PIP = 10, PIP_GAP = 3;
const DYNAMO = RIVALS.find((r) => r.kind === 'dynamo')!;

/** Top bar: place, lap, race time, charges, score, OVERDRIVE letters, shield, sound. Then grid lights, the hint strip, banners and the results board. */
export class HudScene extends Phaser.Scene {
  private place!: Phaser.GameObjects.Text;
  private of!: Phaser.GameObjects.Text;
  private lap!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private charges!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private trackName!: Phaser.GameObjects.Text;
  private trackBg!: Phaser.GameObjects.Rectangle;
  private letters: Phaser.GameObjects.Text[] = [];
  private shield!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private hintBg!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;
  private dynamic!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Container;
  private boardTitle!: Phaser.GameObjects.Text;
  private boardRows: Phaser.GameObjects.Text[][] = [];
  private boardPoints!: Phaser.GameObjects.Text;
  private boardHint!: Phaser.GameObjects.Text;
  private primary!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Zone[] = [];
  private buttonArt: Phaser.GameObjects.GameObject[] = [];
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerSub!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;
  private mapArt!: Phaser.GameObjects.Graphics;
  private mapId = '';
  private mapFit = { s: 1, ox: 0, oy: 0 };
  private initials: Phaser.GameObjects.Text[] = [];
  private gauges!: Phaser.GameObjects.Container;

  constructor() {
    super('hud');
  }

  create() {
    fitCamera(this, HUD_SCALE);
    const label = (x: number, y: number, text: string, color: string = TEXT.dim) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: '16px', color });

    this.flash = this.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setAlpha(0);
    this.buildGauges();
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
    this.letters = [...WORD].map((ch, i) => label(LETTERS.x + i * (LETTERS.w + LETTERS.gap) + LETTERS.w / 2, 14, ch).setOrigin(0.5).setDepth(1));
    this.shield = this.add.image(SHIELD.x, SHIELD.y, 'shield');
    this.trackBg = this.add.rectangle(W / 2, 104, 10, 26, COLORS.panel, 0.92);
    this.trackName = label(W / 2, 104, '', TEXT.ink).setOrigin(0.5);
    this.hintBg = this.add.rectangle(W / 2, H - 46, 10, 22, COLORS.panel, 0.7);
    this.hint = label(W / 2, H - 46, '').setOrigin(0.5);
    this.bannerBg = this.add.rectangle(W / 2, 92, 10, 44, COLORS.panel, 0.8);
    this.banner = this.add.text(W / 2, 92, '', { fontFamily: FONT, fontSize: '32px', color: TEXT.amber, stroke: '#04050b', strokeThickness: 6 }).setOrigin(0.5);
    this.bannerSub = label(W / 2, 124, '', TEXT.ink).setOrigin(0.5);
    this.dynamic = this.add.graphics();
    this.buildBoard(label);

    // Phones have no M key: the speaker is a tap target, padded for a thumb.
    this.add.zone(W - 64, 0, 64, BAR + 16).setOrigin(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => toggleMute(this));
  }

  /** The strip's icons and the minimap's panel; the bars, pips and markers are drawn each frame. */
  private buildGauges() {
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.72).fillRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h).fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    this.mapArt = this.add.graphics();
    const icons = (['thruster', 'core', 'grip'] as const).map((k, i) => this.add.image(STRIP.x + 14 + i * 58, STRIP.y + 34, k));
    const dyn = this.add.image(STRIP.x + 14, STRIP.y + 56, DYNAMO.slot).setRotation(spriteAngle(DYNAMO.slot, -Math.PI / 2));
    this.initials = RIVALS.map((r) => this.add.text(0, 0, r.initial, { fontFamily: FONT, fontSize: '16px', color: r.color, stroke: '#04050b', strokeThickness: 4 }).setOrigin(0.5));
    this.gauges = this.add.container(0, 0, [bg, this.mapArt, ...icons, dyn, ...this.initials]).setVisible(false);
  }

  /** Fits the track into the minimap and draws it: the centreline and a tick at the start line. */
  private drawMap(map: HudState['map']) {
    this.mapId = map.id;
    const p = map.pts, xs = p.filter((_, i) => i % 2 === 0), ys = p.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((MAP.w - MAP.pad * 2) / (x1 - x0), (MAP.h - MAP.pad * 2) / (y1 - y0));
    this.mapFit = { s, ox: MAP.x + (MAP.w - (x1 - x0) * s) / 2 - x0 * s, oy: MAP.y + (MAP.h - (y1 - y0) * s) / 2 - y0 * s };
    const g = this.mapArt.clear(), f = this.mapFit;
    g.lineStyle(4, 0x4a5078).beginPath().moveTo(p[0] * s + f.ox, p[1] * s + f.oy);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * s + f.ox, p[i + 1] * s + f.oy);
    g.closePath().strokePath();
    const a = Math.atan2(p[3] - p[1], p[2] - p[0]), sx = p[0] * s + f.ox, sy = p[1] * s + f.oy, nx = -Math.sin(a) * 6, ny = Math.cos(a) * 6;
    g.lineStyle(2, COLORS.ink).lineBetween(sx - nx, sy - ny, sx + nx, sy + ny);
  }

  /** Speed bar, upgrade pips, Dynamo's heat; then gates and cars on the minimap. */
  private drawGauges(g: Phaser.GameObjects.Graphics, s: HudState) {
    if (s.map.id !== this.mapId) this.drawMap(s.map);
    const blinkOn = Math.floor(this.time.now / 150) % 2 === 0;
    const bx = STRIP.x + 8, by = STRIP.y + 8, bw = STRIP.w - 16, f = Math.min(1, s.speed / s.top);
    g.lineStyle(2, COLORS.line).strokeRect(bx, by, bw, 10);
    g.fillStyle(s.boosting ? COLORS.lime : COLORS.ink).fillRect(bx + 2, by + 2, (bw - 4) * f, 6);
    const pips = (x: number, y: number, n: number, on: number, color: number) => {
      for (let i = 0; i < n; i++) {
        const px = x + i * (PIP + PIP_GAP);
        if (i < on) g.fillStyle(color).fillRect(px, y, PIP, PIP);
        else g.lineStyle(2, COLORS.line).strokeRect(px + 1, y + 1, PIP - 2, PIP - 2);
      }
    };
    (['thruster', 'core', 'grip'] as const).forEach((k, i) => pips(STRIP.x + 24 + i * 58, STRIP.y + 29, UPGRADE.max, s.up[k], COLORS.kerb));
    const hot = s.heat >= HEAT.max;
    // At full heat the pips flash between filled and empty.
    pips(STRIP.x + 24, STRIP.y + 51, HEAT.max, hot && !blinkOn ? 0 : s.heat, COLORS.ink);

    const m = this.mapFit, P = (x: number, y: number) => [x * m.s + m.ox, y * m.s + m.oy] as const;
    for (const gt of s.gates) {
      if (gt.state === 'off') continue;
      // A gate is a bar with a post at each end, so it can't be taken for the start line's plain tick.
      const [x, y] = P(gt.x, gt.y), on = gt.state === 'on', color = on ? 0xffffff : 0xffb0bc;
      if (!on && !blinkOn) continue;
      const ax = x - gt.nx * 8, ay = y - gt.ny * 8, bx = x + gt.nx * 8, by = y + gt.ny * 8;
      g.lineStyle(on ? 3 : 2, color).lineBetween(ax, ay, bx, by);
      g.fillStyle(color).fillRect(ax - 3, ay - 3, 6, 6).fillRect(bx - 3, by - 3, 6, 6);
    }
    let k = 0;
    for (const d of s.dots) {
      const [x, y] = P(d.x, d.y);
      if (!d.you) { this.initials[k++]?.setPosition(x, y).setText(d.initial).setColor(d.color); continue; }
    }
    for (; k < this.initials.length; k++) this.initials[k].setPosition(-99, -99);
    // You: a pink arrow with a white edge, drawn last so it's on top.
    const you = s.dots.find((d) => d.you);
    if (you) {
      const [x, y] = P(you.x, you.y), c = Math.cos(you.a), n = Math.sin(you.a);
      const pts = [[9, 0], [-6, 6], [-3, 0], [-6, -6]].map(([u, v]) => new Phaser.Math.Vector2(x + u * c - v * n, y + u * n + v * c));
      g.fillStyle(COLORS.kerb).fillPoints(pts, true);
      g.lineStyle(2, COLORS.ink).strokePoints(pts, true);
    }
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
      ...this.keepPrimary(button(x - 95, 'NEXT RACE', true, () => race().next())),
      ...button(x + 95, 'TITLE', false, () => race().leave('title')),
      this.boardHint,
    ]).setVisible(false);
  }

  private keepPrimary(parts: Phaser.GameObjects.GameObject[]) {
    this.primary = parts[1] as Phaser.GameObjects.Text;
    return parts;
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
    this.trackName.setVisible(s.lights !== null && !s.results).setText(`RACE ${s.race}/${s.races}  ·  ${s.track}  ·  ${s.league}`);
    this.trackBg.setVisible(this.trackName.visible).setSize(this.trackName.width + 24, 26).setOrigin(0.5);
    this.shield.setAlpha(s.shield ? 1 : 0.18);
    s.letters.forEach((got, i) => {
      const x = LETTERS.x + i * (LETTERS.w + LETTERS.gap);
      if (got) g.fillStyle(COLORS.kerb).fillRect(x, LETTERS.y, LETTERS.w, 18);
      else g.lineStyle(2, COLORS.line).strokeRect(x + 1, LETTERS.y + 1, LETTERS.w - 2, 16);
      this.letters[i].setColor(got ? '#1b0614' : TEXT.dim);
    });
    this.hint.setVisible(s.hint && !s.results).setText(HINTS[s.device]);
    this.hintBg.setVisible(s.hint && !s.results).setSize(this.hint.width + 20, 22).setOrigin(0.5);
    this.banner.setVisible(!!s.banner && !s.results);
    if (s.banner) this.banner.setText(s.banner.text).setColor(s.banner.color);
    this.bannerSub.setVisible(this.banner.visible && !!s.banner?.sub).setText(s.banner?.sub ?? '');
    const subH = this.bannerSub.visible ? 26 : 0;
    this.bannerBg.setVisible(this.banner.visible).setSize(Math.max(this.banner.width, this.bannerSub.visible ? this.bannerSub.width : 0) + 24, 44 + subH).setOrigin(0.5, 0).setY(70);
    this.flash.setAlpha(s.flash);
    this.gauges.setVisible(!s.results);
    if (this.gauges.visible) this.drawGauges(g, s);

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
      const res = s.results, left = `${res.retries} ${res.retries === 1 ? 'RETRY' : 'RETRIES'} LEFT`;
      this.boardPoints.setText(
        res.verdict === 'retry' ? `RACE POINTS LOST  ·  ${left}`
          : res.verdict === 'over' ? `NO RETRIES LEFT  ·  SCORE ${pts(res.total)}`
            : `RACE +${pts(res.points)}  ·  SCORE ${pts(res.total)}`,
      ).setColor(res.verdict === 'retry' || res.verdict === 'over' ? TEXT.hurt : TEXT.ink);
      this.primary.setText(VERDICT_BUTTON[res.verdict]);
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
