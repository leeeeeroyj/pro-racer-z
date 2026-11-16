// Milestone 4 check: the season. Eight tracks in three leagues, laps per league, the rival pace ramp, retries, game
// over, the crown, lap records and the high-score table (with storage blocked too), the pit board and final screens.
// Track geometry for every track in both directions is in m1.
// Usage: node tools/m4-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5227, debugPort: 9397 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__proRacerZ';
const R = `${G}.scene.getScene('race')`;
const snap = () => evaluate(`${R}.snapshot()`);
const hud = () => evaluate(`${G}.registry.get('hud')`);
const MODS = `const Rc = await import('/src/race.ts'), C = await import('/src/config.ts'), S = await import('/src/season.ts'), St = await import('/src/store.ts'), { TRACKS } = await import('/src/data/tracks.ts');`;

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await evaluate(`localStorage.clear()`);

// ---- The season's rules ----
const rules = await evaluate(`(async () => { ${MODS}
  const k0 = { ...S.newCareer(), score: 10000, charges: 5, retries: 2 };
  const out = (place, extra = {}) => ({ place, score: 3000, charges: 7, mk: 1, letters: Array(9).fill(true).map((_, i) => i < 4), up: { thruster: 2, core: 0, grip: 1 }, heat: 3, retriesWon: 0, ...extra });
  const won = S.afterRace(k0, out(2)), lost = S.afterRace(k0, out(4)), over = S.afterRace({ ...k0, retries: 0 }, out(4));
  const last = S.afterRace({ ...k0, race: S.RACES - 1 }, out(1)), bonus = S.afterRace(k0, out(3, { retriesWon: 1 }));
  const map = Array.from({ length: S.RACES }, (_, i) => S.leagueOf(i) + ':' + S.trackOf(i)).join(' ');
  const ramps = Array.from({ length: S.RACES }, (_, i) => S.rampOf(i));
  let table = [];
  for (const s of [500, 900, 100, 700, 300, 800, 200, 600, 400]) table = S.addHighScore(table, { score: s, races: 1, crown: false }).table;
  const low = S.addHighScore(table, { score: 150, races: 0, crown: false });
  const tieA = { score: 600, races: 9, crown: false }, tie = S.addHighScore(table, tieA);
  return { won, lost, over, last, bonus, k0, map, ramps, races: S.RACES, table: table.map((e) => e.score), lowRank: low.rank, tieRank: tie.rank, tieTable: tie.table.map((e) => e.score) };
})()`);
check('24 races: eight tracks, then the same eight in Storm, then Blackout', rules.races === 24 && rules.map.startsWith('0:0 0:1') && rules.map.includes('1:0 1:1') && rules.map.endsWith('2:6 2:7'), rules.map);
check('rival pace ramps up within each league and resets with the next', rules.ramps[0] === 1 && rules.ramps[7] > rules.ramps[6] && rules.ramps[8] === 1 && rules.ramps[16] === 1, rules.ramps.slice(0, 9).map((r) => r.toFixed(3)).join(' '));
check('top three: on to the next race with the race\'s score, machine, letters and upgrades', rules.won.verdict === 'next' && rules.won.career.race === 1 && rules.won.career.score === 13000 && rules.won.career.mk === 1
  && rules.won.career.charges === 7 && rules.won.career.up.thruster === 2 && rules.won.career.heat === 2 && rules.won.career.retries === 2, JSON.stringify(rules.won));
check('4th: a retry is spent and the race runs again with nothing from it kept', rules.lost.verdict === 'retry' && rules.lost.career.retries === 1 && rules.lost.career.race === 0
  && rules.lost.career.score === 10000 && rules.lost.career.charges === 5 && rules.lost.career.mk === 0 && rules.lost.career.letters.every((l) => !l), JSON.stringify(rules.lost.career));
check('4th with no retries left ends the season', rules.over.verdict === 'over' && rules.over.career.score === 10000, rules.over.verdict);
check('finishing race 24 in the top three wins the crown', rules.last.verdict === 'crown' && rules.last.career.race === 24, rules.last.verdict);
check('OVERDRIVE in the Mk III adds a retry', rules.bonus.career.retries === 3, String(rules.bonus.career.retries));
check('the high-score table keeps the best eight, best first', rules.table.join(',') === '900,800,700,600,500,400,300,200', rules.table.join(','));
check('a score below the table doesn\'t get in', rules.lowRank === -1, String(rules.lowRank));
check('a tie goes below the score already there', rules.tieRank === 4 && rules.tieTable.join(',') === '900,800,700,600,600,500,400,300', `${rules.tieRank}: ${rules.tieTable.join(',')}`);

