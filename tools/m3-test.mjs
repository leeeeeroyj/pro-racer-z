// Milestone 3 check: the full roster. Rival personalities and Dynamo's heat, shields, upgrades, letters and OVERDRIVE,
// boost pads, storm clouds, laser gates, drones, glitch skulls, hazards by league, the career between races, and a
// screenshot of each new thing on the track.
// Usage: node tools/m3-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5225, debugPort: 9395 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const snap = () => evaluate(`${R}.snapshot()`);
const hud = () => evaluate(`${G}.registry.get('hud')`);
const MODS = `const put = (r, c, x, y) => { let b = 0, bd = Infinity; r.track.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; b = i; } }); Object.assign(c, { x, y, seg: b, lat: 0 }); }; const Rc = await import('/src/race.ts'), C = await import('/src/config.ts'), T = await import('/src/track.ts'), S = await import('/src/season.ts'), { TRACKS } = await import('/src/data/tracks.ts');`;

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));

// Longest straight, where a car can drive in a line.
const straight = await evaluate(`(async () => { ${MODS}
  const tr = T.buildTrack(TRACKS[0].ctrl);
  let best = { start: 0, len: 0 }, run = 0;
  for (let i = 0; i < tr.n * 2; i++) {
    if (Math.abs(tr.pts[i % tr.n].curv) < 0.1) { run++; if (run > best.len) best = { start: (i - run + 1) % tr.n, len: run }; } else run = 0;
  }
  return { frac: best.start / tr.n, len: best.len };
})()`);

// ---- Leagues ----
const leagues = await evaluate(`(async () => { ${MODS}
  const def = TRACKS[0], base = T.buildTrack(def.ctrl);
  return [0, 1, 2].map((league) => {
    const r = new Rc.Race(def, { seed: 1, league }), k = (kind) => r.hazards.filter((h) => h.kind === kind).length;
    return { slick: k('slick'), coolant: k('coolant'), boost: k('boost'), glitch: k('glitch'), clouds: r.clouds.length, gates: r.gates.length, drones: r.drones.length,
      start: Math.hypot(r.track.pts[0].x - base.pts[0].x, r.track.pts[0].y - base.pts[0].y), turned: Math.abs(T.angDiff(r.track.pts[0].h, base.pts[0].h)) };
  });
})()`);
const [neon, storm, blackout] = leagues;
check('Neon: coolant, slicks and boost pads only', neon.coolant === 3 && neon.slick === 2 && neon.boost === 3 && neon.clouds + neon.gates + neon.drones + neon.glitch === 0, JSON.stringify(neon));
check('Storm: reversed from the same start line, with clouds and more slicks', storm.start < 1 && storm.turned > 2.5 && storm.clouds === 2 && storm.slick === 4 && storm.gates + storm.drones + storm.glitch === 0, JSON.stringify(storm));
check('Blackout: adds gates, drones and glitch skulls', blackout.turned < 0.01 && blackout.gates === 2 && blackout.drones === 2 && blackout.glitch === 2 && blackout.clouds === 2, JSON.stringify(blackout));

