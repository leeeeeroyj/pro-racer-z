// Milestone 2 check: four-car races (seeded autopilot races finish, standings follow real progress), grid lights,
// darts, mines, slicks, coolant, charge limits, car contact, the results board and the next race.
// Usage: node tools/m2-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5223, debugPort: 9393 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const snap = () => evaluate(`${R}.snapshot()`);
const hud = () => evaluate(`${G}.registry.get('hud')`);
const MODS = `const put = (r, c, x, y) => { let b = 0, bd = Infinity; r.track.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; b = i; } }); Object.assign(c, { x, y, seg: b }); }; const Rc = await import('/src/race.ts'), C = await import('/src/config.ts'), T = await import('/src/track.ts'), { TRACKS } = await import('/src/data/tracks.ts');`;

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
const demoProgress = () => evaluate(`(() => { const s = ${G}.scene.getScene('title'); return s.race.cars.map((c) => c.laps * s.race.track.n + c.seg); })()`);
await sleep(800);
const demo0 = await demoProgress();
await sleep(1000);
const demo1 = await demoProgress();
check('the title runs an attract race', demo1.every((p, i) => p - demo0[i] > 10), `${demo0.join(' ')} → ${demo1.join(' ')}`);
await shot('1-title');

// ---- Pure races ----
const races = await evaluate(`(async () => { ${MODS}
  const out = [];
  for (let seed = 1; seed <= 6; seed++) {
    const r = new Rc.Race(TRACKS[0], { seed, machine: C.MACHINES[0], autopilot: true }), n = r.track.n;
    // Independent progress: the test's own nearest sample, searched over the whole track, and its own lap count.
    const near = (c) => { let b = 0, bd = Infinity; r.track.pts.forEach((p, i) => { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
    const mine = new Map(r.cars.map((c) => [c, { seg: near(c), laps: -1 }]));
    const prog = new Map();
    let bad = 0, samples = 0, minC = 99, maxC = -1, steps = 0;
    while (r.phase !== 'results' && steps < 60 * 200) {
      r.step(1 / 60);
      steps++;
      // Wait for everyone: the game itself brings the board up 3.2 s after you finish.
      if (r.phase === 'done') r.phaseT = 1e9;
      for (const c of r.cars) {
        const m = mine.get(c), s = near(c);
        if (m.seg > n * 0.8 && s < n * 0.2) m.laps++; else if (m.seg < n * 0.2 && s > n * 0.8) m.laps--;
        m.seg = s;
        prog.set(c, m.laps * n + s);
      }
      minC = Math.min(minC, r.charges); maxC = Math.max(maxC, r.charges);
      if (steps % 60 === 0 && r.phase === 'race') {
        const order = r.standings().filter((c) => !c.finished);
        for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
          samples++;
          if (prog.get(order[j]) - prog.get(order[i]) > 1) bad++;
        }
      }
    }
    out.push({ seed, t: +r.raceT.toFixed(1), all: r.cars.every((c) => c.finished), times: r.cars.map((c) => c.kind[0] + (c.finishT ?? 0).toFixed(1)).join(' '),
      place: r.results.indexOf(r.player) + 1, bad, samples, minC, maxC, score: r.score });
  }
  return out;
})()`);
for (const r of races) check(`seed ${r.seed}: an autopilot race finishes with all four pilots inside 90 s`, r.all && r.t < 90, `${r.t} s, ${r.times}, you ${r.place}`);
const bad = races.reduce((a, r) => a + r.bad, 0), samples = races.reduce((a, r) => a + r.samples, 0);
check('standings match real progress at sampled moments', bad === 0, `${bad} of ${samples} pairs out of order`);
check('charges stay between 0 and 9 in autopilot races', races.every((r) => r.minC >= 0 && r.maxC <= 9), races.map((r) => `${r.minC}-${r.maxC}`).join(' '));