// ---- Every track and league: placements, laps, the autopilot ----
const tracks = await evaluate(`(async () => { ${MODS}
  const HW = C.TRACK.halfWidth, R = { cell: C.PICKUP.r, shield: C.PICKUP.r, thruster: C.PICKUP.r, core: C.PICKUP.r, grip: C.PICKUP.r, letter: C.PICKUP.r,
    coolant: C.HAZARD.coolant.r, slick: C.HAZARD.slick.r, boost: C.HAZARD.boost.r, glitch: C.HAZARD.glitch.r };
  const out = [];
  for (let race = 0; race < S.RACES; race++) {
    const def = TRACKS[S.trackOf(race)], league = S.leagueOf(race);
    const r = new Rc.Race(def, { seed: 40 + race, autopilot: true, league, ramp: S.rampOf(race) });
    const things = [...r.pickups, ...r.hazards];
    const outside = things.filter((o) => Math.abs(o.lat) + R[o.kind] > HW + 1e-9).map((o) => o.kind + '@' + (o.seg / r.track.n).toFixed(2));
    const overlaps = [];
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < R[a.kind] + R[b.kind]) overlaps.push(a.kind + '/' + b.kind);
    }
    const letters = r.pickups.filter((p) => p.kind === 'letter').sort((a, b) => a.seg - b.seg).map((p) => p.idx).join('');
    let k = 0, spins = 0;
    while (r.phase !== 'results' && k < 60 * 160) {
      r.step(1 / 60); k++;
      if (r.phase === 'done') r.phaseT = Math.max(r.phaseT, C.RACE.doneHold - C.RACE.doneMin);
      for (const e of r.takeEvents()) if (e.type === 'spin' && !e.by) spins++;
    }
    out.push({ race: race + 1, id: def.id, league, laps: r.laps, outside, overlaps, letters, all: r.cars.every((c) => c.finished), you: r.player.finishT, last: Math.max(...r.cars.map((c) => c.finishT ?? 999)), spins,
      place: r.results ? r.results.indexOf(r.player) + 1 : 0 });
  }
  return out;
})()`);
check('eight tracks', new Set(tracks.map((x) => x.id)).size === 8, [...new Set(tracks.map((x) => x.id))].join(' '));
check('laps run 2–3 in Neon, 2–3 in Storm, 2–4 in Blackout', tracks.every((x) => x.laps >= 2 && x.laps <= (x.league === 2 ? 4 : 3)), ['Neon', 'Storm', 'Blackout'].map((n, l) => n + ' ' + tracks.filter((x) => x.league === l).map((x) => x.laps).join('')).join(', '));
const outside = tracks.filter((x) => x.outside.length);
check('every pickup, letter and hazard sits inside the asphalt, every league', outside.length === 0, outside.map((x) => `race ${x.race}: ${x.outside.join(' ')}`).join(' | '));
const over = tracks.filter((x) => x.overlaps.length);
check('no two pickups or hazards overlap', over.length === 0, over.map((x) => `race ${x.race}: ${x.overlaps.join(' ')}`).join(' | '));
check('each race lays out O, V, E in the order you reach them', tracks.every((x) => x.letters === '012'), tracks.filter((x) => x.letters !== '012').map((x) => `race ${x.race} ${x.letters}`).join(' '));
const stalled = tracks.filter((x) => !x.all || x.last > 100);
check('the autopilot race finishes with all four pilots, all 24 races', stalled.length === 0, stalled.map((x) => `race ${x.race} ${x.id}/${x.league}: ${x.last.toFixed(0)} s`).join(' | '));
const times = tracks.map((x) => x.you);
check('races take about 45–75 s (your autopilot time, every race inside 40–80 s)', times.every((s) => s > 40 && s < 80),
  ['Neon', 'Storm', 'Blackout'].map((n, l) => n + ' ' + tracks.filter((x) => x.league === l).map((x) => x.you.toFixed(0)).join(' ')).join(' | '));
console.log('      hazard spins per race: ' + tracks.map((x) => x.spins).join(' ') + '   autopilot places: ' + tracks.map((x) => x.place).join(''));