// ---- Pure kit: one thing at a time on an empty track ----
const kit = await evaluate(`(async () => { ${MODS}
  const def = TRACKS[0], f = ${straight.frac} + 0.004, res = {};
  const fresh = (o = {}) => { const r = new Rc.Race(def, { seed: 9, ...o }); r.go(); r.frozen = true; r.clear(); return r; };
  const go = (r) => ({ drive: { turn: 0, heading: r.track.pts[r.player.seg].h, throttle: 1, brake: false }, fire: false, drop: false });
  const run = (r, secs, input = () => Rc.NO_INPUT, until = () => false) => { for (let k = 0; k < secs * 60; k++) { r.step(1 / 60, input(r)); if (until()) return (k + 1) / 60; } return null; };
  const types = (r) => r.takeEvents().map((e) => e.type);
  const on = (r, thing) => { put(r, r.player, thing.x, thing.y); run(r, 1 / 60); };

  // Shield: picked up, it soaks exactly one spin.
  let r = fresh(), you = r.player; r.solo();
  on(r, r.spawnPickup('shield', f));
  res.shieldOn = you.shield;
  types(r);
  const first = r.spinOut(you, null, 1), second = r.spinOut(you, null, 1);
  res.shield = { first, second, shieldAfter: you.shield, events: types(r) };

  // Upgrades: three levels each, then MAX; each one changes the stats.
  r = fresh(); you = r.player; r.solo();
  const base = { ...r.statsOf(you) };
  for (const k of ['thruster', 'core', 'grip']) for (let i = 0; i < 5; i++) on(r, r.spawnPickup(k, f));
  res.up = { ...r.up, base, now: r.statsOf(you), m: C.MACHINES[0], U: C.UPGRADE };
  // Thrusters, driven: half a second from a standstill on the straight.
  const accelRun = (up) => { const q = fresh({ up }); q.solo(); q.place(q.player, f - 0.03, 0); run(q, 0.5, go); return Rc.speedOf(q.player); };
  res.accel = { plain: accelRun({}), boosted: accelRun({ thruster: 3 }) };

  // Letters: a race lays out the ones you still need, in order, up to three.
  const lettersOf = (got) => new Rc.Race(def, { seed: 1, letters: got }).pickups.filter((p) => p.kind === 'letter').map((p) => p.idx).join('');
  const L = (n) => Array.from({ length: 9 }, (_, i) => i < n);
  res.layout = { none: lettersOf(L(0)), three: lettersOf(L(3)), eight: lettersOf(L(8)), all: lettersOf(L(9)) };

  // OVERDRIVE in the Mk I: the Mk II with fresh upgrades.
  r = fresh({ letters: L(8), up: { thruster: 2, core: 1, grip: 3 } }); you = r.player; r.solo();
  on(r, r.spawnPickup('letter', f, 0, 8));
  res.od1 = { mk: r.mk, slot: you.slot, up: r.up, letters: r.letters.filter(Boolean).length, score: r.score, top: r.statsOf(you).top, events: types(r) };
  // In the Mk III: big points and a retry, no machine past it.
  r = fresh({ mk: 2, letters: L(8) }); you = r.player; r.solo();
  on(r, r.spawnPickup('letter', f, 0, 8));
  res.od3 = { mk: r.mk, slot: you.slot, retries: r.retriesWon, score: r.score };

  // Dynamo's heat: 1.3x top speed after five hits by you, not before; a hit by anyone else doesn't count.
  r = new Rc.Race(def, { seed: 9 }); r.go();
  const [, halo, , dyn] = r.cars, dynTop = () => r.statsOf(dyn).top, top0 = dynTop(), ratios = [];
  for (let i = 0; i < 6; i++) { halo.spin = 0; r.spinOut(halo, r.player, 0.1); ratios.push(+(dynTop() / top0).toFixed(3)); }
  halo.spin = 0; r.spinOut(halo, null, 0.1);
  res.heat = { ratios, heat: r.heat, events: types(r).filter((e) => e === 'heat').length, next: S.heatForNextRace(r.heat) };
  const cooled = new Rc.Race(def, { seed: 9, heat: S.heatForNextRace(5) });
  res.heat.cooled = +(cooled.statsOf(cooled.cars[3]).top / new Rc.Race(def, { seed: 9 }).statsOf(cooled.cars[3]).top).toFixed(3);

  // Boost pad: past top speed for a moment, then back down.
  r = fresh(); you = r.player; r.solo();
  r.place(you, f - 0.02, 0);
  run(r, 1.5, go);
  const pad = r.spawn('boost', (you.seg + 10) / r.track.n, you.lat);
  let peak = 0;
  run(r, 1.2, go, () => { peak = Math.max(peak, Rc.speedOf(you)); return false; });
  const boostEv = types(r).filter((e) => e === 'boost').length;
  run(r, 3, go);
  res.boost = { peak, after: Rc.speedOf(you), top: r.statsOf(you).top, events: boostEv, padSeg: pad.seg };

  // Storm cloud: drifts round the track; under it the top speed and grip drop.
  r = fresh();
  const cl = r.spawn('cloud', f), f0 = cl.f, cl2 = r.spawn('cloud', f + 0.5);
  put(r, r.player, cl.x, cl.y);
  res.cloud = { env: r.envAt(r.player), dry: r.envAt({ x: cl.x + 200, y: cl.y }) };
  run(r, 10);
  res.cloud.drift = cl.f - f0; res.cloud.speeds = [cl.speed, cl2.speed];
  const ring = T.buildTrack(Array.from({ length: 32 }, (_, i) => [4000 + 3000 * Math.cos(i / 32 * Math.PI * 2), 4000 + 3000 * Math.sin(i / 32 * Math.PI * 2)]));
  const car = Rc.carAt(ring, 0.1), mk = C.MACHINES[0], rain = { top: C.HAZARD.cloud.top, grip: C.HAZARD.cloud.grip };
  for (let k = 0; k < 360; k++) Rc.drive(ring, car, { turn: 0, heading: ring.pts[car.seg].h, throttle: 1, brake: false }, mk, 1 / 60, rain);
  res.cloud.rainTop = Rc.speedOf(car) / mk.top;

  // Glitch skull: eats two charges from you, rests, and never takes you below zero; rivals pass through.
  r = fresh({ charges: 5 }); you = r.player;
  const sk = r.spawn('glitch', f);
  on(r, sk);
  const g1 = r.charges;
  run(r, 1);
  const g2 = r.charges;
  run(r, 1);
  const g3 = r.charges;
  run(r, 2);
  const g4 = r.charges;
  r.place(you, f - 0.05, 0); r.charges = 4; r.frozen = false;
  put(r, r.cars[1], sk.x, sk.y); run(r, 1 / 60);
  res.glitch = { g1, g2, g3, g4, rival: r.charges };

  // Laser gate: off, warning, beam; it spins a car in its line only while the beam is on.
  r = fresh(); you = r.player; r.solo();
  const gate = r.spawn('gate', f);
  r.place(you, f, 0);
  const st = [], spinsAt = [];
  let was = 0;
  for (let k = 0; k < 60 * 10; k++) {
    r.step(1 / 60);
    const s = Rc.gateState(gate);
    if (st.length === 0 || st[st.length - 1].s !== s) st.push({ s, t: +(k / 60).toFixed(3) });
    if (you.spin > 0 && was <= 0) spinsAt.push(s);
    was = you.spin;
  }
  const warnOn = st.filter((x, i) => x.s === 'on' && st[i - 1]?.s === 'warn').map((x) => x.t - st[st.indexOf(x) - 1].t);
  res.gate = { seq: st.map((x) => x.s).join(','), warnOn, spinsAt };
  // A car driving into a live beam (held on here) stops almost dead.
  r = fresh(); you = r.player; r.solo();
  const gate2 = r.spawn('gate', f), live = C.HAZARD.gate.off + C.HAZARD.gate.warn + 0.1;
  r.place(you, f - 0.05, 0);
  let hitV = null, inV = 0;
  run(r, 3, (q) => { gate2.t = live; inV = Rc.speedOf(you); return go(q); }, () => { if (you.spin > 0 && hitV === null) hitV = Rc.speedOf(you); return hitV !== null; });
  res.gate.hitV = hitV; res.gate.inV = inV;

  // Drone: sweeps the track's width, and spins a car it passes over.
  r = fresh(); you = r.player; r.solo();
  const dr = r.spawn('drone', f);
  r.place(you, f, 0);
  let lo = 99, hi = -99;
  const droneHit = run(r, 6, () => Rc.NO_INPUT, () => { lo = Math.min(lo, dr.lat); hi = Math.max(hi, dr.lat); return you.spin > 0; });
  run(r, 6, () => Rc.NO_INPUT, () => { lo = Math.min(lo, dr.lat); hi = Math.max(hi, dr.lat); return false; });
  res.drone = { lo, hi, hit: droneHit, edge: C.TRACK.halfWidth - C.HAZARD.drone.edge };

  // Vex blocks: close behind him, he moves across in front of you. Further back, he doesn't.
  const block = (behind) => {
    const q = new Rc.Race(def, { seed: 9 }); q.go(); q.clear();
    const vex = q.cars[2];
    q.cars = [q.player, vex];
    q.place(vex, f, -12); q.place(q.player, f - behind / q.track.n, 12);
    const vRun = (k) => { for (let i = 0; i < k; i++) q.step(1 / 60, { drive: { turn: 0, heading: q.track.pts[q.player.seg].h - (q.player.lat - 12) * 0.02, throttle: 1, brake: false }, fire: false, drop: false }); };
    vRun(90);
    return { vexLat: +vex.lat.toFixed(1), youLat: +q.player.lat.toFixed(1), gap: q.progressGap(q.player, vex) };
  };
  res.vex = { close: block(5), far: block(40) };
  return res;
})()`);