const kit = await evaluate(`(async () => { ${MODS}
  const def = TRACKS[0], f = 0.4, res = {};
  const fresh = (charges = 4) => { const r = new Rc.Race(def, { seed: 9, machine: C.MACHINES[0], charges }); r.go(); r.frozen = true; return r; };
  const run = (r, secs, input = Rc.NO_INPUT, until = () => false) => { for (let k = 0; k < secs * 60; k++) { r.step(1 / 60, input); if (until()) return (k + 1) / 60; } return null; };

  // Dart: a rival 60 px ahead, in line.
  let r = fresh(), [you, halo] = r.cars;
  r.cars.slice(2).forEach((c, i) => r.place(c, f - 0.2 - i * 0.02, 0));
  r.place(you, f, 0); r.place(halo, f + 10 / r.track.n, 0);
  r.fire(you);
  res.dartHit = run(r, 2, Rc.NO_INPUT, () => halo.spin > 0);
  res.dartScore = r.score; res.dartCharges = r.charges;
  // Dart at a rival off to one side and a little ahead still homes in.
  r = fresh(); [you, halo] = r.cars;
  r.cars.slice(2).forEach((c, i) => r.place(c, f - 0.2 - i * 0.02, 0));
  r.place(you, f, -12); r.place(halo, f + 14 / r.track.n, 10);
  r.fire(you);
  res.dartHome = run(r, 2, Rc.NO_INPUT, () => halo.spin > 0);

  // Mine: harmless for its first half second, then spins the next car through.
  r = fresh(); [you, halo] = r.cars;
  r.cars.slice(2).forEach((c, i) => r.place(c, f - 0.2 - i * 0.02, 0));
  r.place(you, f, 0); r.place(halo, f + 0.1, 0);
  r.drop(you);
  const m = r.mines[0];
  run(r, 0.2); put(r, halo, m.x, m.y); run(r, 1 / 60);
  res.mineEarly = { spin: halo.spin, mines: r.mines.length, arm: +m.arm.toFixed(2) };
  r.place(halo, f + 0.1, 0);
  res.mineArmedAt = run(r, 1, Rc.NO_INPUT, () => m.arm <= 0) + 0.2;
  put(r, halo, m.x, m.y);
  res.mineHit = run(r, 0.5, Rc.NO_INPUT, () => halo.spin > 0);
  res.mineGone = r.mines.length;

  // Slick: drive across one.
  r = fresh(); you = r.player; r.solo();
  const slick = r.hazards.find((h) => h.kind === 'slick');
  r.place(you, slick.seg / r.track.n - 5 / r.track.n, slick.lat);
  res.slick = run(r, 2, { drive: { turn: 0, heading: null, throttle: 1, brake: false }, fire: false, drop: false }, () => you.spin > 0);

  // Coolant: touching it wets the hull; wet, the top speed is the configured fraction.
  r = fresh(); you = r.player; r.solo();
  const pool = r.hazards.find((h) => h.kind === 'coolant');
  put(r, you, pool.x, pool.y); run(r, 1 / 60);
  res.wet = you.wet;
  const ring = T.buildTrack(Array.from({ length: 32 }, (_, i) => [4000 + 3000 * Math.cos(i / 32 * Math.PI * 2), 4000 + 3000 * Math.sin(i / 32 * Math.PI * 2)]));
  const c = Rc.carAt(ring, 0.1), mk = C.MACHINES[0];
  for (let k = 0; k < 360; k++) { c.wet = 1; Rc.drive(ring, c, { turn: 0, heading: ring.pts[c.seg].h, throttle: 1, brake: false }, mk, 1 / 60); }
  res.wetTop = Rc.speedOf(c) / mk.top; res.factor = C.HAZARD.coolant.factor;

  // Charges: never below 0 or above 9.
  r = fresh(0); you = r.player;
  const ev = []; const okFire = r.fire(you); ev.push(...r.takeEvents().map((e) => e.type));
  res.empty = { okFire, charges: r.charges, ev };
  r = fresh(8); you = r.player; r.solo();
  const cell = r.pickups[0];
  put(r, you, cell.x, cell.y); run(r, 1 / 60);
  res.cap = r.charges;
  let lo = 99, hi = -1;
  for (let k = 0; k < 600; k++) { r.fire(you); r.drop(you); you.cool = 0; lo = Math.min(lo, r.charges); hi = Math.max(hi, r.charges); r.step(1 / 60); }
  res.spam = { lo, hi };

  // Contact: two cars on top of each other end up apart.
  r = fresh(); [you, halo] = r.cars;
  r.place(you, f, 0); r.place(halo, f, 3);
  run(r, 1 / 60);
  res.contact = Math.hypot(you.x - halo.x, you.y - halo.y);
  return res;
})()`);
check('a dart hits a rival ahead within 1.6 s and spins it', kit.dartHit !== null && kit.dartHit < 1.6, `${kit.dartHit?.toFixed(2)} s, +${kit.dartScore}, charges ${kit.dartCharges}`);
check('a hit scores 200 and the dart costs a charge', kit.dartScore === 200 && kit.dartCharges === 3);
check('a dart homes on a rival off to one side', kit.dartHome !== null && kit.dartHome < 1.6, `${kit.dartHome?.toFixed(2)} s`);
check('a mine is harmless before it arms', kit.mineEarly.spin === 0 && kit.mineEarly.mines === 1, JSON.stringify(kit.mineEarly));
check('a mine arms after 0.5 s', Math.abs(kit.mineArmedAt - 0.5) < 0.03, `${kit.mineArmedAt.toFixed(3)} s`);
check('an armed mine spins the next car through, then it is gone', kit.mineHit !== null && kit.mineGone === 0, `${kit.mineHit?.toFixed(2)} s`);
check('a slick spins a car crossing it', kit.slick !== null, `${kit.slick?.toFixed(2)} s`);
check('coolant wets the hull', kit.wet > 0);
check('wet, top speed drops to the coolant factor (±5 %)', Math.abs(kit.wetTop - kit.factor) < kit.factor * 0.05, `${kit.wetTop.toFixed(3)} vs ${kit.factor}`);
check('firing with no charges does nothing but click', !kit.empty.okFire && kit.empty.charges === 0 && kit.empty.ev.join() === 'empty', JSON.stringify(kit.empty));
check('a charge cell at 8 charges stops at 9', kit.cap === 9);
check('spamming darts and mines never takes charges below 0', kit.spam.lo === 0 && kit.spam.hi <= 9, JSON.stringify(kit.spam));
check('overlapping cars are pushed apart', kit.contact >= 10.9, kit.contact.toFixed(2));

