// Milestone 6 check: touch and mobile, on a phone-sized landscape screen with touch emulation. Start a season by
// tapping, steer a full lap with the stick, fire a dart and drop a mine, pause and resume (tap, P, and the page going
// to the background), the results board's buttons, the layout (side bars or corners), and the portrait overlay.
// Usage: node tools/m6-test.mjs <project-dir> <out-dir> [WIDTHxHEIGHT, default 844x390]
import { session } from './cdp.mjs';

const [project, out, size = '844x390'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const t = await session({ project, out, port: 5235, debugPort: 9405, width, height, touch: true, mobile: true });
const { send, evaluate, until, shot, tap, press, move, lift, check, sleep } = t;
const G = 'window.__proRacerZ';
const T = 'window.__proRacerZTouch';
const R = `${G}.scene.getScene('race')`;
const hud = () => evaluate(`${G}.registry.get('hud')`);
const snap = () => evaluate(`${R}.snapshot()`);
const rect = () => evaluate(`(() => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, k: r.width / 416 }; })()`);
/** A quick tap at design (game) pixels. */
const tapAt = async (x, y, fid = 9) => { const c = await rect(); await press(fid, c.left + x * c.k, c.top + y * c.k); await sleep(70); await lift(fid); };
const layout = () => evaluate(`${T}.layout()`);
const shown = () => evaluate(`[...document.body.children].filter((e) => e.textContent === 'FIRE' && e.style.display === 'flex').length === 1`);
const tag = `${width}x${height}`;

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await evaluate(`localStorage.clear()`);
await sleep(500);
await shot(`${tag}-1-title`);
const titleText = await evaluate(`${G}.scene.getScene('title').children.list.filter((o) => o.text).map((o) => o.text).join(' | ')`);
check('the title speaks touch: TAP START and a touch column', titleText.includes('TAP START') && titleText.includes('TOUCH') && !titleText.includes('KEYBOARD'), titleText.slice(0, 90));
check('no touch controls on the title', !(await shown()));

// ---- Start a season by tapping ----
await tapAt(208, 108);
await until(() => evaluate(`${G}.scene.isActive('pit')`), 5000);
await sleep(400);
await shot(`${tag}-2-pit`);
check('no touch controls on the pit board', !(await shown()));
await tapAt(238, 198);
await until(() => evaluate(`${G}.scene.isActive('race') && !!${G}.registry.get('hud')`), 5000);
await sleep(300);
check('tapping START on the title and the pit board starts race 1', (await hud()).race === 1);
check('the touch controls show on the grid', await shown());

// ---- Layout ----
const L = await layout(), c = await rect();
const circles = [['stick', L.stick], ['fire', L.fire], ['mine', L.mine]];
const inside = circles.every(([, q]) => q.x - q.r >= 0 && q.x + q.r <= width && q.y - q.r >= 0 && q.y + q.r <= height);
const apart = Math.hypot(L.fire.x - L.mine.x, L.fire.y - L.mine.y) > L.fire.r + L.mine.r && Math.hypot(L.stick.x - L.fire.x, L.stick.y - L.fire.y) > L.stick.r + L.fire.r;
check('the controls are on screen and don\'t overlap', inside && apart, circles.map(([n, q]) => `${n} ${q.x.toFixed(0)},${q.y.toFixed(0)} r${q.r.toFixed(0)}`).join('  '));
check('thumb-sized: stick reach ≥ 34 px, FIRE ≥ 22 px and MINE ≥ 16 px radius', L.stick.r >= 34 && L.fire.r >= 22 && L.mine.r >= 16, `${L.stick.r.toFixed(0)} / ${L.fire.r.toFixed(0)} / ${L.mine.r.toFixed(0)}`);
const gutter = Math.min(c.left, width - c.right);
if (gutter > 2 * 34 + 20) check('wide screen: the stick in the left bar, FIRE and MINE in the right', L.side && L.stick.x < c.left && L.fire.x > c.right && L.mine.x > c.right, `bars ${gutter.toFixed(0)} px`);
else check('narrow bars: the controls sit over the game\'s bottom corners', !L.side && L.stick.x > c.left && L.fire.x < c.right, `bars ${gutter.toFixed(0)} px`);
// The HUD's top-corner panels stay clear of the controls.
const k = c.k, stripBottom = c.top + (14 + 4 + 35) * k, mapLeft = c.left + (416 - 4 - 75) * k, mapBottom = c.top + (14 + 4 + 55) * k;
check('the controls stay clear of the strip and the minimap', L.stick.y - L.stick.r > stripBottom && (L.fire.x + L.fire.r < mapLeft || L.mine.y - L.mine.r > mapBottom), `stick top ${(L.stick.y - L.stick.r).toFixed(0)}, strip bottom ${stripBottom.toFixed(0)}`);

// ---- Steer a lap with the stick ----
await until(() => evaluate(`${R}.race.phase === 'race'`), 8000);
await evaluate(`${R}.race.solo()`);
const S = { x: L.stick.x, y: L.stick.y };
await press(1, S.x, S.y);
let k0 = 0, laps = 0, maxThrottle = 0;
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  const aim = await evaluate(`(() => { const r = ${R}.race, c = r.player, n = r.track.n, p = r.track.pts[(c.seg + 10) % n];
    let bend = 0; for (let i = 4; i <= 20; i++) bend = Math.max(bend, Math.abs(r.track.pts[(c.seg + i) % n].curv));
    return { a: Math.atan2(p.y - c.y, p.x - c.x), bend, laps: c.laps, throttle: 0 }; })()`);
  laps = aim.laps;
  if (laps >= 1) break;
  const reach = aim.bend > 0.45 ? 0.45 : 0.85;
  await move(1, S.x + Math.cos(aim.a) * L.stick.r * reach, S.y + Math.sin(aim.a) * L.stick.r * reach);
  if (k0++ === 30) await shot(`${tag}-3-steering`);
  await sleep(60);
}
const lapSecs = (Date.now() - t0) / 1000, h1 = await hud(), s1 = await snap();
check('the stick steers the car round a full lap', laps >= 1, `${laps} lap in ${lapSecs.toFixed(0)} s (lap time ${s1.lapTimes[0]?.toFixed(1)} s)`);
check('touch is the device in use: the hint and the board speak touch', h1.device === 'touch', h1.device);
await lift(1);
await sleep(300);
check('letting go of the stick leaves the throttle off', await evaluate(`${T}.read().throttle === 0 && ${T}.read().heading === null`));

