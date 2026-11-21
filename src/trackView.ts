import Phaser from 'phaser';
import { bakeTrack } from './bake';
import { CityLife, LAYERS, MARGIN, bakeLayer, cityPlan, layerKey, layerScale, type Layer, type LayerSpot } from './city';
import { HEIGHT, RENDER_SCALE, WIDTH } from './config';
import type { TrackDef } from './data/tracks';
import { reducedMotion } from './motion';
import { musicBeat } from './music';
import type { Track } from './track';

/** One canvas pixel, in game pixels: the camera and the city snap to it so the scroll doesn't shimmer. */
const SNAP = 1 / RENDER_SCALE;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
/** The city layers' depths in the scene: the streets, the traffic, the low roofs, their neon, the towers' beacons... */
const DEPTH: Record<Layer, number> = { ground: 0, low: 0.2, neon: 0.3, tall: 0.4 };

/**
 * A track on screen: the city far below in layers, each sliding at its own rate, and the raised ribbon over it. Owns
 * the scene's camera: `look` puts the view's top-left corner at a world point, clamped to the world.
 */
export class TrackView {
  /** The view's top-left corner, world pixels. */
  camX = 0;
  camY = 0;
  private readonly layers = new Map<Layer, Phaser.GameObjects.Image>();
  private readonly life: CityLife;
  private readonly calm = reducedMotion();

  constructor(private readonly scene: Phaser.Scene, readonly def: TrackDef, readonly track: Track, league = 0) {
    const dark = league === 2, rev = league === 1;
    const plan = cityPlan(def), keys = LAYERS.map((l) => layerKey(def, dark, l));
    const trackKey = bakeTrack(scene, def, track, dark, rev);
    // Only this track's textures stay: the title's demo goes through every track and league, and each set is big.
    for (const k of scene.textures.getTextureKeys()) {
      if (/^(city|track)-/.test(k) && k !== 'city-beam' && k !== trackKey && !keys.includes(k)) scene.textures.remove(k);
    }
    // A new city's layers are baked one a frame after the first, so the race shows at once (over the dark street
    // colour of the background) and the city comes in under the fade and the grid lights.
    const pending = LAYERS.filter((l) => !scene.textures.exists(layerKey(def, dark, l)));
    for (const l of LAYERS) {
      const img = scene.add.image(0, 0, '__WHITE').setOrigin(0).setDepth(DEPTH[l]).setVisible(false);
      if (l === 'neon') img.setBlendMode(Phaser.BlendModes.ADD);
      this.layers.set(l, img);
      if (!pending.includes(l)) img.setTexture(bakeLayer(scene, def, plan, dark, l)).setVisible(true);
    }
    const next = () => {
      const l = pending.shift();
      if (!l) return;
      this.layers.get(l)!.setTexture(bakeLayer(scene, def, plan, dark, l)).setVisible(true);
      scene.events.once(Phaser.Scenes.Events.RENDER, next);
    };
    scene.events.once(Phaser.Scenes.Events.RENDER, next);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.RENDER, next));
    this.life = new CityLife(scene, plan, dark);
    scene.add.image(0, 0, trackKey).setOrigin(0).setDepth(1);
    scene.cameras.main.setZoom(RENDER_SCALE);
  }

  look(x: number, y: number) {
    this.camX = snap(Phaser.Math.Clamp(x, 0, this.def.world.w - WIDTH));
    this.camY = snap(Phaser.Math.Clamp(y, 0, this.def.world.h - HEIGHT));
    this.scene.cameras.main.centerOn(this.camX + WIDTH / 2, this.camY + HEIGHT / 2);
    // Each layer is pinned to the view's centre and slides past at its depth's fraction of the track's speed, so the
    // nearer a layer is, the further its edges spread from the middle: the towers lean out over the streets.
    const cx = this.camX + WIDTH / 2, cy = this.camY + HEIGHT / 2;
    const spot = (l: Layer): LayerSpot => {
      const s = layerScale(l), ox = snap(cx - (cx + MARGIN) * s), oy = snap(cy - (cy + MARGIN) * s);
      this.layers.get(l)!.setPosition(ox, oy);
      return { ox, oy, u0: this.camX - ox, v0: this.camY - oy };
    };
    const spots = Object.fromEntries(LAYERS.map((l) => [l, spot(l)])) as Record<Layer, LayerSpot>;
    const neon = this.layers.get('neon')!;
    const time = this.scene.time.now / 1000;
    this.life.draw(time, spots.ground, spots.tall, neon.visible ? neon : null, this.calm ? 0 : musicBeat(), this.calm ? 0.25 : 1);
  }
}