// ---- Lap records ----
const laps = await evaluate(`(async () => { ${MODS}
  const run = (record) => { const r = new Rc.Race(TRACKS[0], { seed: 3, autopilot: true, record }); r.solo(); r.go(); const ev = [];
    while (r.lapTimes.length < 1) { r.step(1 / 60); ev.push(...r.takeEvents().map((e) => e.type)); } return { score: r.score, record: r.record, lap: r.lapTimes[0], ev }; };
  return { none: run(null), beaten: run(999), held: run(1) };
})()`);
// The autopilot picks things up on the way, so the record's 1,000 is the score difference between the runs.
check('your first lap on a track sets the record without points', !laps.none.ev.includes('record') && laps.none.record === laps.none.lap, `record ${laps.none.record?.toFixed(2)}`);
check('beating the record scores 1,000', laps.beaten.ev.includes('record') && laps.beaten.score - laps.none.score === 1000 && laps.beaten.record === laps.beaten.lap, `+${laps.beaten.score - laps.none.score}`);
check('a slower lap leaves the record alone', !laps.held.ev.includes('record') && laps.held.score === laps.none.score && laps.held.record === 1, `${laps.held.record}`);

// ---- Live: helpers ----
/** The pit board comes before every race: wait for it, then Enter. */
const throughPit = async () => { await until(() => evaluate(`${G}.scene.isActive('pit')`)); await sleep(300); await tap('Enter'); };
const setCareer = (js) => evaluate(`(async () => { const S = await import('/src/season.ts'); const k = { ...S.newCareer(), ${js} }; ${G}.registry.set('career', k); return k; })()`);
const raceUp = () => until(() => evaluate(`${G}.scene.isActive('race') && ${R}.race?.phase === 'grid' && !!${G}.registry.get('hud')`), 8000);
/** Ends the race at once with you in `place`. */
const finishAs = (place) => evaluate(`(() => { const r = ${R}.race, you = r.player, order = r.cars.filter((c) => c !== you); order.splice(${place} - 1, 0, you);
  r.go(); r.finishOrder = []; order.forEach((c, i) => { c.finished = true; c.finishT = 50 + i; r.finishOrder.push(c); }); r.phase = 'done'; r.phaseT = 0.01; })()`);
const resultsUp = () => until(() => evaluate(`!!${G}.registry.get('hud')?.results?.ready`), 6000);
const fromTitle = async () => { await until(() => evaluate(`${G}.scene.isActive('title')`)); await sleep(300); };

// The pit board for race 1.
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('pit')`));
await sleep(400);
await shot('1-pit-race1');
await tap('Enter');
await raceUp();
const h0 = await hud();
check('race 1 is Antenna Row in Neon, 2 laps', h0.race === 1 && h0.track === 'ANTENNA ROW' && h0.league === 'NEON' && h0.laps === 2, JSON.stringify({ race: h0.race, track: h0.track, laps: h0.laps }));

// 4th with retries: the race runs again, nothing kept.
await evaluate(`${R}.race.charges = 9`);
await finishAs(4);
await resultsUp();
const h1 = await hud();
check('a 4th place shows RETRY and the race points as lost', h1.results.verdict === 'retry' && h1.results.retries === 1, JSON.stringify({ verdict: h1.results.verdict, retries: h1.results.retries }));
await shot('2-results-retry');
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('pit')`));
await sleep(300);
const k1 = await evaluate(`${G}.registry.get('career')`);
check('the retry costs one retry and keeps you on race 1 with the charges you started with', k1.retries === 1 && k1.race === 0 && k1.charges === 4 && k1.score === 0, JSON.stringify({ retries: k1.retries, race: k1.race, charges: k1.charges }));
await shot('3-pit-retry');
await tap('Enter');
await raceUp();
check('the retry is the same race again', (await hud()).race === 1);

// 1st: on to race 2, Coolant Bay, 3 laps.
await finishAs(1);
await resultsUp();
check('a 1st place shows NEXT RACE', (await hud()).results.verdict === 'next');
await tap('Enter');
await throughPit();
await raceUp();
const h2 = await hud();
check('race 2 is Coolant Bay, 3 laps', h2.race === 2 && h2.track === 'COOLANT BAY' && h2.laps === 3, JSON.stringify({ race: h2.race, track: h2.track, laps: h2.laps }));

