// Menu pieces for the HUD-scale screens (pit board, final screen): text, buttons and rows of boxes.
import Phaser from 'phaser';
import { COLORS, FONT, TEXT } from '../config';

export const label = (scene: Phaser.Scene, x: number, y: number, text: string, color: string = TEXT.dim, size = 16) =>
  scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });

/** A button 48 units tall (36 CSS px or more on a landscape phone). Primary: solid pink; secondary: an outline. */
export function button(scene: Phaser.Scene, cx: number, y: number, text: string, primary: boolean, act: () => void, w = 190) {
  const h = 48, g = scene.add.graphics();
  if (primary) g.fillStyle(COLORS.kerb).fillRect(cx - w / 2, y, w, h);
  else g.lineStyle(2, COLORS.ink).strokeRect(cx - w / 2 + 1, y + 1, w - 2, h - 2);
  const t = label(scene, cx, y + h / 2, text, primary ? '#04050b' : TEXT.ink).setOrigin(0.5);
  scene.add.zone(cx - w / 2, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', act);
  return t;
}

/** `n` boxes, the first `filled` solid and the rest outlined, so they read by fill rather than colour. */
export function boxes(g: Phaser.GameObjects.Graphics, x: number, y: number, n: number, filled: number, size = 14, gap = 4, color: number = COLORS.kerb) {
  for (let i = 0; i < n; i++) {
    const bx = x + i * (size + gap);
    if (i < filled) g.fillStyle(color).fillRect(bx, y, size, size);
    else g.lineStyle(2, COLORS.line).strokeRect(bx + 1, y + 1, size - 2, size - 2);
  }
}