check('a shield pickup puts a shield on you', kit.shieldOn);
check('the shield soaks exactly one spin, then is gone', !kit.shield.first && kit.shield.second && !kit.shield.shieldAfter && kit.shield.events.join(',') === 'shield,spin', JSON.stringify(kit.shield));
const u = kit.up;
check('upgrades stop at 3 each', u.thruster === 3 && u.core === 3 && u.grip === 3, `${u.thruster} ${u.core} ${u.grip}`);
check('thrusters raise acceleration, cores top speed, grip turning and grip', Math.abs(u.now.accel - u.m.accel * (1 + 3 * u.U.accel)) < 1e-9 && u.now.top === u.m.top + 3 * u.U.top
  && Math.abs(u.now.turn - (u.m.turn + 3 * u.U.turn)) < 1e-9 && Math.abs(u.now.grip - (u.m.grip + 3 * u.U.grip)) < 1e-9, JSON.stringify(u.now));
check('three thrusters pull away faster from a standstill', kit.accel.boosted > kit.accel.plain * 1.2, `${kit.accel.plain.toFixed(0)} → ${kit.accel.boosted.toFixed(0)} px/s after 0.5 s`);
check('a race lays out the next three letters you need', kit.layout.none === '012' && kit.layout.three === '345' && kit.layout.eight === '8' && kit.layout.all === '', JSON.stringify(kit.layout));
check('OVERDRIVE in the Mk I: the Mk II, its sprite and stats, upgrades reset', kit.od1.mk === 1 && kit.od1.slot === 'player_mk2' && kit.od1.letters === 0
  && Object.values(kit.od1.up).every((v) => v === 0) && kit.od1.top === 170 && kit.od1.events.includes('overdrive'), JSON.stringify(kit.od1));