// ---- Fire and mine ----
await evaluate(`${R}.race.charges = 6`);
const before = await snap();
await press(2, L.fire.x, L.fire.y); await sleep(80); await lift(2);
await until(async () => (await snap()).charges < before.charges, 2000).catch(() => {});
const afterFire = await snap();
check('FIRE fires a dart', afterFire.charges === before.charges - 1 && afterFire.darts >= 1, `charges ${before.charges} → ${afterFire.charges}, darts ${afterFire.darts}`);
await sleep(700); // shots and drops share a 0.6 s cooldown
await press(3, L.mine.x, L.mine.y); await sleep(80); await lift(3);
await until(async () => (await snap()).mines.length > 0, 2000).catch(() => {});
const afterMine = await snap();
check('MINE drops a mine', afterMine.mines.length >= 1 && afterMine.charges === afterFire.charges - 1, `mines ${afterMine.mines.length}, charges ${afterMine.charges}`);
// Steering and firing together: a second finger on FIRE while the stick is held.
await sleep(700);
await press(1, S.x, S.y); await move(1, S.x + L.stick.r * 0.8, S.y);
await press(2, L.fire.x, L.fire.y); await sleep(80); await lift(2);
await until(async () => (await snap()).charges < afterMine.charges, 2000).catch(() => {});
const both = await snap(), stickStill = await evaluate(`${T}.active`);
check('FIRE works while the other thumb holds the stick', both.charges === afterMine.charges - 1 && stickStill, `charges ${both.charges}, stick held ${stickStill}`);
await lift(1);

// ---- Pause and resume ----
await tapAt(383, 11);
await until(async () => (await hud()).paused, 2000).catch(() => {});
const p0 = await snap();
await sleep(1000);
const p1 = await snap();
check('tapping II pauses: the race clock stops and the controls hide', (await hud()).paused && p1.raceT === p0.raceT && !(await shown()), `raceT ${p0.raceT.toFixed(2)} → ${p1.raceT.toFixed(2)}`);
await shot(`${tag}-4-paused`);
await tapAt(163, 127.5);
await until(async () => !(await hud()).paused, 2000).catch(() => {});
await sleep(500);
check('tapping RESUME carries on', !(await hud()).paused && (await snap()).raceT > p1.raceT && (await shown()));
await tap('p');
await until(async () => (await hud()).paused, 2000).catch(() => {});
const kp = (await hud()).paused;
await tap('p');
await until(async () => !(await hud()).paused, 2000).catch(() => {});
check('P pauses and resumes too', kp && !(await hud()).paused);
await evaluate(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`);
await sleep(200);
check('the page going to the background pauses the race', (await hud()).paused);
await evaluate(`delete document.hidden`);
await tapAt(163, 127.5);
await until(async () => !(await hud()).paused, 2000).catch(() => {});

// ---- The results board on a phone ----
await evaluate(`(() => { const r = ${R}.race; r.finishOrder = []; r.cars.forEach((c, i) => { c.finished = true; c.finishT = 50 + i; r.finishOrder.push(c); }); r.phase = 'done'; r.phaseT = 0.01; })()`);
await until(async () => !!(await hud())?.results?.ready, 6000);
await sleep(300);
check('no touch controls on the results board', !(await shown()));
check('the results board\'s buttons are at least 36 px tall', 48 / 2 * c.k >= 36, `${(48 / 2 * c.k).toFixed(0)} px`);
await shot(`${tag}-5-results`);
// NEXT RACE: HUD (321, 311) is design (160.5, 155.5).
await tapAt(160.5, 155.5);
await until(() => evaluate(`${G}.scene.isActive('pit')`), 5000).catch(() => {});
check('tapping NEXT RACE goes on to the pit board', await evaluate(`${G}.scene.isActive('pit')`));
await sleep(400);
await tapAt(238, 198);
await until(() => evaluate(`${G}.scene.isActive('race') && ${G}.registry.get('hud')?.race === 2`), 5000).catch(() => {});
await sleep(300);
await tapAt(383, 11);
await until(async () => (await hud())?.paused, 2000).catch(() => {});
check('race 2: the controls are back and II still pauses', (await hud())?.race === 2 && (await hud())?.paused, `race ${(await hud())?.race}`);

// ---- Portrait ----
await send('Emulation.setDeviceMetricsOverride', { width: height, height: width, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
await sleep(500);
const rotate = await evaluate(`getComputedStyle(document.getElementById('rotate')).display`);
check('portrait: the turn-your-phone overlay covers the game', rotate === 'flex', rotate);
await shot(`${tag}-6-portrait`);

t.done();
