import Phaser from 'phaser';
import { bakeCity, bakeTrack } from './bake';
import { HEIGHT, RENDER_SCALE, TRACK, WIDTH } from './config';
import type { TrackDef } from './data/tracks';
import { buildTrack, type Track } from './track';

/** One canvas pixel, in game pixels: the camera and the city snap to it so the scroll doesn't shimmer. */
const SNAP = 1 / RENDER_SCALE;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/**
 * A track on screen: the city far below, scrolling at the parallax rate, and the raised ribbon over it. Owns the
 * scene's camera: `look` puts the view's top-left corner at a world point, clamped to the world.
 */
export class TrackView {
  readonly track: Track;
  /** The view's top-left corner, world pixels. */
  camX = 0;
  camY = 0;
  private readonly city: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene, readonly def: TrackDef, dark = false) {
    this.track = buildTrack(def.ctrl);
    this.city = scene.add.image(0, 0, bakeCity(scene, def, dark)).setOrigin(0).setDepth(0);
    scene.add.image(0, 0, bakeTrack(scene, def, this.track, dark)).setOrigin(0).setDepth(1);
    scene.cameras.main.setZoom(RENDER_SCALE);
  }

  look(x: number, y: number) {
    this.camX = snap(Phaser.Math.Clamp(x, 0, this.def.world.w - WIDTH));
    this.camY = snap(Phaser.Math.Clamp(y, 0, this.def.world.h - HEIGHT));
    this.scene.cameras.main.centerOn(this.camX + WIDTH / 2, this.camY + HEIGHT / 2);
    // The city pixel at the view's left edge is camX × parallax (+4 margin), so it slides by less than the track.
    this.city.setPosition(snap(this.camX * (1 - TRACK.parallax) - 4), snap(this.camY * (1 - TRACK.parallax) - 4));
  }
}