check('OVERDRIVE scores the letter and 25,000', kit.od1.score === 250 + 25000, String(kit.od1.score));
check('OVERDRIVE in the Mk III: 50,000 and a retry, same machine', kit.od3.mk === 2 && kit.od3.slot === 'player_mk3' && kit.od3.retries === 1 && kit.od3.score === 250 + 50000, JSON.stringify(kit.od3));
const h = kit.heat;
check("Dynamo's top speed is 1.3x after five hits and not before", h.ratios.slice(0, 4).every((x) => x === 1) && h.ratios[4] === 1.3 && h.ratios[5] === 1.3, h.ratios.join(' '));
check('heat stops at 5 and only your hits count', h.heat === 5 && h.events === 5, `heat ${h.heat}, ${h.events} heat events`);
check('heat cools by one between races, which ends the overdrive', h.next === 4 && h.cooled === 1, `next ${h.next}, ratio ${h.cooled}`);
check('a boost pad takes you past top speed, then you ease back', kit.boost.events === 1 && kit.boost.peak > kit.boost.top * 1.2 && kit.boost.after < kit.boost.top * 1.02,
  `peak ${kit.boost.peak.toFixed(0)}, after ${kit.boost.after.toFixed(0)}, top ${kit.boost.top}`);
const cl = kit.cloud;
check('under a storm cloud, top speed and grip drop; outside it they don\'t', cl.env.top === 0.85 && cl.env.grip === 0.55 && cl.dry.top === 1 && cl.dry.grip === 1, JSON.stringify(cl.env));
check('rain holds a car to 85 % of its top speed', Math.abs(cl.rainTop - 0.85) < 0.02, cl.rainTop.toFixed(3));
check('storm clouds drift along the track, each at its own speed', cl.drift > 0.04 && cl.speeds[1] > cl.speeds[0], `drift ${cl.drift.toFixed(3)} in 10 s, speeds ${cl.speeds.join(', ')}`);
const g = kit.glitch;
check('a glitch skull eats two charges, then rests', g.g1 === 3 && g.g2 === 3 && g.g3 === 1, `${g.g1} ${g.g2} ${g.g3}`);
check('a glitch skull never takes you below zero', g.g4 === 0, String(g.g4));
check('rivals pass through a glitch skull', g.rival === 4, String(g.rival));
check('a gate cycles off, warning, beam', kit.gate.seq.startsWith('off,warn,on,off,warn,on'), kit.gate.seq);
check('the warning comes exactly 1.0 s before every beam', kit.gate.warnOn.length >= 2 && kit.gate.warnOn.every((d) => Math.abs(d - 1) < 0.02), kit.gate.warnOn.map((d) => d.toFixed(3)).join(' '));
check('a gate only ever spins a car while the beam is on', kit.gate.spinsAt.length >= 2 && kit.gate.spinsAt.every((s) => s === 'on'), kit.gate.spinsAt.join(','));
check('driving into a beam stops the car nearly dead', kit.gate.hitV !== null && kit.gate.inV > 100 && kit.gate.hitV < 30, `${kit.gate.inV.toFixed(0)} → ${kit.gate.hitV?.toFixed(0)} px/s`);
check('a drone sweeps the full width of the track', kit.drone.lo < -kit.drone.edge + 0.5 && kit.drone.hi > kit.drone.edge - 0.5, `${kit.drone.lo.toFixed(1)} .. ${kit.drone.hi.toFixed(1)}`);
check('a drone spins a car it passes over', kit.drone.hit !== null, `${kit.drone.hit?.toFixed(2)} s`);
check('Vex moves across to block you when you\'re close behind', kit.vex.close.vexLat > 6 && kit.vex.close.gap > 0, JSON.stringify(kit.vex.close));
check('Vex keeps his line when you\'re further back', kit.vex.far.vexLat < 4, JSON.stringify(kit.vex.far));

