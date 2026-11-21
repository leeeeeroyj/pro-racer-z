// Balance probe (milestone 7): handicapped drivers race whole seasons, and Blackout with a Mk II and a Mk III.
// Logs place, time and spins per race, then sums up each league against the targets: an average driver places top
// three about 80 % of the time in Neon, 65 % in Storm and 50 % in Blackout, and needs the Mk III in Blackout.
// Usage: node tools/balance-probe.mjs <project-dir> <out-dir> [seasons=12] [skills=strong,average,weak] [overrides]
// `overrides` tries config values without editing them, as JSON paths into config.ts's exports, for example
// '{"LEAGUES.1.pace": 1.2, "RIVALS.2.pace": 0.9, "SEASON.ramp": 0.02}'.
import { writeFileSync } from 'node:fs';
import { session } from './cdp.mjs';

const [project, out, n = '12', skillList = 'strong,average,weak', overrides = '{}'] = process.argv.slice(2);
const SEASONS = Number(n);
const t = await session({ project, out, port: 5228, debugPort: 9398 });
const { evaluate, until } = t;
await until(() => evaluate(`!!(window.__proRacerZ && window.__proRacerZ.scene.isActive('title'))`));
const P = `const P = await import('/src/probe.ts');`;
// The config objects are plain at run time, so the modules that read them see the new values.
const set = await evaluate(`(async () => { const C = await import('/src/config.ts'), o = ${overrides};
  for (const [path, v] of Object.entries(o)) { const k = path.split('.'), last = k.pop(); k.reduce((a, b) => a[b], C)[last] = v; }
  return Object.keys(o).length; })()`);
if (set) console.log(`overrides: ${overrides}`);

const TARGET = [0.8, 0.65, 0.5], LEAGUE = ['Neon', 'Storm', 'Blackout'];
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

const all = {};
for (const skill of skillList.split(',')) {
  const seasons = [];
  for (let s = 0; s < SEASONS; s++) seasons.push(await evaluate(`(async () => { ${P} return P.runSeason(P.SKILLS.${skill}, ${s + 1}); })()`));
  all[skill] = seasons;
  const logs = seasons.flatMap((x) => x.logs);
  console.log(`\n${skill.toUpperCase()}: ${SEASONS} seasons, ${logs.length} races`);
  console.log('league     races  top3  (target)  wins  place  gap to 3rd  spins  walls  machine');
  for (let l = 0; l < 3; l++) {
    const L = logs.filter((x) => x.league === l), top = mean(L.map((x) => (x.place <= 3 ? 1 : 0)));
    console.log(`${LEAGUE[l].padEnd(9)} ${String(L.length).padStart(6)}  ${pct(top)}  (${pct(TARGET[l])})    ${pct(mean(L.map((x) => (x.place === 1 ? 1 : 0))))}  ${mean(L.map((x) => x.place)).toFixed(2).padStart(5)}  ${median(L.filter((x) => x.gap3 !== null).map((x) => x.gap3)).toFixed(2).padStart(9)} s  ${mean(L.map((x) => x.spins)).toFixed(1).padStart(5)}  ${mean(L.map((x) => x.walls)).toFixed(1).padStart(5)}  Mk ${(mean(L.map((x) => x.mk)) + 1).toFixed(1)}`);
  }
  const ended = seasons.filter((x) => x.endedAt !== null);
  console.log(`seasons won: ${SEASONS - ended.length}/${SEASONS}; the others ended at races ${ended.map((x) => x.endedAt + 1).join(', ') || '-'}`);
}

// Blackout in a Mk II against a Mk III, both fully upgraded, average driver.
const mkTest = await evaluate(`(async () => { ${P} const S = await import('/src/season.ts');
  const out = {};
  for (const mk of [1, 2]) {
    const logs = [];
    for (let s = 0; s < ${SEASONS}; s++) for (let i = 16; i < 24; i++) {
      const k = { ...S.newCareer(), race: i, charges: 6 };
      logs.push(P.runRace(i, k, P.SKILLS.average, 7000 + s * 100 + i, { mk, up: { thruster: 3, core: 3, grip: 3 } }).log);
    }
    out[mk] = logs;
  }
  return out;
})()`);
console.log('\nBLACKOUT BY MACHINE (average driver, fully upgraded)');
for (const mk of [1, 2]) {
  const L = mkTest[mk];
  console.log(`Mk ${mk + 1}: top3 ${pct(mean(L.map((x) => (x.place <= 3 ? 1 : 0))))}, wins ${pct(mean(L.map((x) => (x.place === 1 ? 1 : 0))))}, place ${mean(L.map((x) => x.place)).toFixed(2)}`);
}
// Per race, for spotting a track that's out of line.
const avg = (all.average ?? Object.values(all)[0]).flatMap((x) => x.logs);
console.log('\nAVERAGE DRIVER BY RACE (top-three rate, median time, spins, your top speed against Halo\'s at the finish, machine)');
const rows = [];
for (let i = 0; i < 24; i++) {
  const L = avg.filter((x) => x.race === i);
  rows.push(`${String(i + 1).padStart(2)} ${L[0]?.track.padEnd(15)} ${pct(mean(L.map((x) => (x.place <= 3 ? 1 : 0))))}  ${median(L.filter((x) => x.time !== null).map((x) => x.time)).toFixed(1)} s  spins ${mean(L.map((x) => x.spins)).toFixed(1)}  top ${mean(L.map((x) => x.top)).toFixed(0)} vs Halo ${mean(L.map((x) => x.rivalTop)).toFixed(0)}  Mk ${(mean(L.map((x) => x.mk)) + 1).toFixed(1)}`);
}
console.log(rows.join('\n'));
writeFileSync(`${out}/probe.json`, JSON.stringify({ all, mkTest }, null, 1));
t.done();
