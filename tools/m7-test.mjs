// Milestone 7 check: polish. Antenna Row's wider track, the city below (its own layout per track, traffic and
// beacons over it, in layers that slide at their own depths), the music (title and pit board, each league's theme from GO, paused with the race, stopped at the
// finish), and the balance pass's rules: upgrades once per race, two letters a race, rival pace by league.
// The balance numbers themselves come from tools/balance-probe.mjs.
// Usage: node tools/m7-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5231, debugPort: 9401 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const MODS = `const Rc = await import('/src/race.ts'), C = await import('/src/config.ts'), S = await import('/src/season.ts'), T = await import('/src/track.ts'), { TRACKS } = await import('/src/data/tracks.ts');`;
const music = () => evaluate(`(async () => (await import('/src/music.ts')).musicNow())()`);

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await evaluate(`localStorage.clear()`);

// ---- Track width ----
const width = await evaluate(`(async () => { ${MODS}
  return TRACKS.map((d) => { const a = T.buildTrack(d.ctrl, false, d.halfWidth), b = T.buildTrack(d.ctrl, true, d.halfWidth); return { id: d.id, hw: a.hw, wall: a.wall, rev: b.hw }; });
})()`);
const ar = width[0];
check('Antenna Row is wider: 28 px of asphalt each side (was 24), both ways round', ar.hw === 28 && ar.rev === 28 && ar.wall === 28 + 12 - 5, JSON.stringify(ar));
check('the other tracks keep the standard width', width.slice(1).every((w) => w.hw === 24 && w.wall === 31), width.slice(1).map((w) => w.hw).join(' '));
const lane = await evaluate(`(async () => { ${MODS}
  const r = new Rc.Race(TRACKS[0], { seed: 3, autopilot: true }); let widest = 0;
  for (let k = 0; k < 60 * 40; k++) { r.step(1 / 60); for (const c of r.cars) widest = Math.max(widest, Math.abs(c.lat)); }
  return { widest, wall: r.track.wall };
})()`);
check('cars use the wider track and the wall holds at its new place', lane.widest > 24 - 6 && lane.widest <= lane.wall + 1e-6, `widest |lat| ${lane.widest.toFixed(1)} ≤ ${lane.wall}`);

// ---- Balance rules ----
const rules = await evaluate(`(async () => { ${MODS}
  const r = new Rc.Race(TRACKS[0], { seed: 5 }); r.go(); r.clear(); r.solo();
  const up = r.spawnPickup('thruster', 0.3), cell = r.spawnPickup('cell', 0.5);
  r.place(r.player, 0.3, 0); r.step(1 / 60);
  for (let k = 0; k < 60 * 8; k++) r.step(1 / 60);
  const upBack = !up.gone && up.t <= 0;
  r.place(r.player, 0.5, 0); r.step(1 / 60);
  const cellTaken = cell.t > 0;
  r.place(r.player, 0.8, 0);
  for (let k = 0; k < 60 * 8; k++) r.step(1 / 60);
  const letters = Array.from({ length: S.RACES }, (_, i) => new Rc.Race(TRACKS[S.trackOf(i)], { seed: 1, league: S.leagueOf(i) }).pickups.filter((p) => p.kind === 'letter').length);
  const pace = (i) => C.LEAGUES[S.leagueOf(i)].pace * S.rampOf(i);
  return { thruster: r.up.thruster, upGone: up.gone, upBack, cellTaken, cellBack: cell.t <= 0, letters, opens: [pace(7), pace(8), pace(15), pace(16)], ramps: Array.from({ length: S.RACES }, (_, i) => pace(i)) };
})()`);
check('an upgrade pickup is gone for the rest of the race once taken', rules.thruster === 1 && rules.upGone && !rules.upBack, JSON.stringify({ thruster: rules.thruster, gone: rules.upGone }));
check('a charge cell still comes back', rules.cellTaken && rules.cellBack);
check('every race lays out two letters', rules.letters.every((n) => n === 2), rules.letters.join(''));
check('rival pace rises through each league, and no league opens harder than the last one ended',
  rules.ramps.every((p, i) => i % 8 === 0 || p > rules.ramps[i - 1]) && rules.opens[1] <= rules.opens[0] + 1e-9 && rules.opens[3] <= rules.opens[2] + 1e-9,
  rules.opens.map((p) => p.toFixed(3)).join(' → '));

