// Code-drawn textures: the raised track ribbon, baked once per track, and the small hazard and letter sprites. From the concept mockup.
import Phaser from 'phaser';
import { FONT, TEXT, TRACK, WORD } from './config';
import type { TrackDef } from './data/tracks';
import type { Track } from './track';

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

function path(g: CanvasRenderingContext2D, t: Track, off: number) {
  g.beginPath();
  t.pts.forEach((p, i) => {
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.closePath();
}

/** The raised ribbon: drop shadow, wall, apron, asphalt, edge lines, kerbs on the bends, centre dashes, start line. */
export function bakeTrack(scene: Phaser.Scene, def: TrackDef, t: Track, dark = false, reverse = false) {
  const HW = t.hw, AP = TRACK.apron;
  return canvas(scene, `track-${def.id}-${dark ? 'dark' : 'lit'}${reverse ? '-rev' : ''}`, def.world.w, def.world.h, (g) => {
    const ribbon = (width: number, style: string) => {
      path(g, t, 0);
      g.lineWidth = width; g.strokeStyle = style; g.lineJoin = 'round'; g.stroke();
    };
    const edge = (off: number, style: string) => {
      path(g, t, off);
      g.lineWidth = 1; g.strokeStyle = style; g.stroke();
    };
    g.save(); g.translate(8, 12); ribbon((HW + AP) * 2 + 6, 'rgba(0,0,0,0.55)'); g.restore();
    ribbon((HW + AP) * 2 + 4, '#2c3050');
    ribbon((HW + AP) * 2, dark ? '#0e0f1c' : '#121426');
    ribbon(HW * 2, dark ? '#15172a' : '#1d2034');
    g.fillStyle = 'rgba(255,255,255,0.05)';
    t.pts.forEach((p, i) => {
      if (i % 2) return;
      for (const s of [-1, 1]) g.fillRect(p.x + p.nx * s * (HW + 6) - 0.5, p.y + p.ny * s * (HW + 6) - 0.5, 1, 1);
    });
    edge(HW, 'rgba(233,239,255,0.28)');
    edge(-HW, 'rgba(233,239,255,0.28)');
    edge(HW + AP + 1, dark ? 'rgba(54,226,255,0.35)' : 'rgba(54,226,255,0.6)');
    edge(-HW - AP - 1, dark ? 'rgba(255,62,165,0.35)' : 'rgba(255,62,165,0.6)');
    // Kerbs on the bends, brighter on the inside. Alternating light and dark blocks, so they read without the hues.
    t.pts.forEach((p, i) => {
      if (Math.abs(p.curv) < 0.16) return;
      const s = Math.sign(p.curv);
      for (const side of [s, -s]) {
        g.save();
        g.translate(p.x + p.nx * side * (HW - 2), p.y + p.ny * side * (HW - 2));
        g.rotate(p.h);
        g.fillStyle = Math.floor(i / 2) % 2 ? TEXT.kerb : '#e9efff';
        g.globalAlpha = side === s ? 0.95 : 0.5;
        g.fillRect(-3, -2, 6, 4);
        g.restore();
      }
    });
    g.fillStyle = 'rgba(233,239,255,0.16)';
    t.pts.forEach((p, i) => { if (i % 6 < 2) g.fillRect(p.x - 0.5, p.y - 0.5, 1.5, 1.5); });
    const s0 = t.pts[0];
    g.save(); g.translate(s0.x, s0.y); g.rotate(s0.h);
    for (let k = -HW; k < HW; k += 4) for (let m = 0; m < 2; m++) {
      g.fillStyle = (k / 4 + m) % 2 ? '#e9efff' : '#05060c';
      g.fillRect(-4 + m * 4, k, 4, 4);
    }
    g.restore();
  });
}

/** Animated hazards: how many frames each loop has and how fast it plays. Texture keys are `hz-<kind>-<frame>`. */
export const HAZARD_FRAMES = { coolant: { n: 12, fps: 10 }, slick: { n: 16, fps: 8 } } as const;

type RGBA = [number, number, number, number];

/**
 * Draws a texture a pixel at a time, so code-drawn art stays crisp at the camera's zoom. `px` returns the colour of
 * pixel (x, y), or null for clear.
 */
function pixels(scene: Phaser.Scene, key: string, w: number, h: number, px: (x: number, y: number) => RGBA | null) {
  canvas(scene, key, w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = px(x, y);
      if (!c) continue;
      const i = (y * w + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = Math.round(c[3] * 255);
    }
    g.putImageData(img, 0, 0);
  });
}

/** A lumpy round blob, so it needs no turning to sit on any stretch of track: inside test and normalised radius. */
function blob(cx: number, cy: number, rx: number, ry: number, lumps: number[]) {
  const shape = (x: number, y: number) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const th = Math.atan2(dy, dx);
    const edge = 1 + lumps[0] * Math.sin(3 * th + 0.7) + lumps[1] * Math.sin(5 * th + 2.1);
    return { rho: Math.hypot(dx, dy) / edge, th };
  };
  const inside = (x: number, y: number) => shape(x, y).rho <= 1;
  /** Edge pixels, split by which side faces the light (top left). */
  const rim = (x: number, y: number) => {
    if (!inside(x, y)) return 0;
    if (!inside(x - 1, y) || !inside(x, y - 1)) return 1;
    if (!inside(x + 1, y) || !inside(x, y + 1)) return -1;
    return 0;
  };
  return { shape, inside, rim };
}