// ---- Whole races: personalities and the leagues ----
const races = await evaluate(`(async () => { ${MODS}
  const out = {};
  for (const league of [0, 1, 2]) {
    const agg = {}, times = [];
    let spins = 0, hazardSpins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = new Rc.Race(TRACKS[0], { seed, autopilot: true, league });
      let k = 0;
      while (r.phase !== 'results' && k < 60 * 150) {
        r.step(1 / 60); k++;
        if (r.phase === 'done') r.phaseT = Math.max(r.phaseT, C.RACE.doneHold - C.RACE.doneMin);
        for (const e of r.takeEvents()) if (e.type === 'spin') { spins++; if (!e.by) hazardSpins++; }
        if (r.phase !== 'race') continue;
        for (const c of r.cars) {
          if (c.spin > 0) continue;
          const a = (agg[c.kind] ??= { ins: 0, nIns: 0, str: 0, nStr: 0 }), cv = r.track.pts[c.seg].curv;
          if (Math.abs(cv) > 0.25) { a.ins += c.lat * Math.sign(cv); a.nIns++; }
          if (Math.abs(cv) < 0.05) { a.str += c.lat; a.nStr++; }
        }
      }
      times.push(Math.max(...r.cars.map((c) => c.finishT ?? 999)));
    }
    out[league] = { times, hazardSpins, spins, lanes: Object.fromEntries(Object.entries(agg).map(([k, a]) => [k, { inside: a.ins / a.nIns, straight: a.str / a.nStr }])) };
  }
  return out;
})()`);
const lanes = races[0].lanes;
check('Halo takes the inside of bends more than the others', lanes.halo.inside > lanes.vex.inside + 1 && lanes.halo.inside > lanes.dynamo.inside + 1,
  ['halo', 'vex', 'dynamo'].map((k) => `${k} ${lanes[k].inside.toFixed(1)}`).join(', '));
