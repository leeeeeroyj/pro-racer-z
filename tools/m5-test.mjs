// Milestone 5 check: HUD and feedback. Every sound voice is heard, the minimap and the speed / upgrade / heat strip
// follow the race, effects fire on their events, reduced motion drops shake and flashes and thins sparks, and the
// frame time with four cars and a storm cloud on screen.
// Usage: node tools/m5-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5229, debugPort: 9399 });
const { send, evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const snap = () => evaluate(`${R}.snapshot()`);
const hud = () => evaluate(`${G}.registry.get('hud')`);
const setCareer = (js) => evaluate(`(async () => { const S = await import('/src/season.ts'); ${G}.registry.set('career', { ...S.newCareer(), ${js} }); })()`);
const raceUp = () => until(() => evaluate(`${G}.scene.isActive('race') && !!${R}.race && !!${G}.registry.get('hud')`), 8000);
const goNow = () => evaluate(`(() => { const r = ${R}.race; if (r.phase === 'grid') r.go(); })()`);
/** Pushes a race event as if the race had raised it. */
const emit = (js) => evaluate(`(() => { const r = ${R}.race, you = r.player, rival = r.cars.find((c) => c !== you); r.emit(${js}); })()`);

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await evaluate(`localStorage.clear()`);
// The spy: every sound the game asks the sound manager for.
await evaluate(`(() => { const sm = ${G}.sound, play = sm.play.bind(sm); window.__heard = []; sm.play = (key, cfg) => { window.__heard.push(key.replace(/^sfx-/, '')); return play(key, cfg); }; })()`);

// ---- Every voice, through the menus and the race's events ----
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('pit')`));
await sleep(300);
await tap('Enter');
await raceUp();
await until(() => evaluate(`${R}.race.phase === 'race'`), 8000);
const events = [
  `{ type: 'lap', time: 20 }`, `{ type: 'finalLap' }`, `{ type: 'record', time: 19.5 }`,
  `{ type: 'wall', car: you, speed: 120, x: you.x, y: you.y }`, `{ type: 'bump', a: you, b: rival, speed: 60, x: you.x, y: you.y }`,
  `{ type: 'fire', car: you }`, `{ type: 'drop', car: you }`, `{ type: 'empty' }`,
  `{ type: 'spin', car: rival, by: you, x: rival.x, y: rival.y }`, `{ type: 'pickup', kind: 'cell', x: you.x, y: you.y }`,
  `{ type: 'coolant', car: you }`, `{ type: 'shield', car: you }`, `{ type: 'boost', car: you }`,
  `{ type: 'upgrade', kind: 'core', level: 1 }`, `{ type: 'letter', idx: 0 }`, `{ type: 'glitch', lost: 2 }`,
  `{ type: 'gateWarn', gate: {} }`, `{ type: 'heat', heat: 5 }`,
];
for (const e of events) { await emit(e); await sleep(60); }
await evaluate(`(() => { const r = ${R}.race; r.charges = 5; })()`);
await tap('x');
await until(() => evaluate(`window.__heard.includes('arm')`), 3000).catch(() => {});
await emit(`{ type: 'record', time: 18.25 }`);
await sleep(100);
const recHud = await hud(), recBanner = recHud.banner?.text ?? '', recSub = recHud.banner?.sub ?? '';
check('beating a lap record shows a banner with the time and the points', recBanner === 'LAP RECORD' && recSub.includes('0:18.3') && recSub.includes('+1,000'), `${recBanner} / ${recSub}`);
await emit(`{ type: 'spin', car: you, by: null, x: you.x, y: you.y }`);
await emit(`{ type: 'overdrive', mk: 1, retry: false }`);
await emit(`{ type: 'finish', car: you, place: 1, points: 5000 }`);
await sleep(100);
await emit(`{ type: 'finish', car: you, place: 4, points: 0 }`);
await sleep(100);
// The lights and GO: a fresh grid.
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`));
await setCareer(`race: 23`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
await until(() => evaluate(`${R}.race.phase === 'race'`), 8000);
// The crown: finish and select on the final screen.
await evaluate(`(() => { const r = ${R}.race; r.finishOrder = []; r.cars.forEach((c, i) => { c.finished = true; c.finishT = 50 + i; r.finishOrder.push(c); }); r.phase = 'done'; r.phaseT = 0.01; })()`);
await until(() => evaluate(`!!${G}.registry.get('hud')?.results?.ready`), 6000);
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('final')`));
await sleep(400);
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('title')`));
const heard = new Set(await evaluate(`window.__heard`));
const voices = await evaluate(`(async () => Object.keys((await import('/src/sfx.ts')).SOUNDS))()`);
const missing = voices.filter((v) => !heard.has(v));
check(`the spy hears every one of the ${voices.length} voices`, missing.length === 0, missing.length ? `missing: ${missing.join(' ')}` : [...heard].join(' '));

