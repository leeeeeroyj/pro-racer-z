import Phaser from 'phaser';
import type { Control, PlayerInput } from './race';

export type Device = 'kbm' | 'pad' | 'touch';

export interface ControlState extends PlayerInput {
  /** Edges: true only on the frame they're pressed. */
  confirm: boolean;
  back: boolean;
  mute: boolean;
  device: Device;
}

/** Stick deflection that counts as pointing somewhere. */
const STICK = 0.5;
// Standard gamepad mapping (Xbox layout).
const BTN = { A: 0, B: 1, X: 2, Y: 3, LT: 6, RT: 7, BACK: 8, START: 9 } as const;
const EDGE = [BTN.A, BTN.X, BTN.Y, BTN.BACK, BTN.START];

type KeyName = 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'W' | 'A' | 'S' | 'D';
type Press = 'fire' | 'drop' | 'confirm' | 'back' | 'mute';
/** One-shot actions by key. Space both fires (in a race) and confirms (on menus and the results board). */
const PRESSES: Record<string, Press[]> = {
  Z: ['fire'], SPACE: ['fire', 'confirm'], X: ['drop'], SHIFT: ['drop'], ENTER: ['confirm'], ESC: ['back'], M: ['mute'],
};

/**
 * One input layer. Keyboard: left/right (or A/D) turn the car, up (W) goes, down (S) brakes and reverses, Z or Space
 * fires a dart, X or Shift drops a mine; Enter or Space confirms, Esc goes back, M toggles sound. Controller: the
 * D-pad turns; the left stick points the way to go and the car turns toward it; A or RT goes, B or LT brakes, X fires,
 * Y drops; A or Start confirms, Back goes back. The last device used decides the hints. Construct one per scene.
 */
export class Controls {
  device: Device = window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'kbm';
  private prevButtons = new Set<number>();
  private readonly keys: Record<KeyName, Phaser.Input.Keyboard.Key>;
  private readonly pressed = new Set<Press>();

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,W,A,S,D') as Controls['keys'];
    // Presses come from key events, not JustDown: a tap that goes down and up between two frames never shows up in
    // JustDown in Phaser 4, and on a slow frame that loses a dart.
    for (const [key, presses] of Object.entries(PRESSES)) {
      const on = (e: KeyboardEvent) => { if (!e.repeat) presses.forEach((p) => this.pressed.add(p)); };
      kb.on(`keydown-${key}`, on);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off(`keydown-${key}`, on));
    }
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.device = p.wasTouch ? 'touch' : 'kbm'; });
  }

  /** The first connected controller, if the browser has seen one (it needs a button press first). */
  pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const pad = this.scene.input.gamepad?.pad1;
    return pad && pad.connected ? pad : undefined;
  }

  read(): ControlState {
    const k = this.keys, p = this.pressed;
    let confirm = p.has('confirm'), fire = p.has('fire'), drop = p.has('drop'), back = p.has('back');
    const mute = p.has('mute');
    p.clear();
    const left = k.LEFT.isDown || k.A.isDown, right = k.RIGHT.isDown || k.D.isDown;
    const gas = k.UP.isDown || k.W.isDown, brake = k.DOWN.isDown || k.S.isDown;
    const drive: Control = { turn: (right ? 1 : 0) - (left ? 1 : 0), heading: null, throttle: gas ? 1 : 0, brake };
    if (confirm || back || mute || fire || drop || left || right || gas || brake) this.device = 'kbm';

    const pad = this.pad();
    const down = new Set(pad ? EDGE.filter((i) => pad.buttons[i]?.pressed) : []);
    const edges = new Set([...down].filter((i) => !this.prevButtons.has(i)));
    this.prevButtons = down;
    if (pad) {
      const value = (i: number) => pad.buttons[i]?.value ?? 0;
      const sx = pad.leftStick.x, sy = pad.leftStick.y;
      const padTurn = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
      const pointing = Math.hypot(sx, sy) > STICK;
      const padGas = Math.max(pad.buttons[BTN.A]?.pressed ? 1 : 0, value(BTN.RT));
      const padBrake = !!pad.buttons[BTN.B]?.pressed || value(BTN.LT) > 0.3;
      if (padTurn || pointing || padGas || padBrake || down.size) this.device = 'pad';
      if (!drive.turn && padTurn) drive.turn = padTurn;
      if (!drive.turn && pointing) drive.heading = Math.atan2(sy, sx);
      drive.throttle = Math.max(drive.throttle, padGas);
      drive.brake ||= padBrake;
      confirm ||= edges.has(BTN.A) || edges.has(BTN.START);
      back ||= edges.has(BTN.BACK);
      fire ||= edges.has(BTN.X);
      drop ||= edges.has(BTN.Y);
    }
    return { drive, fire, drop, confirm, back, mute, device: this.device };
  }
}