// The new tracks on the grid, each in its own league's look: lit, reversed, dark.
for (const race of [2, 11, 19, 4, 13, 22]) {
  await tap('Escape');
  await fromTitle();
  await setCareer(`race: ${race}`);
  await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
  await raceUp();
  await sleep(500);
  const h = await hud();
  await shot(`4-grid-${race + 1}-${h.track.toLowerCase().replace(/ /g, '-')}-${h.league.toLowerCase()}`);
}
await tap('Escape');
await fromTitle();

// The Storm pit board on a new league.
await setCareer(`race: 8, score: 41200, mk: 1, up: { thruster: 2, core: 1, grip: 0 }, heat: 3, letters: [true, true, true, true, false, false, false, false, false]`);
await evaluate(`${G}.scene.getScene('title').scene.start('pit')`);
await until(() => evaluate(`${G}.scene.isActive('pit')`));
await sleep(400);
await shot('5-pit-storm');
await tap('Escape');
await fromTitle();

// No retries left: 4th ends the season, and the score goes on the table.
await setCareer(`race: 5, score: 23450, retries: 0`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
await finishAs(4);
await resultsUp();
check('4th with no retries left shows GAME OVER', (await hud()).results.verdict === 'over');
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('final')`));
await sleep(500);
const rank1 = await evaluate(`${G}.scene.getScene('final').rank`);
const saved = await evaluate(`JSON.parse(localStorage.getItem('pro-racer-z-scores') ?? '[]')`);
check('game over: the score goes on the high-score table', rank1 === 0 && saved[0]?.score === 23450 && saved[0]?.races === 5 && !saved[0]?.crown, JSON.stringify(saved));
await shot('6-game-over');
await tap('Enter');
await fromTitle();
await sleep(300);
const best = await evaluate(`${G}.scene.getScene('title').children.list.some((o) => o.text === 'BEST 23,450')`);
check('the title shows the best score', best);

// Race 24 in the top three: the crown.
await setCareer(`race: 23, score: 180000, mk: 2`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
const h3 = await hud();
check('race 24 is Zenith Spire in Blackout', h3.race === 24 && h3.track === 'ZENITH SPIRE' && h3.league === 'BLACKOUT', `${h3.track} ${h3.league}`);
await finishAs(2);
await resultsUp();
check('finishing race 24 in the top three shows CROWN', (await hud()).results.verdict === 'crown');
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('final')`));
await sleep(500);
const rank2 = await evaluate(`${G}.scene.getScene('final').rank`);
check('the crown tops the table', rank2 === 0);
await shot('7-crown');
await tap('Enter');
await fromTitle();

// A lap record is saved for the track and league.
await setCareer(`race: 0`);
await evaluate(`${G}.scene.getScene('title').scene.start('race')`);
await raceUp();
await evaluate(`(() => { const r = ${R}.race; r.record = 12.5; r.go(); r.finishOrder = []; r.cars.forEach((c, i) => { c.finished = true; c.finishT = 50 + i; r.finishOrder.push(c); }); r.phase = 'done'; r.phaseT = 0.01; })()`);
await resultsUp();
const lapSaved = await evaluate(`JSON.parse(localStorage.getItem('pro-racer-z-laps') ?? '{}')`);
check('the best lap is saved per track and league', lapSaved['antenna-row/0'] === 12.5, JSON.stringify(lapSaved));
await tap('Escape');
await fromTitle();

// Storage blocked: the whole loop still runs.
await evaluate(`Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } })`);
const blocked = await evaluate(`(async () => { const St = await import('/src/store.ts'); St.saveScores([{ score: 1, races: 0, crown: false }]); St.saveLap('x', 0, 1); return { scores: St.loadScores().length, lap: St.loadLap('x', 0) }; })()`);
check('storage blocked: loads come back empty and saves do nothing', blocked.scores === 0 && blocked.lap === null, JSON.stringify(blocked));
await evaluate(`${G}.scene.getScene('title').scene.restart()`);
await fromTitle();
await setCareer(`retries: 0`);
await evaluate(`${G}.scene.getScene('title').scene.start('pit')`);
await throughPit();
await raceUp();
await finishAs(4);
await resultsUp();
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('final')`));
await sleep(300);
await tap('Enter');
await fromTitle();
check('storage blocked: title, pit board, race, results and game over all run', true);

t.done();
