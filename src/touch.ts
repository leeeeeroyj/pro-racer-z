import { HEIGHT, HUD_H, WIDTH } from './config';

export type TouchButton = 'fire' | 'mine';

/** What the touch controls ask for this frame. */
export interface TouchInput {
  /** Way to go, radians (screen and world agree: y is down), or null when the stick is centred or let go. */
  heading: number | null;
  throttle: number;
  fire: boolean;
  drop: boolean;
}

/** Over the game, in design pixels: the stick's resting centre and reach, FIRE and MINE. Clear of the top-corner HUD. */
const OVERLAY = { stick: { x: 50, y: 178, r: 28 }, fire: { x: 380, y: 190, r: 17 }, mine: { x: 342, y: 206, r: 12 } };
/** A touch within this many radii of a button presses it. */
const GRAB = 1.3;
/** Gap (CSS px) between controls and screen edges. */
const MARGIN = 10;
/** Smallest stick radius (CSS px) the side bars must fit, or the controls go over the game's bottom corners instead. */
const MIN_SIDE = 34;
/** Stick travel, as a share of its reach: inside `dead` it only points; it reaches full throttle at `full`. */
const DEAD = 0.18, FULL = 0.6;
/** Left of this share of the screen, a touch that isn't on a button picks up the stick wherever it lands. */
const STICK_ZONE = 0.45;

type Circle = { x: number; y: number; r: number };
export type Layout = { side: boolean; stick: Circle; fire: Circle; mine: Circle };

/**
 * The touch controls, drawn as page elements: a stick under the left thumb that points the way to go (push further
 * for more throttle), FIRE and MINE under the right. They sit in the bars beside the game when those are wide enough,
 * otherwise over its bottom corners. The stick floats: a touch anywhere on the left picks it up there. Touches are
 * read from the whole page, because Phaser only hears touches that start on its canvas; the top bar is left to the HUD.
 */
