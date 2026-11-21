// The city far below the track, in layers at different depths: the streets furthest down, then the low rooftops,
// their neon, and the tall towers nearest. Each layer is drawn at its own scale and anchored at the middle of the
// view, so as you race the towers slide over the low roofs and the roofs over the streets, like a real city seen
// from above. Live over it: traffic, tower beacons, neon that drifts through the colours and pulses with the music,
// and searchlights sweeping the sky. All of it stays under the track, so the track and everything on it read first.
import Phaser from 'phaser';
import { CITY, FONT, HEIGHT, SCENERY, WIDTH } from './config';
import type { TrackDef } from './data/tracks';
import { mulberry32 } from './rng';

/** Plan space is the world plus this margin all round, so every layer covers the view wherever the camera is. */
export const MARGIN = 80;
export const citySize = (def: TrackDef) => ({ w: def.world.w + 2 * MARGIN, h: def.world.h + 2 * MARGIN });

type Roof = 'plain' | 'atrium' | 'solar' | 'garden' | 'tower' | 'helipad' | 'pool' | 'sign';
interface Lot { x: number; y: number; w: number; h: number; roof: Roof; storeys: number }
/** A street running the full width (`vertical` false) or height of the city: centre and width, plan px. */
interface Street { vertical: boolean; c: number; w: number }
interface Point { x: number; y: number; ph: number }

/** Buildings this tall or taller go in the near layer. */
const TALL = 3;
const isTall = (l: Lot) => l.storeys >= TALL;

/** Lit skylights: a few warm shades and brightnesses. */
const WINDOWS = ['rgba(255,190,100,0.2)', 'rgba(255,205,110,0.28)', 'rgba(255,215,120,0.36)', 'rgba(255,185,95,0.42)'];

const SIGNS = ['HOTEL', 'RAMEN', 'ARCADE', '24H', 'BAR', 'NOODLE', 'KARAOKE', 'GYM', 'DINER', 'TAXI', 'SUSHI', 'CLUB'];

/** A stable seed per track, so each one gets its own city. */
const seedOf = (id: string) => [...id].reduce((a, ch) => Math.imul(a ^ ch.charCodeAt(0), 16777619), 2166136261);

/** Blocks and the streets between them along one axis: [start, end) pairs. */
function cut(len: number, r: () => number, min: number, spread: number) {
  const blocks: Array<[number, number]> = [], streets: Array<[number, number]> = [];
  for (let p = -Math.floor(r() * min); p < len;) {
    const b = min + Math.floor(r() * spread);
    blocks.push([p, p + b]);
    p += b;
    const w = r() < 0.3 ? 14 : 9;
    streets.push([p, p + w]);
    p += w;
  }
  return { blocks, streets };
}

