import Phaser from 'phaser';
import { COLORS, HUD_SCALE, TEXT } from '../config';
import { Controls } from '../controls';
import { stopMusic } from '../music';
import { RACES, addHighScore, newCareer, type Career, type Verdict } from '../season';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { loadScores, saveScores } from '../store';
import { fitCamera } from '../view';
import { CAREER } from './RaceScene';
import { button, label } from './ui';

const W = 832, H = 456;

/** The end of a season: the crown or game over, the final score, and the high-score table with your entry marked. */
export class FinalScene extends Phaser.Scene {
  private controls!: Controls;
  private leaving = false;
  /** Dev: where this season's score landed in the table (-1: not in it). */
  rank = -1;

  constructor() {
    super('final');
  }

  create(data: { verdict?: Verdict }) {
    fitCamera(this, HUD_SCALE);
    this.leaving = false;
    this.controls = new Controls(this);
    registerSounds(this);
    restoreMute(this);
    const k = (this.registry.get(CAREER) as Career | undefined) ?? newCareer(), crown = data.verdict === 'crown';
    const { table, rank } = addHighScore(loadScores(), { score: k.score, races: k.race, crown });
    this.rank = rank;
    if (rank >= 0) saveScores(table);

    this.add.graphics().fillStyle(COLORS.night).fillRect(0, 0, W, H);
    if (crown) this.add.image(W / 2, 62, 'trophy').setScale(4);
    label(this, W / 2, crown ? 102 : 96, crown ? 'LEAGUE CROWN' : 'GAME OVER', crown ? TEXT.kerb : TEXT.hurt, 32).setOrigin(0.5, 0);
    label(this, W / 2, 146, `FINAL SCORE ${k.score.toLocaleString('en')}  ·  ${k.race} OF ${RACES} RACES`, TEXT.ink).setOrigin(0.5, 0);

    label(this, W / 2, 182, 'HIGH SCORES', TEXT.dim).setOrigin(0.5, 0);
    table.forEach((e, i) => {
      const y = 208 + i * 22, me = i === rank, color = me ? TEXT.kerb : TEXT.ink;
      label(this, 250, y, `${me ? '>' : ' '} ${i + 1}.`, color);
      label(this, 470, y, e.score.toLocaleString('en'), color).setOrigin(1, 0);
      label(this, 500, y, e.crown ? 'CROWN' : `RACE ${Math.min(e.races + 1, RACES)}`, me ? TEXT.kerb : TEXT.dim);
    });
    if (rank < 0) label(this, W / 2, 208 + table.length * 22 + 4, 'NOT IN THE TOP 8 THIS TIME', TEXT.dim).setOrigin(0.5, 0);
    button(this, W / 2, 396, 'TITLE', true, () => this.leave());
    stopMusic();
    playSound(this, crown ? 'finish' : 'lose');
    this.cameras.main.fadeIn(300);
  }

  update() {
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.confirm || input.back) this.leave();
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, 'select');
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('title'));
  }
}