class TouchControls {
  private stickId: number | null = null;
  private base = { x: 0, y: 0 };
  private knob = { x: 0, y: 0 };
  private readonly held = new Map<number, TouchButton>();
  private queued = { fire: false, drop: false };
  private els: { base: HTMLDivElement; knob: HTMLDivElement; fire: HTMLDivElement; mine: HTMLDivElement } | undefined;
  private shown = false;
  private touched = false;
  private readonly coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  constructor() {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.shown) return;
      this.touched = true;
      const L = this.layout(), b = this.hit(L, e.clientX, e.clientY);
      if (b) {
        this.held.set(e.pointerId, b);
        if (b === 'fire') this.queued.fire = true;
        else this.queued.drop = true;
        return;
      }
      const rect = this.rect();
      if (e.clientY < rect.top + HUD_H * (rect.width / WIDTH) || this.stickId !== null) return;
      const nearStick = Math.hypot(e.clientX - L.stick.x, e.clientY - L.stick.y) < L.stick.r * 1.6;
      if (!nearStick && e.clientX > window.innerWidth * STICK_ZONE) return;
      // The stick's base goes where the thumb lands, kept on screen.
      this.stickId = e.pointerId;
      const r = L.stick.r;
      this.base = { x: Math.max(r + MARGIN, Math.min(window.innerWidth - r - MARGIN, e.clientX)), y: Math.max(r + MARGIN, Math.min(window.innerHeight - r - MARGIN, e.clientY)) };
      this.knob = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.knob = { x: e.clientX, y: e.clientY };
    });
    const up = (e: PointerEvent) => {
      this.held.delete(e.pointerId);
      if (e.pointerId === this.stickId) this.stickId = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Shown during a race on touch screens (or once the screen has been touched); hidden on menus and while paused. */
  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    if (!on) { this.stickId = null; this.held.clear(); this.queued = { fire: false, drop: false }; }
    this.render();
  }

  get visible() {
    return this.shown && (this.coarse || this.touched);
  }

  /** The stick and the presses since the last call. */
  read(): TouchInput {
    const q = this.queued;
    this.queued = { fire: false, drop: false };
    const out: TouchInput = { heading: null, throttle: 0, fire: q.fire, drop: q.drop };
    if (this.stickId === null) return out;
    const r = this.layout().stick.r, dx = this.knob.x - this.base.x, dy = this.knob.y - this.base.y, d = Math.hypot(dx, dy) / r;
    if (d < DEAD) return out;
    out.heading = Math.atan2(dy, dx);
    out.throttle = Math.min(1, (d - DEAD) / (FULL - DEAD));
    return out;
  }

  /** Whether a finger is on the stick or a button: the touch device is in use. */
  get active() {
    return this.stickId !== null || this.held.size > 0;
  }

  /** Redraws the controls. Call once per frame. */
  render() {
    if (!this.visible) {
      if (this.els) for (const el of Object.values(this.els)) el.style.display = 'none';
      return;
    }
    const els = (this.els ??= this.build()), L = this.layout();
    const held = this.stickId !== null, base = held ? this.base : L.stick, r = L.stick.r;
    let kx = base.x, ky = base.y;
    if (held) {
      const dx = this.knob.x - base.x, dy = this.knob.y - base.y, d = Math.hypot(dx, dy), k = d > r ? r / d : 1;
      kx += dx * k; ky += dy * k;
    }
    const place = (el: HTMLDivElement, x: number, y: number, rad: number, alpha: number, edge: number) => Object.assign(el.style, {
      display: 'flex', left: `${x - rad}px`, top: `${y - rad}px`, width: `${rad * 2}px`, height: `${rad * 2}px`,
      background: `rgba(233, 239, 255, ${alpha})`, border: `2px solid rgba(233, 239, 255, ${edge})`,
    });
    place(els.base, base.x, base.y, r, held ? 0.1 : 0.06, held ? 0.5 : 0.3);
    place(els.knob, kx, ky, r * 0.42, held ? 0.45 : 0.2, held ? 0.9 : 0.5);
    const pressed = new Set(this.held.values());
    for (const b of ['fire', 'mine'] as const) {
      const c = L[b], on = pressed.has(b);
      place(els[b], c.x, c.y, c.r, on ? 0.45 : 0.12, on ? 0.9 : 0.5);
      els[b].style.fontSize = `${Math.max(10, c.r * 0.42)}px`;
    }
  }

  /** Where the controls rest, in CSS pixels (for tests and the layout). */
  layout(): Layout {
    const rect = this.rect(), k = rect.width / WIDTH;
    const gutter = Math.min(rect.left, window.innerWidth - rect.right);
    const sideR = Math.min(60, (gutter - MARGIN * 2) / 2);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    if (sideR >= MIN_SIDE) {
      // Wide screens: the stick in the left bar, FIRE and MINE in the right one.
      const fireR = sideR * 0.72, mineR = sideR * 0.52, rx = window.innerWidth - gutter / 2;
      const fireY = bottom - fireR - MARGIN * 2;
      return {
        side: true,
        stick: { x: gutter / 2, y: bottom - sideR - MARGIN * 2, r: sideR },
        fire: { x: rx, y: fireY, r: fireR },
        mine: { x: rx, y: fireY - fireR - mineR - MARGIN * 1.5, r: mineR },
      };
    }
    const at = (c: Circle) => ({ x: rect.left + c.x * k, y: rect.top + Math.min(c.y, HEIGHT) * k, r: c.r * k });
    return { side: false, stick: at(OVERLAY.stick), fire: at(OVERLAY.fire), mine: at(OVERLAY.mine) };
  }

  private rect() {
    return document.querySelector('#game canvas')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }

  private hit(L: Layout, x: number, y: number): TouchButton | null {
    let best: TouchButton | null = null, bestD = Infinity;
    for (const b of ['fire', 'mine'] as const) {
      const d = Math.hypot(x - L[b].x, y - L[b].y);
      if (d < L[b].r * GRAB && d < bestD) [best, bestD] = [b, d];
    }
    return best;
  }

  private build() {
    const make = (label: string) => {
      const el = document.createElement('div');
      el.textContent = label;
      Object.assign(el.style, {
        position: 'fixed', borderRadius: '50%', pointerEvents: 'none', zIndex: '5', boxSizing: 'border-box',
        alignItems: 'center', justifyContent: 'center', color: '#e9efff', fontFamily: 'Silkscreen, monospace',
      });
      document.body.append(el);
      return el;
    };
    return { base: make(''), knob: make(''), fire: make('FIRE'), mine: make('MINE') };
  }
}

export const touchControls = new TouchControls();
