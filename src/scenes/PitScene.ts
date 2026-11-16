import Phaser from 'phaser';
import { COLORS, HUD_SCALE, HEAT, LEAGUES, MACHINES, TEXT, UPGRADE, WORD, spriteAngle } from '../config';
import { Controls } from '../controls';
import { TRACKS } from '../data/tracks';
import { RACES, leagueOf, newCareer, trackOf, type Career, type Verdict } from '../season';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { loadLap } from '../store';
import { fitCamera } from '../view';
import { CAREER, fmtTime } from './RaceScene';
import { boxes, button, label } from './ui';

const W = 832, H = 456;
const LEAGUE_NOTES = [
  'COOLANT SPILLS, SLICKS AND BOOST PADS',
  'EVERY TRACK IN REVERSE  ·  STORM CLOUDS AND MORE SLICKS',
  'THE LIGHTS GO DOWN  ·  LASER GATES, DRONES AND GLITCH SKULLS',
];
const HINTS = { kbm: 'ENTER START  ·  ESC TITLE', pad: 'A START  ·  BACK TITLE', touch: 'TAP START' } as const;

/** Before every race: what's next (race, league, track, laps, lap record) and what you carry into it. */
export class PitScene extends Phaser.Scene {
  private controls!: Controls;
  private hint!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('pit');
  }

  create(data: { verdict?: Verdict }) {
    fitCamera(this, HUD_SCALE);
    this.leaving = false;
    this.controls = new Controls(this);
    registerSounds(this);
    restoreMute(this);
    if (!this.registry.has(CAREER)) this.registry.set(CAREER, newCareer());
    const k = this.registry.get(CAREER) as Career;
    const lg = leagueOf(k.race), def = TRACKS[trackOf(k.race)], laps = def.laps[lg], best = loadLap(def.id, lg);
    const g = this.add.graphics();
    g.fillStyle(COLORS.night).fillRect(0, 0, W, H);
    g.fillStyle(COLORS.panel).fillRect(0, 0, W, 44);
    g.fillStyle(COLORS.line).fillRect(0, 44, W, 2);

    const newLeague = trackOf(k.race) === 0 && k.race > 0;
    label(this, 16, 14, `RACE ${k.race + 1} OF ${RACES}`, TEXT.ink);
    label(this, W - 16, 14, `${LEAGUES[lg].name} LEAGUE${newLeague ? '  ·  NEW' : ''}`, newLeague ? TEXT.amber : TEXT.ink).setOrigin(1, 0);
    if (data.verdict === 'retry') label(this, W / 2, 62, `RETRY  ·  THE RACE RUNS AGAIN  ·  ${k.retries} LEFT AFTER THIS`, TEXT.hurt).setOrigin(0.5, 0);
    label(this, W / 2, 86, def.name, TEXT.kerb, 32).setOrigin(0.5, 0);
    label(this, W / 2, 128, `${laps} LAPS${LEAGUES[lg].reverse ? '  ·  REVERSED' : ''}  ·  ${best === null ? 'NO LAP RECORD YET' : `LAP RECORD ${fmtTime(best)}`}`, TEXT.ink).setOrigin(0.5, 0);
    label(this, W / 2, 152, LEAGUE_NOTES[lg], TEXT.dim).setOrigin(0.5, 0);

    // Left: your machine and its upgrades.
    const m = MACHINES[k.mk];
    this.add.image(170, 236, m.slot).setScale(4).setRotation(spriteAngle(m.slot, -Math.PI / 2));
    label(this, 170, 280, m.name, TEXT.ink).setOrigin(0.5, 0);
    (['thruster', 'core', 'grip'] as const).forEach((u, i) => {
      const y = 316 + i * 26;
      label(this, 60, y, u.toUpperCase());
      boxes(g, 210, y + 1, UPGRADE.max, k.up[u]);
    });

    // Right: the career.
    const row = (y: number, name: string, value: string) => {
      label(this, 400, y, name);
      label(this, 790, y, value, TEXT.ink).setOrigin(1, 0);
    };
    row(196, 'SCORE', k.score.toLocaleString('en'));
    row(222, 'CHARGES', `${k.charges}`);
    row(248, 'RETRIES', `${k.retries}`);
    label(this, 400, 274, 'DYNAMO HEAT');
    boxes(g, 790 - HEAT.max * 18 + 4, 275, HEAT.max, k.heat, 14, 4, COLORS.ink);
    label(this, 400, 300, 'OVERDRIVE');
    [...WORD].forEach((ch, i) => {
      const x = 562 + i * 26, got = k.letters[i];
      if (got) g.fillStyle(COLORS.kerb).fillRect(x, 298, 22, 22);
      else g.lineStyle(2, COLORS.line).strokeRect(x + 1, 299, 20, 20);
      label(this, x + 11, 309, ch, got ? '#1b0614' : TEXT.dim).setOrigin(0.5);
    });

    button(this, W / 2 + 60, 372, 'START', true, () => this.go('race'));
    button(this, W / 2 + 270, 372, 'TITLE', false, () => this.go('title'), 130);
    this.hint = label(this, W / 2 + 165, 428, '').setOrigin(0.5, 0);
    this.cameras.main.fadeIn(200);
  }

  update() {
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.confirm) this.go('race');
    else if (input.back) this.go('title');
    this.hint.setText(HINTS[input.device]);
  }

  private go(to: 'race' | 'title') {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, to === 'race' ? 'start' : 'select');
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(to));
  }
}