check('Dynamo sits right of centre on the straights', lanes.dynamo.straight > 2 && lanes.dynamo.straight < 8, lanes.dynamo.straight.toFixed(1));
for (const [i, name] of ['Neon', 'Storm', 'Blackout'].entries()) {
  const x = races[i];
  check(`${name}: autopilot races finish, everyone inside 75 s`, x.times.every((s) => s < 75), x.times.map((s) => s.toFixed(0)).join(' '));
}
check('Neon and Storm: rivals steer round slicks (no hazard spins in six races each)', races[0].hazardSpins + races[1].hazardSpins === 0, `${races[0].hazardSpins} + ${races[1].hazardSpins}`);
check('Blackout: gates and drones catch someone now and then, not constantly (≤ 8 a race)', races[2].hazardSpins > 0 && races[2].hazardSpins <= 6 * 8, `${races[2].hazardSpins} in 6 races`);

// ---- The live game: Blackout, every new thing on screen ----
await evaluate(`${G}.scene.getScene('title').scene.start('race', { track: 0, league: 2, seed: 7 })`);
await until(() => evaluate(`${G}.scene.isActive('race') && ${G}.registry.get('hud')?.league === 'BLACKOUT'`));
await sleep(300);
const h0 = await hud();
check('the HUD shows nine letter boxes and the league', h0.letters.length === 9 && h0.league === 'BLACKOUT', JSON.stringify({ letters: h0.letters.length, league: h0.league }));
await shot('1-grid-blackout');

const f0 = straight.frac + 0.004;
const stage = async (js) => {
  await evaluate(`${R}.scene.resume()`);
  await evaluate(`(() => { const r = ${R}.race, n = r.track.n, f = ${f0}; ${js} })()`);
  await sleep(250);
  await evaluate(`${R}.scene.pause()`);
};
await stage(`window.__rivals = r.cars.slice(1); r.go(); r.solo(); r.clear(); ${R}.teleport(f, 0);
  ['cell', 'shield', 'thruster', 'core', 'grip'].forEach((k, i) => r.spawnPickup(k, f + (-12 + i * 5) / n, -14));
  [0, 1, 2].forEach((i) => r.spawnPickup('letter', f + (-12 + i * 5) / n, 14, i));
  r.spawn('boost', f + 7 / n, 0); r.spawn('glitch', f + 11 / n, 12);`);
await shot('2-pickups');
await stage(`r.clear(); ${R}.teleport(f, 0);
  r.spawn('coolant', f - 9 / n, -10); r.spawn('slick', f - 9 / n, 12); r.spawn('drone', f + 9 / n, 0);`);
await shot('3-coolant-slick-drone');
await stage(`r.clear(); ${R}.teleport(f, 0);
  const g = r.spawn('gate', f + 10 / n, 0); g.t = 3.2;`);