// ---- The minimap and the strip ----
await setCareer(`race: 17, heat: 3, up: { thruster: 2, core: 0, grip: 1 }`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
const g0 = await hud();
check('on the grid the minimap shows the track and all four cars', g0.map.id === 'coolant-bay/2' && g0.map.pts.length > 100 && g0.dots.length === 4 && g0.dots.filter((d) => d.you).length === 1, `${g0.map.id}, ${g0.map.pts.length / 2} points, ${g0.dots.length} cars`);
check('rivals go on the minimap by initial', g0.dots.filter((d) => !d.you).map((d) => d.initial).sort().join('') === 'DHV', g0.dots.map((d) => d.initial || '>').join(''));
check('the minimap carries the Blackout gates', g0.gates.length === 2, `${g0.gates.length} gates`);
check('the strip shows the upgrades and Dynamo\'s heat carried in', g0.up.thruster === 2 && g0.up.core === 0 && g0.up.grip === 1 && g0.heat === 3, JSON.stringify({ up: g0.up, heat: g0.heat }));
await goNow();
await evaluate(`${R}.race.autopilot = true`);
await sleep(3000);
const g1 = await hud(), s1 = await snap();
check('the speed bar follows your speed', Math.abs(g1.speed - s1.speed) < 25 && g1.top === s1.top && g1.speed > 0, `${g1.speed.toFixed(0)} of ${g1.top}`);
const gauges = await evaluate(`${G}.scene.getScene('hud').gauges.visible`);
check('the minimap and strip show during the race', gauges);
const youDot = g1.dots.find((d) => d.you);
check('your minimap arrow is where your car is', Math.hypot(youDot.x - s1.x, youDot.y - s1.y) < 12, `${youDot.x.toFixed(0)},${youDot.y.toFixed(0)} vs ${s1.x.toFixed(0)},${s1.y.toFixed(0)}`);
const gates = [];
for (let i = 0; i < 40 && new Set(gates).size < 3; i++) { gates.push(...(await hud()).gates.map((g) => g.state)); await sleep(150); }
check('minimap gates go through off, warning and on', new Set(gates).size === 3, [...new Set(gates)].join(' '));

// ---- Effects, and reduced motion (everyone held still, so only the events below make effects) ----
await evaluate(`(() => { const r = ${R}.race; r.autopilot = false; r.frozen = true; })()`);
await sleep(1500);
const fx = () => evaluate(`${R}.snapshot().fx`);
const f0 = await fx();
await emit(`{ type: 'spin', car: you, by: null, x: you.x, y: you.y }`);
await until(async () => (await fx()).rings > f0.rings, 3000).catch(() => {});
const f1 = await fx(), flash1 = (await hud()).flash;
check('your spin: a ring, sparks, a shake and a flash', f1.rings === f0.rings + 1 && f1.sparks === f0.sparks + 8 && f1.shakes === f0.shakes + 1 && f1.flashes === f0.flashes + 1 && flash1 > 0,
  `rings +${f1.rings - f0.rings}, sparks +${f1.sparks - f0.sparks}, shakes +${f1.shakes - f0.shakes}, flashes +${f1.flashes - f0.flashes}, flash ${flash1.toFixed(2)}`);
await sleep(400);
check('the flash fades out', (await hud()).flash === 0);
await emit(`{ type: 'wall', car: you, speed: 150, x: you.x, y: you.y }`);
await emit(`{ type: 'pickup', kind: 'cell', x: you.x, y: you.y }`);
await sleep(30);
await shot('1-mid-burst');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const rm = await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
const f2 = await fx();
await emit(`{ type: 'spin', car: you, by: null, x: you.x, y: you.y }`);
await emit(`{ type: 'overdrive', mk: 1, retry: false }`);
await until(async () => (await fx()).rings >= f2.rings + 3, 3000).catch(() => {});
const f3 = await fx(), flash3 = (await hud()).flash;
check('reduced motion: no shake or flash, half the sparks, the rings stay', rm && f3.shakes === f2.shakes && f3.flashes === f2.flashes && flash3 === 0 && f3.sparks - f2.sparks === 4 + 8 && f3.rings - f2.rings === 3,
  `shakes +${f3.shakes - f2.shakes}, flashes +${f3.flashes - f2.flashes}, sparks +${f3.sparks - f2.sparks}, rings +${f3.rings - f2.rings}`);
await send('Emulation.setEmulatedMedia', { features: [] });
await sleep(300);
await shot('2-overdrive-reduced');

// ---- Mid-burst readability ----
await emit(`{ type: 'overdrive', mk: 1, retry: false }`);
await sleep(120);
await shot('3-overdrive-burst');

// ---- Frame time: four cars, rain and a storm cloud on screen ----
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`));
await setCareer(`race: 8`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
await goNow();
// Hold all four cars on the grid with the cloud over them.
await evaluate(`(() => { const r = ${R}.race, cl = r.clouds[0]; r.frozen = true; window.__holdCloud = setInterval(() => { cl.f = (r.player.seg + 4) / r.track.n; }, 20); })()`);
await sleep(800);
const frames = await evaluate(`new Promise((done) => { const ts = []; const tick = (t) => { ts.push(t); if (ts.length < 91) requestAnimationFrame(tick); else done(ts.slice(1).map((v, i) => v - ts[i])); }; requestAnimationFrame(tick); })`);
// Phaser calls the scene's update through a saved reference, so time it between the pre- and post-update events.
const scene = await evaluate(`new Promise((done) => { const ev = ${R}.events, ms = []; let t0 = 0; const pre = () => { t0 = performance.now(); }, post = () => ms.push(performance.now() - t0);
  ev.on('preupdate', pre); ev.on('postupdate', post); setTimeout(() => { ev.off('preupdate', pre); ev.off('postupdate', post); done(ms); }, 3000); })`);
const onScreen = await evaluate(`(() => { const r = ${R}.race, cam = ${R}.cameras.main.worldView; const inView = (o) => o.x > cam.x && o.x < cam.right && o.y > cam.y && o.y < cam.bottom; return { cars: r.cars.filter(inView).length, cloud: r.clouds.some(inView) }; })()`);
await evaluate(`clearInterval(window.__holdCloud)`);
// The same on Neon with nothing extra on screen, for comparison: headless Chrome renders in software.
const base = async () => {
  await tap('Escape');
  await until(() => evaluate(`${G}.scene.isActive('title')`));
  await setCareer(`race: 0`);
  await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
  await raceUp();
  await goNow();
  await evaluate(`${R}.race.frozen = true`);
  await sleep(800);
  return evaluate(`new Promise((done) => { const ts = []; const tick = (t) => { ts.push(t); if (ts.length < 91) requestAnimationFrame(tick); else done(ts.slice(1).map((v, i) => v - ts[i])); }; requestAnimationFrame(tick); })`);
};
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
await shot('4-storm-cloud');
const plain = await base();
console.log(`      frame interval ms, storm: median ${q(frames, 0.5).toFixed(1)}, p95 ${q(frames, 0.95).toFixed(1)}; plain Neon: median ${q(plain, 0.5).toFixed(1)}, p95 ${q(plain, 0.95).toFixed(1)}; race scene update ms: median ${q(scene, 0.5).toFixed(2)}, p95 ${q(scene, 0.95).toFixed(2)}; on screen ${JSON.stringify(onScreen)}`);
check('four cars and the storm cloud on screen, and the race scene updates in under 4 ms (p95)', onScreen.cars === 4 && onScreen.cloud && q(scene, 0.95) < 4, `p95 ${q(scene, 0.95).toFixed(2)} ms`);
check('the storm costs at most a third more frame time than a plain Neon grid (headless)', q(frames, 0.5) <= q(plain, 0.5) * 1.34, `${q(frames, 0.5).toFixed(1)} vs ${q(plain, 0.5).toFixed(1)} ms`);

t.done();
