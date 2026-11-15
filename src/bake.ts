// Code-drawn textures, baked once per track: the city far below and the raised track ribbon. From the concept mockup.
import Phaser from 'phaser';
import { HEIGHT, SCENERY, TEXT, TRACK, WIDTH } from './config';
import type { TrackDef } from './data/tracks';
import { mulberry32 } from './rng';
import type { Track } from './track';

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

/** The city texture's size: big enough to cover the view anywhere at the parallax scale, with a margin. */
export const citySize = (def: TrackDef) => ({
  w: Math.ceil(def.world.w * TRACK.parallax + WIDTH + 40),
  h: Math.ceil(def.world.h * TRACK.parallax + HEIGHT + 40),
});

/** Rooftops, street lights, neon strips and roof scenery (fans, dishes, water towers). `dark` is the Blackout league. */
export function bakeCity(scene: Phaser.Scene, def: TrackDef, dark = false) {
  const { w, h } = citySize(def);
  return canvas(scene, `city-${def.id}-${dark ? 'dark' : 'lit'}`, w, h, (g) => {
    const r = mulberry32(17);
    g.fillStyle = '#04050b';
    g.fillRect(0, 0, w, h);
    const roofs = ['#151830', '#18162b', '#121d2a', '#1a1b2e'];
    const neon = [TEXT.kerb, TEXT.cyan, '#8b5cff', TEXT.amber];
    const props: Array<{ x: number; y: number; key: string }> = [];
    for (let y = 0; y < h;) {
      const bh = 80 + Math.floor(r() * 110);
      for (let x = 0; x < w;) {
        const bw = 80 + Math.floor(r() * 140), gap = 10 + Math.floor(r() * 8);
        const rx = x + gap, ry = y + gap, rw = bw - gap * 2, rh = bh - gap * 2;
        g.fillStyle = 'rgba(255,190,90,0.55)';
        for (let sx = x + 6; sx < x + bw; sx += 22) g.fillRect(sx, y + 3, 1, 1);
        if (r() < 0.5) {
          g.fillStyle = r() < 0.5 ? 'rgba(255,70,90,0.7)' : 'rgba(230,240,255,0.7)';
          g.fillRect(x + r() * bw, y + 4, 3, 1);
        }
        g.fillStyle = roofs[Math.floor(r() * roofs.length)];
        g.fillRect(rx, ry, rw, rh);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(rx, ry, rw, 1); g.fillRect(rx, ry, 1, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(rx, ry + rh - 1, rw, 1); g.fillRect(rx + rw - 1, ry, 1, rh);
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.strokeRect(rx + 3.5, ry + 3.5, rw - 7, rh - 7);
        for (let k = 0; k < 3; k++) {
          g.fillStyle = 'rgba(120,140,190,0.10)';
          g.fillRect(rx + 6 + r() * (rw - 20), ry + 6 + r() * (rh - 18), 6 + r() * 8, 4 + r() * 5);
        }
        if (r() < 0.45) {
          g.globalAlpha = dark ? 0.25 : 0.7;
          g.fillStyle = neon[Math.floor(r() * neon.length)];
          const len = 10 + r() * 24;
          if (r() < 0.5) g.fillRect(rx + 4, ry + rh - 4, len, 1); else g.fillRect(rx + rw - 4, ry + 4, 1, len);
          g.globalAlpha = 1;
        }
        if (r() < 0.7) props.push({ x: rx + 10 + r() * (rw - 20), y: ry + 10 + r() * (rh - 20), key: SCENERY[Math.floor(r() * SCENERY.length)] });
        x += bw;
      }
      y += bh;
    }
    g.imageSmoothingEnabled = false;
    g.globalAlpha = dark ? 0.45 : 0.8;
    for (const p of props) {
      const img = scene.textures.get(p.key).getSourceImage() as CanvasImageSource;
      g.drawImage(img, Math.round(p.x - 8), Math.round(p.y - 8));
    }
    g.globalAlpha = 1;
    if (dark) {
      g.fillStyle = 'rgba(2,2,8,0.55)';
      g.fillRect(0, 0, w, h);
    }
  });
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
  const HW = TRACK.halfWidth, AP = TRACK.apron;
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

/**
 * Small code-drawn sprites. Coolant is a pale, see-through pool; a slick is a near-black blot with a light rim. They
 * differ in brightness, not just hue.
 */
export function bakeProps(scene: Phaser.Scene) {
  canvas(scene, 'hz-coolant', 30, 20, (g) => {
    g.fillStyle = 'rgba(90,200,255,0.38)';
    g.beginPath(); g.ellipse(15, 10, 14, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,240,255,0.55)';
    g.fillRect(9, 7, 4, 1); g.fillRect(17, 12, 5, 1); g.fillRect(12, 14, 2, 1);
  });
  canvas(scene, 'hz-slick', 24, 18, (g) => {
    g.fillStyle = 'rgba(3,3,8,0.92)';
    g.beginPath(); g.ellipse(12, 9, 11, 8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(233,239,255,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(12, 9, 7, 4.5, 0, 0, Math.PI * 2); g.stroke();
  });
}
