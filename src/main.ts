import Phaser from 'phaser';
import { HEIGHT, RENDER_SCALE, WIDTH } from './config';
import { FinalScene } from './scenes/FinalScene';
import { HudScene } from './scenes/HudScene';
import { PitScene } from './scenes/PitScene';
import { RaceScene } from './scenes/RaceScene';
import { TitleScene } from './scenes/TitleScene';
import { touchControls } from './touch';

async function start() {
  // Phaser bakes text into textures when it's created, so the pixel font must be ready first.
  await Promise.race([document.fonts.load('8px Silkscreen'), new Promise((resolve) => setTimeout(resolve, 2000))]).catch(() => {});

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH * RENDER_SCALE,
    height: HEIGHT * RENDER_SCALE,
    backgroundColor: '#04050b',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true, activePointers: 2 },
    scene: [TitleScene, PitScene, RaceScene, HudScene, FinalScene],
  });
  // Dev-only handle for poking at the running game from the console or a test script.
  if (import.meta.env.DEV) Object.assign(window, { __proRacerZ: game, __proRacerZTouch: touchControls });
}

void start();