await shot('4-gate-warning');
await stage(`r.gates[0].t = 4.0;`);
await shot('5-gate-beam');
await stage(`r.clear(); ${R}.teleport(f, 0); r.spawn('cloud', f + 6 / n);`);
await shot('6-storm-cloud');

// Shield and letters in the HUD, then OVERDRIVE live.
await stage(`r.clear(); r.player.shield = true; r.letters = [true, true, true, true, true, true, true, true, false]; ${R}.teleport(f, 0);`);
const h1 = await hud();
check('the HUD shows the shield and the letters you hold', h1.shield && h1.letters.filter(Boolean).length === 8, JSON.stringify({ shield: h1.shield, letters: h1.letters }));
await shot('7-hud-shield-letters');
await evaluate(`${R}.scene.resume()`);
await evaluate(`(() => { const r = ${R}.race, p = r.player; r.spawnPickup('letter', p.seg / r.track.n, p.lat, 8); })()`);
await until(() => evaluate(`${G}.registry.get('hud')?.banner?.text?.startsWith('OVERDRIVE')`), 4000);
const s1 = await snap(), h2 = await hud();
check('OVERDRIVE live: banner, the Mk II sprite, letters cleared', h2.banner.text.includes('MK II') && s1.slot === 'player_mk2' && s1.letters === '000000000', `${h2.banner.text}, ${s1.slot}, ${s1.letters}`);
await sleep(200);
await shot('8-overdrive');

// Dynamo's grudge, live.
await evaluate(`(() => { const r = ${R}.race, halo = window.__rivals.find((c) => c.kind === 'halo'); r.heat = 4; halo.spin = 0; r.spinOut(halo, r.player, 0.2); })()`);
await until(() => evaluate(`${G}.registry.get('hud')?.banner?.text === 'DYNAMO OVERDRIVE'`), 3000);
check('five hits bring up DYNAMO OVERDRIVE', true);
const played = await evaluate(`${R}.played`);
check('letter, OVERDRIVE and grudge sounds', ['letter', 'overdrive', 'grudge'].every((s) => played.includes(s)), played.slice(-12).join(','));

// The career carries to the next race: machine, letters, heat (cooled), score.
await evaluate(`(() => { const r = ${R}.race; r.phase = 'done'; r.phaseT = 0.01; })()`);
await until(() => evaluate(`!!${G}.registry.get('hud')?.results`), 4000);
const k1 = await evaluate(`${G}.registry.get('career')`);
check('the results write the career: Mk II, letters, heat cooled to 4, score', k1.mk === 1 && k1.letters.every((l) => !l) && k1.heat === 4 && k1.score >= 25250, JSON.stringify({ mk: k1.mk, heat: k1.heat, score: k1.score }));
await sleep(1100);
await tap('Enter');
await until(() => evaluate(`${R}.race?.phase === 'grid' && ${G}.registry.get('hud')?.results === null`), 5000);
const s2 = await snap(), h3 = await hud();
check('the next race starts in the Mk II, in the same league, with the heat carried', s2.mk === 1 && s2.slot === 'player_mk2' && h3.league === 'BLACKOUT' && s2.heat === 4, JSON.stringify({ mk: s2.mk, slot: s2.slot, league: h3.league, heat: s2.heat }));
check('the next race lays out the first three letters again', await evaluate(`${R}.race.pickups.filter((p) => p.kind === 'letter').map((p) => p.idx).join('')`) === '012');
await sleep(600);
await shot('9-next-race-mk2');

// Back to the title: a new career.
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`));
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('race') && !!${R}.race`));
const s3 = await snap();
check('a new game from the title starts a fresh career in the Mk I', s3.mk === 0 && s3.slot === 'player' && s3.heat === 0 && s3.letters === '000000000', JSON.stringify({ mk: s3.mk, heat: s3.heat }));
await tap('Escape');

t.done();
