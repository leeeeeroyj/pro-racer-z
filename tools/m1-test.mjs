// Milestone 1 check: title → race, the track's geometry, hover physics (top speed, turning, walls), laps and the finish.
// The live part races solo (rivals removed with the `solo` hook) from GO, so only the player's car is on the track.
// Usage: node tools/m1-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5221, debugPort: 9391 });
const { evaluate, until, shot, tap, down, up, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const snap = () => evaluate(`${R}.snapshot()`);

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(900);
await shot('1-title');
check('title scene runs', true);
const missing = await evaluate(`(async () => { const { SPRITES } = await import('/src/config.ts'); return SPRITES.filter((k) => !${G}.textures.exists(k)); })()`);
check('every sprite slot loaded', missing.length === 0, missing.join(', '));

// ---- Pure modules, straight from the dev server ----
const geo = await evaluate(`(async () => {
  const T = await import('/src/track.ts'), { TRACKS } = await import('/src/data/tracks.ts'), C = await import('/src/config.ts');
  return TRACKS.flatMap((def) => [false, true].map((rev) => {
    const tr = T.buildTrack(def.ctrl, rev), bad = [];
    for (let i = 0; i < tr.n; i++) for (const lat of [0, C.WALL, -C.WALL]) {
      const p = tr.pts[i], r = { x: p.x + p.nx * lat, y: p.y + p.ny * lat, seg: (i - 3 + tr.n) % tr.n, lat: 0, laps: 0 };
      T.locate(tr, r);
      if (r.seg !== i || Math.abs(r.lat - lat) > 0.01) bad.push(i + '@' + lat + '→' + r.seg);
    }
    const ribbonHalf = C.TRACK.halfWidth + C.TRACK.apron + 2;
    return { id: def.id + (rev ? ' rev' : ''), n: tr.n, length: Math.round(tr.length), bad: bad.slice(0, 5), badCount: bad.length,
      radius: T.minRadius(tr).radius, sep: T.minSeparation(tr).dist, ribbonHalf };
  }));
})()`);
for (const g of geo) {
  check(`${g.id}: every sample's nearest index round-trips (centre and both walls)`, g.badCount === 0, g.badCount ? `${g.badCount} bad: ${g.bad.join(' ')}` : `${g.n} samples, ${g.length} px`);
  check(`${g.id}: tightest bend radius beats the ribbon half-width`, g.radius > g.ribbonHalf, `${g.radius.toFixed(1)} > ${g.ribbonHalf}`);
  check(`${g.id}: no two sections overlap`, g.sep > g.ribbonHalf * 2 + 8, `${g.sep.toFixed(1)} > ${g.ribbonHalf * 2 + 8}`);
}

const phys = await evaluate(`(async () => {
  const T = await import('/src/track.ts'), Rc = await import('/src/race.ts'), C = await import('/src/config.ts');
  // A huge circle stands in for an endless straight: point steering follows the tangent.
  const ring = T.buildTrack(Array.from({ length: 32 }, (_, i) => [4000 + 3000 * Math.cos(i / 32 * Math.PI * 2), 4000 + 3000 * Math.sin(i / 32 * Math.PI * 2)]));
  const tops = C.MACHINES.map((m) => {
    const c = Rc.carAt(ring, 0.1);
    let reached = null;
    for (let k = 0; k < 360; k++) {
      Rc.drive(ring, c, { turn: 0, heading: ring.pts[c.seg].h, throttle: 1, brake: false }, m, 1 / 60);
      if (reached === null && Rc.speedOf(c) >= m.top * 0.95) reached = (k + 1) / 60;
    }
    return { name: m.name, top: m.top, speed: Rc.speedOf(c), reached };
  });
  // Walls: random starts, headings, speeds and steering on the real track, two seconds flat out each.
  const { TRACKS } = await import('/src/data/tracks.ts');
  const tr = T.buildTrack(TRACKS[0].ctrl);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let worst = 0, jumps = 0, hits = 0;
  for (let trial = 0; trial < 300; trial++) {
    const m = C.MACHINES[trial % 3], c = Rc.carAt(tr, rnd(), (rnd() * 2 - 1) * C.WALL);
    c.a += (rnd() * 2 - 1) * Math.PI;
    const v = 100 + rnd() * 400, d = rnd() * Math.PI * 2; c.vx = Math.cos(d) * v; c.vy = Math.sin(d) * v;
    const turn = Math.round(rnd() * 2 - 1);
    for (let k = 0; k < 120; k++) {
      const before = c.seg, r = Rc.drive(tr, c, { turn, heading: null, throttle: 1, brake: false }, m, 1 / 60);
      if (r.wall) hits++;
      worst = Math.max(worst, Math.abs(c.lat));
      if (Math.abs(T.segGap(tr, before, c.seg)) > 12) jumps++;
    }
  }
  return { tops, worst, wall: C.WALL, jumps, hits };
})()`);
for (const p of phys.tops) check(`${p.name} holds its top speed (±5 %)`, Math.abs(p.speed - p.top) <= p.top * 0.05, `${p.speed.toFixed(1)} of ${p.top}, 95 % after ${p.reached?.toFixed(2)} s`);
check('the wall holds at any speed (300 random runs)', phys.worst <= phys.wall + 1e-6 && phys.hits > 0, `worst |lat| ${phys.worst.toFixed(2)} ≤ ${phys.wall}, ${phys.hits} wall hits`);
check('the car never jumps to another part of the track', phys.jumps === 0, `${phys.jumps} jumps`);

// ---- The live game ----
/** The pit board comes before every race: wait for it, then Enter. */
const throughPit = async () => { await until(() => evaluate(`${G}.scene.isActive('pit')`)); await sleep(300); await tap('Enter'); };
await tap('Enter');
await throughPit();
await until(() => evaluate(`${G}.scene.isActive('race') && ${G}.scene.isActive('hud')`));
await sleep(600);
const s0 = await snap();
const hud0 = await evaluate(`${G}.registry.get('hud')`);
check('race starts on the grid behind the line, lap 1 of 2', s0.phase === 'grid' && s0.laps === -1 && s0.seg > s0.n * 0.9 && hud0.lap === 1 && hud0.laps === 2, `seg ${s0.seg}/${s0.n}, hud ${JSON.stringify(hud0)}`);
await shot('2-grid');
await evaluate(`(${R}.race.solo(), ${R}.race.go())`);

// Longest straight, from the track's own curvature.
const straight = await evaluate(`(async () => {
  const T = await import('/src/track.ts'), { TRACKS } = await import('/src/data/tracks.ts');
  const tr = T.buildTrack(TRACKS[0].ctrl);
  let best = { start: 0, len: 0 }, run = 0;
  for (let i = 0; i < tr.n * 2; i++) {
    if (Math.abs(tr.pts[i % tr.n].curv) < 0.1) { run++; if (run > best.len) best = { start: (i - run + 1) % tr.n, len: run }; } else run = 0;
  }
  let bend = 0; tr.pts.forEach((p, i) => { if (Math.abs(p.curv) > Math.abs(tr.pts[bend].curv)) bend = i; });
  return { frac: best.start / tr.n, len: best.len * 6, bend: (bend - 6) / tr.n, n: tr.n };
})()`);
await evaluate(`${R}.teleport(${straight.frac}, 0)`);
await down('ArrowUp');
let top = 0;
const t0 = Date.now();
while (Date.now() - t0 < 2200) { top = Math.max(top, (await snap()).speed); await sleep(50); }
await shot('3-straight');
await up('ArrowUp');
check('holding up reaches the Mk I top speed (±5 %)', Math.abs(top - s0.top) <= s0.top * 0.05, `${top.toFixed(1)} of ${s0.top} on a ${straight.len} px straight`);

// Turning on the spot.
await evaluate(`${R}.teleport(${straight.frac}, 0)`);
const a0 = (await snap()).a;
await down('ArrowLeft'); await sleep(500); await up('ArrowLeft');
const a1 = await snap();
await down('ArrowRight'); await sleep(500); await up('ArrowRight');
const a2 = await snap();
check('left turns left on the spot', a1.a - a0 < -0.3 && a1.speed < 2, `${(a1.a - a0).toFixed(2)} rad, speed ${a1.speed.toFixed(1)}`);
check('right turns right on the spot', a2.a - a1.a > 0.3 && a2.speed < 2, `${(a2.a - a1.a).toFixed(2)} rad`);

// Turning at speed.
await evaluate(`${R}.teleport(${straight.frac}, 0)`);
await down('ArrowUp'); await sleep(700);
const b0 = await snap();
await down('ArrowRight'); await sleep(250); await up('ArrowRight');
const b1 = await snap();
await up('ArrowUp');
check('steering works at speed', b1.a - b0.a > 0.3 && b0.speed > 80, `${(b1.a - b0.a).toFixed(2)} rad at ${b0.speed.toFixed(0)} px/s`);

// Straight into the wall, both sides.
for (const [side, turn] of [['right', Math.PI / 2], ['left', -Math.PI / 2]]) {
  await evaluate(`${R}.teleport(${straight.frac + 0.02}, 0, ${turn})`);
  await down('ArrowUp');
  let worst = 0;
  const w0 = Date.now();
  while (Date.now() - w0 < 1300) { worst = Math.max(worst, Math.abs((await snap()).lat)); await sleep(30); }
  await up('ArrowUp');
  const played = await evaluate(`${R}.played`);
  check(`the ${side} wall stops the car`, worst <= 31 + 1e-6 && played.includes('bump'), `worst |lat| ${worst.toFixed(2)}, sounds ${played.slice(-3).join(',')}`);
}

// In a bend, for the screenshot.
await evaluate(`${R}.teleport(${straight.bend}, -8)`);
await down('ArrowUp'); await sleep(450); await up('ArrowUp');
await sleep(150);
await shot('4-bend');

// Laps: the first crossing starts lap 1, the next is the final lap, the third finishes.
const cross = async () => {
  const before = (await snap()).laps;
  await evaluate(`${R}.teleport(0.985, 0)`);
  await down('ArrowUp');
  await until(async () => (await snap()).laps === before + 1, 6000, 30);
  await up('ArrowUp');
  return snap();
};
const l0 = await cross();
check('crossing the line from the grid starts lap 1', l0.laps === 0 && l0.lapTimes.length === 0);
const l1 = await cross();
const hud1 = await evaluate(`${G}.registry.get('hud')`);
check('the next crossing counts a lap and shows FINAL LAP', l1.laps === 1 && l1.lapTimes.length === 1 && hud1.lap === 2 && hud1.banner?.text === 'FINAL LAP', `${JSON.stringify(hud1)}`);
await sleep(200);
await shot('5-final-lap');
const l2 = await cross();
const hud2 = await evaluate(`${G}.registry.get('hud')`);
check('the last crossing finishes the race in 1st', l2.finished && l2.laps === 2 && hud2.banner?.text.startsWith('1ST'), hud2.banner?.text);
await sleep(300);
await shot('6-finish');
const played = await evaluate(`${R}.played`);
check('lap sounds played', ['finalLap', 'place'].every((s) => played.includes(s)), played.join(','));
await until(() => evaluate(`!!${G}.registry.get('hud')?.results`), 6000);
check('the finish brings up the results board', true);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('hud')`), 9000);
check('Esc on the results board returns to the title', true);

// Esc leaves a race; M toggles sound.
await tap('Enter');
await throughPit();
await until(() => evaluate(`${G}.scene.isActive('race')`));
await sleep(400);
const m0 = await evaluate(`${G}.registry.get('muted')`);
await tap('m');
await sleep(100);
const m1 = await evaluate(`${G}.registry.get('muted')`);
await tap('m');
check('M toggles sound', m0 !== m1);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('hud')`));
check('Esc returns to the title', true);

t.done();