// ---- Music renders ----
const songs = await evaluate(`(async () => { const M = await import('/src/music.ts'), ctx = new OfflineAudioContext(1, 1, 44100);
  return Object.entries(M.SONGS).map(([name, s]) => { const b = M.renderSong(ctx, s), d = b.getChannelData(0); let peak = 0, bad = 0;
    for (const v of d) { if (!Number.isFinite(v)) bad++; peak = Math.max(peak, Math.abs(v)); }
    const bars = s.lead.every((bar) => bar.split(' ').reduce((a, tok) => a + Number(tok.split(':')[1]), 0) === 16);
    return { name, secs: b.duration, expect: (s.chords.length * 2 * 16 * 60) / s.bpm / 4, peak, bad, bars };
  });
})()`);
for (const s of songs) check(`music "${s.name}": every bar adds up, a clean loop of ${s.secs.toFixed(1)} s`, s.bars && s.bad === 0 && s.peak <= 0.91 && Math.abs(s.secs - s.expect) < 0.01, `peak ${s.peak.toFixed(2)}`);

// ---- Music in play ----
await sleep(300);
let m = await music();
check('the title plays the title theme', m?.name === 'title' && m.playing, JSON.stringify(m));
await shot('1-title');
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('pit')`), 5000);
await sleep(300);
const mPit = await music();
check('the pit board carries on with the title theme', mPit?.name === 'title' && mPit.playing, JSON.stringify(mPit));
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('race') && ${R}.race.phase === 'grid'`), 5000);
await sleep(300);
check('quiet on the grid', (await music()) === null, JSON.stringify(await music()));
await until(() => evaluate(`${R}.race.phase === 'race'`), 8000);
await sleep(300);
m = await music();
check('GO starts the Neon theme', m?.name === 'neon' && m.playing, JSON.stringify(m));
await shot('2-race-neon');
await tap('p');
await sleep(300);
const mPause = await music();
await tap('p');
await sleep(300);
const mResume = await music();
check('pausing pauses the music, resuming resumes it', mPause?.paused && !mPause.playing && mResume?.playing, JSON.stringify({ mPause, mResume }));
await evaluate(`(() => { const r = ${R}.race; r.player.laps = r.laps - 1; r.autopilot = true; r.place(r.player, 0.985, 0); })()`);
await until(() => evaluate(`${R}.race.player.finished`), 8000);
await sleep(200);
check('crossing the line stops the music (the place jingle plays)', (await music()) === null, JSON.stringify(await music()));
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('title')`), 5000);
await sleep(300);
m = await music();
check('back on the title, the title theme again', m?.name === 'title' && m.playing, JSON.stringify(m));

// ---- The city, per league, and each league's theme ----
for (const [league, song] of [[1, 'storm'], [2, 'blackout']]) {
  await evaluate(`${G}.scene.getScene('title').scene.start('race', { track: 0, league: ${league}, seed: 4 })`);
  await until(() => evaluate(`${R}.race.league === ${league} && ${R}.race.phase === 'race'`), 8000);
  await sleep(400);
  m = await music();
  check(`GO in ${['', 'Storm', 'Blackout'][league]} starts its own theme`, m?.name === song && m.playing, JSON.stringify(m));
  await evaluate(`${R}.teleport(0.62, 0)`);
  await sleep(500);
  await shot(`3-city-${song}`);
  await tap('Escape');
  await until(() => evaluate(`${G}.scene.isActive('title')`), 5000);
}
const city = await evaluate(`(async () => {
  const { cityPlan } = await import('/src/city.ts'), { TRACKS } = await import('/src/data/tracks.ts');
  const plans = TRACKS.map((d) => cityPlan(d)), again = cityPlan(TRACKS[0]);
  const roofs = new Set(plans.flatMap((p) => p.lots.map((l) => l.roof)));
  const sig = (p) => p.lots.slice(0, 12).map((l) => l.x + ',' + l.y + l.roof).join(' ');
  return { kinds: [...roofs].sort().join(' '), distinct: new Set(plans.map(sig)).size, same: sig(again) === sig(plans[0]), beacons: plans.map((p) => p.beacons.length), streets: plans.map((p) => p.streets.length) };
})()`);
check('the city has every kind of roof: plain, skylights, solar, gardens, towers, helipads, pools, signs', city.kinds === 'atrium garden helipad plain pool sign solar tower', city.kinds);
check('each track gets its own city, the same every time', city.distinct === 8 && city.same, `${city.distinct} layouts`);
check('every city has streets and tower beacons', city.streets.every((n) => n > 10) && city.beacons.every((n) => n > 0), `streets ${city.streets.join(' ')}; beacons ${city.beacons.join(' ')}`);
await evaluate(`${G}.scene.getScene('title').scene.start('race', { track: 0, league: 0, seed: 4 })`);
await until(() => evaluate(`${R}.race.league === 0 && ${R}.race.phase === 'race'`), 8000);
const life = await evaluate(`(() => { const g = ${R}.children.list.find((o) => o.type === 'Graphics' && o.depth === 0.1); return g ? g.commandBuffer.length : -1; })()`);
check('traffic and beacons draw over the city', life > 0, `${life} draw commands`);

// ---- Layers ----
await sleep(300);
const layers = await evaluate(`(() => {
  const s = ${R}, imgs = (d) => s.children.list.find((o) => o.type === 'Image' && o.depth === d && o.texture.key.startsWith('city-'));
  const at = () => [0, 0.2, 0.3, 0.4].map((d) => { const i = imgs(d); return i ? [i.x, i.texture.key] : null; });
  const tv = s.view.view; const a = at(); const cx = tv.camX;
  tv.look(cx + 200, tv.camY); const b = at(); tv.look(cx, tv.camY);
  return { keys: a.map((v) => v && v[1]), moved: a.map((v, i) => v && b[i] && b[i][0] - v[0]), cityKeys: ${G}.textures.getTextureKeys().filter((k) => /^(city|track)-/.test(k)) };
})()`);
check('the city is four layers: streets, low roofs, neon, towers', layers.keys.every((k) => k) && layers.keys.map((k) => k.split('-').pop()).join(' ') === 'ground low neon tall', layers.keys.join(' '));
// Panning the view 200 px, a layer's image moves 200 × (1 − its depth): the nearer the layer, the less it trails.
const want = [0.78, 0.88, 0.88, 0.95].map((d) => 200 * (1 - d));
check('each layer slides at its own depth: the towers fastest, the streets slowest', layers.moved.every((m, i) => Math.abs(m - want[i]) < 0.5), layers.moved.map((m) => m?.toFixed(1)).join(' '));
check('only the current track\'s textures are kept (the demo goes through all 24)', layers.cityKeys.filter((k) => k !== 'city-beam').every((k) => k.includes('antenna-row-lit')), layers.cityKeys.join(' '));
const beat = await evaluate(`(async () => { const M = await import('/src/music.ts'), v = [];
  for (let k = 0; k < 40; k++) { v.push(M.musicBeat()); await new Promise((f) => setTimeout(f, 25)); }
  ${G}.sound.mute = true; await new Promise((f) => setTimeout(f, 100)); const muted = M.musicBeat(); ${G}.sound.mute = false;
  return { hi: Math.max(...v), lo: Math.min(...v), muted, name: M.musicNow()?.name };
})()`);
check('the neon pulses with the music\'s beat, and not when muted', beat.name === 'neon' && beat.hi > 0.5 && beat.lo < 0.15 && beat.muted === 0, JSON.stringify(beat));
t.done();