/** The city's layout, the same every time for a track: streets, lots with their roofs and heights, beacons, searchlights. */
export function cityPlan(def: TrackDef) {
  const { w, h } = citySize(def), r = mulberry32(seedOf(def.id));
  const cols = cut(w, r, 90, 80), rows = cut(h, r, 70, 60);
  const streets: Street[] = [
    ...cols.streets.map(([a, b]) => ({ vertical: true, c: (a + b) / 2, w: b - a })),
    ...rows.streets.map(([a, b]) => ({ vertical: false, c: (a + b) / 2, w: b - a })),
  ];
  const blocks: Array<{ x: number; y: number; w: number; h: number }> = [];
  const lots: Lot[] = [], beacons: Point[] = [];
  for (const [y0, y1] of rows.blocks) for (const [x0, x1] of cols.blocks) {
    blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    // Inside the pavement, split the block into one to four buildings with narrow alleys between.
    const parts = [{ x: x0 + 3, y: y0 + 3, w: x1 - x0 - 6, h: y1 - y0 - 6 }];
    const split = (k: number, vertical: boolean) => {
      const p = parts[k], f = 0.35 + r() * 0.3, gap = 3;
      if (vertical && p.w > 50) {
        const a = Math.floor(p.w * f);
        parts.splice(k, 1, { ...p, w: a - gap }, { ...p, x: p.x + a, w: p.w - a });
      } else if (!vertical && p.h > 44) {
        const a = Math.floor(p.h * f);
        parts.splice(k, 1, { ...p, h: a - gap }, { ...p, y: p.y + a, h: p.h - a });
      }
    };
    if (r() < 0.75) split(0, r() < 0.6);
    if (r() < 0.5) split(Math.floor(r() * parts.length), r() < 0.5);
    if (r() < 0.3) split(Math.floor(r() * parts.length), r() < 0.5);
    for (const p of parts) {
      const big = p.w >= 36 && p.h >= 36, roll = r();
      let roof: Roof = 'plain';
      if (roll < 0.14) roof = 'atrium';
      else if (roll < 0.24) roof = 'solar';
      else if (roll < 0.33) roof = 'garden';
      else if (roll < 0.41) roof = 'tower';
      else if (roll < 0.47 && big) roof = 'helipad';
      else if (roll < 0.53 && big) roof = 'pool';
      else if (roll < 0.63) roof = 'sign';
      // Towers and helipads are tall; signs sit on low roofs, with the neon.
      const storeys = roof === 'tower' ? 4 : roof === 'helipad' ? 3 : 1 + Math.floor(r() * (roof === 'sign' ? 2 : 3));
      lots.push({ ...p, roof, storeys });
      if (roof === 'tower') beacons.push({ x: Math.round(p.x + p.w / 2), y: Math.round(p.y + p.h / 2), ph: r() });
    }
  }
  // Searchlights stand at street corners, one to every patch of city.
  const lights: Point[] = [];
  const vs = streets.filter((s) => s.vertical), hs = streets.filter((s) => !s.vertical);
  for (let k = 0; k < Math.round((w * h) / CITY.beams.area); k++) {
    lights.push({ x: vs[Math.floor(r() * vs.length)].c, y: hs[Math.floor(r() * hs.length)].c, ph: r() });
  }
  return { w, h, streets, blocks, lots, beacons, lights };
}
export type CityPlan = ReturnType<typeof cityPlan>;