/**
 * Small code-drawn sprites. Coolant is a pale, see-through pool that ripples; a slick is a near-black pool of oil with
 * a light rim and a light swirl turning in it. They differ in brightness and motion, not just hue.
 */
export function bakeProps(scene: Phaser.Scene) {
  // Coolant: drips land in two spots and ripple out, glints twinkle, and a faint shimmer runs across.
  const cool = blob(15, 12, 12.5, 10.5, [0.09, 0.06]);
  const drips = [{ x: 11, y: 9, at: 0 }, { x: 19, y: 15, at: 0.5 }];
  const glints = [{ x: 8, y: 8, at: 0.1 }, { x: 18, y: 7, at: 0.45 }, { x: 14, y: 17, at: 0.75 }];
  const CN = HAZARD_FRAMES.coolant.n;
  for (let f = 0; f < CN; f++) {
    const u = f / CN;
    pixels(scene, `hz-coolant-${f}`, 30, 24, (x, y) => {
      if (!cool.inside(x, y)) return null;
      const edge = cool.rim(x, y);
      if (edge > 0) return [190, 240, 255, 0.85];
      if (edge < 0) return [40, 130, 190, 0.65];
      for (const g of glints) {
        const k = (u - g.at + 1) % 1;
        if (k < 0.16 && x === g.x && y === g.y) return [255, 255, 255, 0.95];
        if (k < 0.08 && Math.abs(x - g.x) + Math.abs(y - g.y) === 1) return [235, 250, 255, 0.8];
      }
      for (const d of drips) {
        const k = (u - d.at + 1) % 1, r = k * 9;
        if (k > 0.05 && Math.abs(Math.hypot(x - d.x, (y - d.y) * 1.15) - r) < 0.55) return [205, 245, 255, 0.75 * (1 - k)];
      }
      const shimmer = Math.sin(0.55 * x + 0.35 * y - u * Math.PI * 2) > 0.7 ? 0.18 : 0;
      return [80, 190, 240, 0.4 + shimmer];
    });
  }

  // Oil slick: a black eye with two light arms of sheen winding round it, turning clockwise, and a light rim.
  const oil = blob(12, 11, 10.5, 9.5, [0.07, 0.05]);
  const SN = HAZARD_FRAMES.slick.n;
  for (let f = 0; f < SN; f++) {
    const u = f / SN;
    pixels(scene, `hz-slick-${f}`, 24, 22, (x, y) => {
      if (!oil.inside(x, y)) return null;
      if (oil.rim(x, y) > 0) return [233, 239, 255, 0.7];
      const { rho, th } = oil.shape(x, y);
      if (rho < 0.22) return [0, 0, 0, 0.97];
      const arm = Math.sin(2 * th - 6.5 * rho + u * Math.PI * 2);
      // The sheen's hue drifts outward (violet, teal, pale); its brightness is the cue.
      const sheen: RGBA = rho < 0.5 ? [120, 90, 170, 0.95] : rho < 0.78 ? [90, 170, 175, 0.95] : [200, 210, 235, 0.95];
      if (arm > 0.55) return sheen;
      if (arm > 0.2) return [Math.round(sheen[0] * 0.45), Math.round(sheen[1] * 0.45), Math.round(sheen[2] * 0.45), 0.95];
      return [8, 8, 16, 0.95];
    });
  }
  // Boost pad: three bright chevrons pointing along the track (drawn pointing right; the image turns with the track).
  canvas(scene, 'hz-boost', 20, 20, (g) => {
    g.strokeStyle = '#a8ff4f'; g.lineWidth = 2; g.lineCap = 'square';
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(3 + k * 5, 2); g.lineTo(8 + k * 5, 10); g.lineTo(3 + k * 5, 18); g.stroke();
    }
  });
  // Letter tiles: a pink tile with a dark letter, so the letter itself is the cue.
  for (let i = 0; i < WORD.length; i++) {
    canvas(scene, `letter-${i}`, 11, 12, (g) => {
      g.fillStyle = TEXT.kerb; g.fillRect(0, 0, 11, 12);
      g.fillStyle = '#ffd6ec'; g.fillRect(0, 0, 11, 1); g.fillRect(0, 0, 1, 12);
      g.fillStyle = '#1b0614'; g.font = `8px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(WORD[i], 6, 6.5);
    });
  }
}