// ---- The live game ----
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('race') && !!${G}.registry.get('hud')`));
const g0 = await snap();
const h0 = await hud();
check('the race opens on the grid with four cars, lights out', g0.phase === 'grid' && g0.cars.length === 4 && h0.lights === 0 && h0.of === 4, `lights ${h0.lights}`);
const lit = new Set();
let g1 = null;
await until(async () => {
  const h = await hud(), s = await snap();
  if (h.lights !== null) lit.add(h.lights);
  if (s.phase === 'grid') g1 = s;
  return s.phase === 'race';
}, 6000, 40);
const moved = g0.cars.map((c, i) => Math.hypot(c.x - g1.cars[i].x, c.y - g1.cars[i].y));
check('three lights come on, one at a time, before GO', [0, 1, 2, 3].every((k) => lit.has(k)), [...lit].join(','));
check('nobody moves before GO', moved.every((d) => d < 1), moved.map((d) => d.toFixed(1)).join(' '));
const p1 = await evaluate(`${R}.played`);
check('light and GO sounds', p1.filter((s) => s === 'light').length === 3 && p1.includes('go'), p1.join(','));
await sleep(150);
await shot('2-go');

// Dart and mine by key, against a frozen rival.
await evaluate(`(() => { const r = ${R}.race; r.frozen = true; r.place(r.cars[2], 0.2, 0); r.place(r.cars[3], 0.21, 0); })()`);
await evaluate(`${R}.teleport(0.4, 0)`);
await evaluate(`(() => { const r = ${R}.race; r.place(r.cars[1], 0.4 + 12 / r.track.n, 0); })()`);
const c0 = (await snap()).charges;
await tap('z', 40);
await sleep(120);
await shot('3-dart');
await until(async () => (await snap()).cars[1].spin > 0, 2000, 20);
const d1 = await snap();
check('Z fires a dart that spins the rival ahead', d1.cars[1].spin > 0 && d1.charges === c0 - 1, `charges ${c0} → ${d1.charges}`);
await sleep(700);
await tap('x', 40);
await sleep(100);
const m0 = await snap();
check('X drops a mine behind you, not yet armed', m0.mines.length === 1 && m0.mines[0].arm > 0.2 && m0.charges === c0 - 2, JSON.stringify(m0.mines));
await sleep(650);
const m1 = await snap();
check('the mine is armed after half a second', m1.mines[0]?.arm <= 0, JSON.stringify(m1.mines));
await shot('4-mine');
const p2 = await evaluate(`${R}.played`);
check('dart, hit and mine sounds', ['dart', 'hit', 'mine'].every((s) => p2.includes(s)), p2.slice(-6).join(','));

// The rest of the race on autopilot, to the results board.
await evaluate(`(() => { const r = ${R}.race; r.frozen = false; r.autopilot = true; })()`);
await sleep(9000);
await shot('5-pack');
const mid = await hud();
check('the HUD shows place of 4, lap, charges and score', mid.of === 4 && mid.place >= 1 && mid.place <= 4 && mid.lap >= 1 && mid.charges >= 0 && mid.score >= 200, JSON.stringify({ place: mid.place, lap: mid.lap, charges: mid.charges, score: mid.score }));
await until(async () => !!(await hud()).results, 120000, 250);
const res = (await hud()).results;
await sleep(1200);
await shot('6-results');
const you = res.rows.find((r) => r.you);
check('the results board lists all four pilots in order', res.rows.length === 4 && new Set(res.rows.map((r) => r.name)).size === 4 && res.rows.every((r, i) => r.place === i + 1), res.rows.map((r) => `${r.place} ${r.name} ${r.time}`).join(' | '));
const placePts = [5000, 3000, 1500, 0][you.place - 1];
check('your place points are in the race score', res.points >= placePts + 200, `place ${you.place}, race +${res.points}, total ${res.total}`);
const before = await snap();
await tap('Enter');
await until(async () => { try { return (await snap()).phase === 'grid'; } catch { return false; } }, 5000);
const nx = await snap();
const h2 = await hud();
check('Enter starts the next race, keeping score and charges', h2.score === res.total && nx.charges === before.charges, `score ${h2.score}, charges ${nx.charges}`);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('hud')`));
check('Esc returns to the title', true);

t.done();