/** A small tile drawn once, so one fill can repeat it over a whole street or roof. */
function tile(w: number, h: number, draw: (t: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

/**
 * Fills a rectangle with a repeating tile, starting at the rectangle's corner. Fine detail (lane dashes, crossings,
 * skylights, solar cells, glass) goes down this way: a few hundred fills rather than tens of thousands of tiny ones,
 * which made the bake slow to rasterise.
 */
function fillTiled(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return;
  g.save();
  g.translate(x, y);
  g.fillStyle = g.createPattern(img, 'repeat')!;
  g.fillRect(0, 0, w, h);
  g.restore();
}

export type Layer = 'ground' | 'low' | 'neon' | 'tall';
/** Every layer, furthest first. */
export const LAYERS: readonly Layer[] = ['ground', 'low', 'neon', 'tall'];
/** A layer's scale: the neon sits on the low roofs. */
export const layerScale = (layer: Layer) => CITY.depth[layer === 'neon' ? 'low' : layer];
export const layerKey = (def: TrackDef, dark: boolean, layer: Layer) => `city-${def.id}-${dark ? 'dark' : 'lit'}-${layer}`;

/**
 * Bakes one layer of the city into a texture (if it isn't there already) and returns its key. Positions come from
 * the plan and are scaled to the layer's depth and rounded to whole pixels, so the pixel art stays crisp; the details
 * keep their size. `dark` is the Blackout league: the lights go down.
 */
export function bakeLayer(scene: Phaser.Scene, def: TrackDef, plan: CityPlan, dark: boolean, layer: Layer) {
  const key = layerKey(def, dark, layer);
  if (scene.textures.exists(key)) return key;
  const s = layerScale(layer), w = Math.ceil(plan.w * s), h = Math.ceil(plan.h * s);
  const tex = scene.textures.createCanvas(key, w, h)!, g = tex.getContext();
  const r = mulberry32(seedOf(def.id) ^ (0x5bd1e995 + LAYERS.indexOf(layer)));
  const S = (v: number) => Math.round(v * s);
  const box = (b: { x: number; y: number; w: number; h: number }) => {
    const x = S(b.x), y = S(b.y);
    return { x, y, w: S(b.x + b.w) - x, h: S(b.y + b.h) - y };
  };
  if (layer === 'ground') ground(g, plan, dark, r, S, box, w, h);
  else if (layer === 'neon') neon(g, plan, dark, r, box);
  else roofs(scene, g, plan, dark, r, box, layer === 'tall');
  if (dark) {
    // Darken what's drawn, and only that (the roof layers are see-through between buildings).
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(2,2,8,0.5)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  tex.refresh();
  return key;
}

type Box = (b: { x: number; y: number; w: number; h: number }) => { x: number; y: number; w: number; h: number };

/** Asphalt, pavements, lane markings, zebra crossings and street lamps. */
function ground(g: CanvasRenderingContext2D, plan: CityPlan, dark: boolean, r: () => number, S: (v: number) => number, box: Box, w: number, h: number) {
  const lit = dark ? 0.3 : 1;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#0b0c18';
  for (const b of plan.blocks) { const q = box(b); g.fillRect(q.x, q.y, q.w, q.h); }

  // A dashed centre line (doubled on the wide avenues), and zebra crossings at every junction.
  const dash = `rgba(255,200,120,${0.16 * lit})`;
  const dashV = tile(1, 8, (t) => { t.fillStyle = dash; t.fillRect(0, 0, 1, 4); });
  const dashH = tile(8, 1, (t) => { t.fillStyle = dash; t.fillRect(0, 0, 4, 1); });
  for (const st of plan.streets) {
    for (const o of st.w > 10 ? [-1, 1] : [0]) {
      if (st.vertical) fillTiled(g, dashV, S(st.c) + o, 0, 1, h); else fillTiled(g, dashH, 0, S(st.c) + o, w, 1);
    }
  }
  const zebra = 'rgba(233,239,255,0.09)';
  const zebraV = tile(2, 1, (t) => { t.fillStyle = zebra; t.fillRect(1, 0, 1, 1); });
  const zebraH = tile(1, 2, (t) => { t.fillStyle = zebra; t.fillRect(0, 1, 1, 1); });
  const vs = plan.streets.filter((st) => st.vertical), hs = plan.streets.filter((st) => !st.vertical);
  for (const v of vs) for (const hz of hs) {
    const x0 = S(v.c - v.w / 2), y0 = S(hz.c - hz.w / 2), vw = S(v.c + v.w / 2) - x0, hw = S(hz.c + hz.w / 2) - y0;
    fillTiled(g, zebraV, x0, y0 - 5, vw - 1, 3); fillTiled(g, zebraV, x0, y0 + hw + 2, vw - 1, 3);
    fillTiled(g, zebraH, x0 - 5, y0, 3, hw - 1); fillTiled(g, zebraH, x0 + vw + 2, y0, 3, hw - 1);
  }

  // Street lamps down both sides, each with a warm pool of light (one glow, stamped). Most are out in a blackout.
  const glow = tile(20, 20, (t) => {
    const pool = t.createRadialGradient(10, 10, 0, 10, 10, 10);
    pool.addColorStop(0, 'rgba(255,190,110,0.16)');
    pool.addColorStop(1, 'rgba(255,190,110,0)');
    t.fillStyle = pool;
    t.fillRect(0, 0, 20, 20);
  });
  const lamps: Array<[number, number]> = [];
  for (const st of plan.streets) {
    const len = st.vertical ? plan.h : plan.w;
    for (let p = 18 + Math.floor(r() * 20); p < len; p += 34 + Math.floor(r() * 12)) {
      if (dark && r() > 0.12) continue;
      const off = (r() < 0.5 ? -1 : 1) * (st.w / 2 + 1);
      const x = S(st.vertical ? st.c + off : p), y = S(st.vertical ? p : st.c + off);
      g.drawImage(glow, x - 10, y - 10);
      lamps.push([x, y]);
    }
  }
  g.fillStyle = 'rgba(255,225,170,0.75)';
  for (const [x, y] of lamps) g.fillRect(x, y, 1, 1);
}

/** One roof layer: the low buildings, or the tall ones. Each casts its shadow the same way as the track's. */
function roofs(scene: Phaser.Scene, g: CanvasRenderingContext2D, plan: CityPlan, dark: boolean, r: () => number, box: Box, tall: boolean) {
  const lit = dark ? 0.3 : 1;
  const lots = plan.lots.filter((l) => isTall(l) === tall);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (const l of lots) {
    const q = box(l), sh = 2 + l.storeys * 3;
    g.fillRect(q.x + Math.round(sh * 0.66), q.y + sh, q.w, q.h);
  }

  // Skylight grids (a few random layouts of lit and dark panes), solar cells and tower glass, as tiles.
  const skylights = [0, 1, 2].map(() => tile(30, 30, (t) => {
    for (let py = 0; py < 30; py += 5) for (let px = 0; px < 30; px += 5) {
      t.fillStyle = r() < (dark ? 0.08 : 0.45) ? WINDOWS[Math.floor(r() * WINDOWS.length)] : 'rgba(110,130,180,0.10)';
      t.fillRect(px, py, 3, 3);
    }
  }));
  const solar = tile(8, 5, (t) => {
    t.fillStyle = '#1a2242'; t.fillRect(0, 0, 7, 3);
    t.fillStyle = 'rgba(140,170,255,0.16)'; t.fillRect(0, 0, 7, 1);
  });
  const glass = tile(4, 4, (t) => { t.fillStyle = 'rgba(120,160,230,0.07)'; t.fillRect(0, 0, 1, 4); t.fillRect(0, 0, 4, 1); });

  const colours = ['#151830', '#18162b', '#121d2a', '#1a1b2e'];
  const props: Array<{ x: number; y: number; key: string }> = [];
  for (const l of lots) {
    const { x, y, w: rw, h: rh } = box(l);
    if (rw < 8 || rh < 8) continue;
    g.fillStyle = l.roof === 'tower' ? '#161c34' : l.roof === 'garden' ? '#0e1815' : colours[Math.floor(r() * colours.length)];
    g.fillRect(x, y, rw, rh);
    // Parapet: lit on the top and left, dark on the bottom and right.
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x, y, rw, 1); g.fillRect(x, y, 1, rh);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(x, y + rh - 1, rw, 1); g.fillRect(x + rw - 1, y, 1, rh);
    const ix = x + 4, iy = y + 4, iw = rw - 8, ih = rh - 8;
    switch (l.roof) {
      case 'plain':
      case 'sign': {
        // (A sign's letters are in the neon layer.) A stair housing and a few vents.
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.strokeRect(x + 3.5, y + 3.5, rw - 7, rh - 7);
        if (l.roof === 'sign') break;
        if (iw > 16 && ih > 14) {
          const hx = ix + Math.floor(r() * (iw - 12)), hy = iy + Math.floor(r() * (ih - 10));
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(hx + 2, hy + 3, 12, 8);
          g.fillStyle = '#22253c'; g.fillRect(hx, hy, 12, 8);
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(hx, hy, 12, 1);
        }
        g.fillStyle = '#23263d';
        for (let k = 0; k < 3; k++) if (iw > 6 && ih > 4) g.fillRect(ix + Math.floor(r() * (iw - 4)), iy + Math.floor(r() * (ih - 3)), 3, 2);
        if (r() < 0.6 && iw > 20 && ih > 20) props.push({ x: ix + 8 + r() * (iw - 16), y: iy + 8 + r() * (ih - 16), key: SCENERY[Math.floor(r() * SCENERY.length)] });
        break;
      }
      case 'atrium':
        // A grid of skylights, some lit warm from the floors below.
        fillTiled(g, skylights[Math.floor(r() * skylights.length)], ix, iy, Math.floor((iw + 2) / 5) * 5 - 2, Math.floor((ih + 2) / 5) * 5 - 2);
        break;
      case 'solar':
        fillTiled(g, solar, ix, iy, Math.floor((iw + 1) / 8) * 8 - 1, Math.floor((ih + 2) / 5) * 5 - 2);
        break;
      case 'garden': {
        g.fillStyle = 'rgba(160,150,120,0.08)';
        g.fillRect(ix, y + Math.floor(rh / 2), iw, 2);
        for (let k = 0; k < Math.max(2, Math.floor((iw * ih) / 140)); k++) {
          const tx = ix + 3 + r() * Math.max(1, iw - 6), ty = iy + 3 + r() * Math.max(1, ih - 6), tr = 2 + r() * 3;
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(tx + 1.5, ty + 2, tr, 0, Math.PI * 2); g.fill();
          g.fillStyle = r() < 0.5 ? '#173328' : '#1d3b2c'; g.beginPath(); g.arc(tx, ty, tr, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(150,220,170,0.12)'; g.fillRect(Math.round(tx - 1), Math.round(ty - 1), 1, 1);
        }
        break;
      }
      case 'tower': {
        // Glass: a fine grid with a sheen across one corner, and a crown in the middle (the beacon sits on it).
        fillTiled(g, glass, ix, iy, iw, ih);
        const sheen = g.createLinearGradient(x, y, x + rw, y + rh);
        sheen.addColorStop(0, 'rgba(170,200,255,0.10)'); sheen.addColorStop(0.4, 'rgba(170,200,255,0)');
        g.fillStyle = sheen; g.fillRect(x, y, rw, rh);
        const cx = Math.round(x + rw / 2), cy = Math.round(y + rh / 2);
        g.fillStyle = '#20263f'; g.fillRect(cx - 5, cy - 5, 10, 10);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(cx - 5, cy - 5, 10, 1);
        break;
      }
      case 'helipad': {
        const cx = x + rw / 2, cy = y + rh / 2, rad = Math.min(14, Math.min(rw, rh) / 2 - 5);
        g.fillStyle = '#141626'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(233,239,255,0.22)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rad - 1.5, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(233,239,255,0.28)';
        const hh = Math.round(rad * 0.9), hw = Math.round(rad * 0.6), X = Math.round(cx), Y = Math.round(cy);
        g.fillRect(X - hw / 2, Y - hh / 2, 2, hh); g.fillRect(X + hw / 2 - 2, Y - hh / 2, 2, hh); g.fillRect(X - hw / 2, Y - 1, hw, 2);
        g.fillStyle = `rgba(255,178,62,${0.6 * lit + 0.1})`;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(Math.round(cx + dx * (rad + 2)), Math.round(cy + dy * (rad + 2)), 1, 1);
        break;
      }
      case 'pool': {
        g.fillStyle = '#1b1d2e'; g.fillRect(ix, iy, iw, ih);
        const px = ix + 3, py = iy + 3, pw = Math.min(iw - 6, 30), ph = Math.min(ih - 6, 16);
        g.fillStyle = '#0d3140'; g.fillRect(px, py, pw, ph);
        g.fillStyle = 'rgba(120,210,230,0.18)'; g.fillRect(px, py, pw, 1); g.fillRect(px, py, 1, ph);
        g.fillStyle = 'rgba(120,210,230,0.10)';
        for (let k = 0; k < 3; k++) g.fillRect(px + 3 + Math.floor(r() * (pw - 8)), py + 3 + Math.floor(r() * (ph - 5)), 4, 1);
        break;
      }
    }
  }
  g.imageSmoothingEnabled = false;
  g.globalAlpha = dark ? 0.45 : 0.8;
  for (const p of props) g.drawImage(scene.textures.get(p.key).getSourceImage() as CanvasImageSource, Math.round(p.x - 8), Math.round(p.y - 8));
  g.globalAlpha = 1;
}

/**
 * The low roofs' neon, in white: rooftop signs and strips along roof edges. The live layer tints it (the colours
 * drift) and pulses it with the music, drawn additively so it glows.
 */
function neon(g: CanvasRenderingContext2D, plan: CityPlan, dark: boolean, r: () => number, box: Box) {
  const a = dark ? 0.45 : 1;
  g.fillStyle = '#ffffff';
  g.font = `8px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const l of plan.lots) {
    if (isTall(l)) continue;
    const { x, y, w: rw, h: rh } = box(l);
    if (rw < 8 || rh < 8) continue;
    if (l.roof === 'sign') {
      const fits = SIGNS.filter((word) => g.measureText(word).width + 10 <= rw);
      if (fits.length) {
        const word = fits[Math.floor(r() * fits.length)], sx = Math.round(x + rw / 2), sy = Math.round(y + 6 + r() * Math.max(0, rh - 12));
        g.globalAlpha = 0.3 * a;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(word, sx + dx, sy + dy);
        g.globalAlpha = 0.9 * a;
        g.fillText(word, sx, sy);
      }
    }
    if (r() < 0.3) {
      g.globalAlpha = 0.7 * a;
      const len = Math.min(10 + r() * 24, Math.max(rw, rh) - 8);
      if (r() < 0.5) g.fillRect(x + 4, y + rh - 3, Math.min(len, rw - 8), 1); else g.fillRect(x + rw - 3, y + 4, 1, Math.min(len, rh - 8));
    }
  }
  g.globalAlpha = 1;
}

/** A searchlight's beam: a soft white cone, bright at its foot, tinted live. */
function bakeBeam(scene: Phaser.Scene) {
  const key = 'city-beam', L = 240, W = 64;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, L, W)!, g = tex.getContext();
  const fade = g.createLinearGradient(0, 0, L, 0);
  fade.addColorStop(0, 'rgba(255,255,255,0.9)');
  fade.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fade;
  g.beginPath(); g.moveTo(0, W / 2 - 1); g.lineTo(L, 0); g.lineTo(L, W); g.lineTo(0, W / 2 + 1); g.closePath(); g.fill();
  tex.refresh();
  return key;
}

/** One car's lights on a street: `at` is where it was at time 0, `v` plan px/s (negative runs the other way). */
interface Traffic { s: Street; at: number; v: number }

/** Where a layer's corner sits in the world, and the view's corner in that layer's pixels. */
export interface LayerSpot { ox: number; oy: number; u0: number; v0: number }

const hue = (h: number) => Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, 0.75, 1) as Phaser.Types.Display.ColorObject;

/**
 * What moves over the baked layers: traffic on the streets (pale headlights, dim red tail lights, keeping right),
 * tower beacons blinking red, searchlights sweeping round, and the neon's colour and pulse. Everything runs on the
 * clock alone, so it keeps no state of its own.
 */
export class CityLife {
  private readonly cars: Phaser.GameObjects.Graphics;
  private readonly tops: Phaser.GameObjects.Graphics;
  private readonly traffic: Traffic[] = [];
  private readonly beams: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, private readonly plan: CityPlan, private readonly dark: boolean) {
    this.cars = scene.add.graphics().setDepth(0.1);
    this.tops = scene.add.graphics().setDepth(0.5);
    const r = mulberry32(plan.w * 7 + plan.h);
    for (const s of plan.streets) {
      const len = s.vertical ? plan.h : plan.w, count = Math.floor(len / (dark ? 240 : 70));
      for (let k = 0; k < count; k++) this.traffic.push({ s, at: r() * len, v: (r() < 0.5 ? -1 : 1) * (22 + r() * 26) });
    }
    const beam = bakeBeam(scene);
    this.beams = plan.lights.map(() => scene.add.image(0, 0, beam).setOrigin(0, 0.5).setDepth(0.6).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4, 1));
  }

  /**
   * `pulse` is 0..1, the beat's punch (1 on the beat, falling away); `neon` is the neon layer's image, which gets its
   * colours and brightness here. `drift` slows the colours and the beams (reduced motion).
   */
  draw(time: number, ground: LayerSpot, tall: LayerSpot, neon: Phaser.GameObjects.Image | null, pulse: number, drift = 1) {
    const C = CITY, sg = CITY.depth.ground, st = CITY.depth.tall;
    const g = this.cars.clear().setPosition(ground.ox, ground.oy), { w, h } = this.plan;
    const u1 = ground.u0 + WIDTH + 8, v1 = ground.v0 + HEIGHT + 8;
    for (const c of this.traffic) {
      const len = c.s.vertical ? h : w, along = (((c.at + c.v * time) % len) + len) % len, dir = Math.sign(c.v);
      // Keep right: a car heading down the screen drives on its left (−x), one heading right drives below (+y).
      const lane = c.s.w > 10 ? 4 : 2;
      const x = Math.round((c.s.vertical ? c.s.c - dir * lane : along) * sg), y = Math.round((c.s.vertical ? along : c.s.c + dir * lane) * sg);
      if (x < ground.u0 - 4 || x > u1 || y < ground.v0 - 4 || y > v1) continue;
      const fx = c.s.vertical ? 0 : dir, fy = c.s.vertical ? dir : 0;
      // Body 4 long, 2 wide; lights at each end.
      g.fillStyle(0x14172a, 1).fillRect(c.s.vertical ? x - 1 : x - 2, c.s.vertical ? y - 2 : y - 1, c.s.vertical ? 2 : 4, c.s.vertical ? 4 : 2);
      g.fillStyle(0xfff2d0, this.dark ? 0.55 : 0.85);
      if (c.s.vertical) g.fillRect(x - 1, y + fy * 2 - (fy > 0 ? 1 : 0), 2, 1); else g.fillRect(x + fx * 2 - (fx > 0 ? 1 : 0), y - 1, 1, 2);
      g.fillStyle(0xff4050, 0.6);
      if (c.s.vertical) g.fillRect(x - 1, y - fy * 2 - (fy < 0 ? 1 : 0), 2, 1); else g.fillRect(x - fx * 2 - (fx < 0 ? 1 : 0), y - 1, 1, 2);
    }

    const t = this.tops.clear().setPosition(tall.ox, tall.oy);
    for (const b of this.plan.beacons) {
      const x = Math.round(b.x * st), y = Math.round(b.y * st);
      if (x < tall.u0 - 4 || x > tall.u0 + WIDTH + 8 || y < tall.v0 - 4 || y > tall.v0 + HEIGHT + 8) continue;
      if ((time * 0.8 + b.ph) % 1 > 0.18) continue;
      t.fillStyle(0xff3b4e, 0.25).fillRect(x - 2, y - 2, 5, 5);
      t.fillStyle(0xff8090, 1).fillRect(x, y, 1, 1);
    }

    // Searchlights: each sweeps to and fro from its street corner, its colour drifting round the wheel.
    const B = C.beams, slow = time * drift;
    this.plan.lights.forEach((p, i) => {
      const img = this.beams[i], x = ground.ox + p.x * sg, y = ground.oy + p.y * sg;
      const near = x > ground.ox + ground.u0 - 340 && x < ground.ox + ground.u0 + WIDTH + 340 && y > ground.oy + ground.v0 - 340 && y < ground.oy + ground.v0 + HEIGHT + 340;
      img.setVisible(near);
      if (!near) return;
      img.setPosition(x, y).setRotation(p.ph * Math.PI * 2 + Math.sin(slow * B.sweep + p.ph * 9) * B.swing);
      img.setTint(hue(slow / C.neon.cycle + p.ph).color).setAlpha(B.alpha * (this.dark ? 1.3 : 1) * (1 + B.pulse * pulse));
    });

    // Neon: a slow rainbow across the city, corner to corner, turning; brighter on the beat.
    if (neon) {
      const k = slow / C.neon.cycle;
      neon.setTint(hue(k).color, hue(k + 0.25).color, hue(k + 0.75).color, hue(k + 0.5).color);
      neon.setAlpha(Math.min(1, C.neon.alpha * (1 + C.neon.pulse * pulse)));
    }
  }
}
