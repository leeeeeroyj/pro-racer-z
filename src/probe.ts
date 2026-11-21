// The balance probe's driver, dev only (the game never imports this; tools/balance-probe.mjs loads it from the dev
// server). It drives your car with the autopilot's line-following, handicapped to stand in for a person: it reacts
// late, its aim wanders, now and then it holds straight for a moment, and it fires when a rival is lined up ahead.
// Whole seasons run with the real career rules: letters, machine steps, upgrades, charges, Dynamo's heat and retries.
import { RACE } from './config';
import { TRACKS } from './data/tracks';
import { Race, type Control, type PlayerInput } from './race';
import { afterRace, leagueOf, newCareer, rampOf, trackOf, RACES, type Career } from './season';
import { mulberry32 } from './rng';

export interface Skill {
  /** Seconds between seeing and steering. */
  lag: number;
  /** How far the aim wanders, radians (standard deviation), and how slowly (seconds). */
  wobble: number;
  wobbleT: number;
  /** Lapses per second, and how long each holds the wheel straight, seconds. */
  lapses: number;
  lapseT: number;
  /** Chance per second of firing at a rival lined up ahead (or dropping a mine on one close behind). */
  trigger: number;
}

export const SKILLS: Record<'strong' | 'average' | 'weak', Skill> = {
  strong: { lag: 0.08, wobble: 0.04, wobbleT: 0.6, lapses: 0, lapseT: 0, trigger: 1.2 },
  average: { lag: 0.17, wobble: 0.08, wobbleT: 0.6, lapses: 1 / 20, lapseT: 0.35, trigger: 0.8 },
  weak: { lag: 0.26, wobble: 0.12, wobbleT: 0.6, lapses: 1 / 10, lapseT: 0.45, trigger: 0.5 },
};

const DT = 1 / 60;

export interface RaceLog {
  race: number;
  league: number;
  track: string;
  mk: number;
  place: number;
  /** Your finishing time, s (null if the race ended first). */
  time: number | null;
  /** Seconds behind the third car home (negative: ahead of it). */
  gap3: number | null;
  spins: number;
  walls: number;
  letters: number;
  /** Your top speed at the finish, and the fastest rival's, px/s. */
  top: number;
  rivalTop: number;
}

/** Runs one race with `skill` at the wheel and returns the race and its log line. */
export function runRace(raceIdx: number, k: Career, skill: Skill, seed: number, override?: { mk?: number; up?: Career['up'] }) {
  const def = TRACKS[trackOf(raceIdx)], league = leagueOf(raceIdx);
  const r = new Race(def, {
    seed, mk: override?.mk ?? k.mk, charges: k.charges, letters: k.letters, up: override?.up ?? k.up, heat: k.heat, league, ramp: rampOf(raceIdx),
  });
  const rnd = mulberry32(seed ^ 0x9e3779b9), you = r.player, delay = Math.max(1, Math.round(skill.lag / DT));
  const seen: Control[] = [];
  let wob = 0, lapse = 0, held = 0, spins = 0, walls = 0, cool = 0, steps = 0;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  while (r.phase !== 'results' && steps < 60 * (RACE.cap + 10)) {
    steps++;
    // What it sees now, acted on `lag` later, with its aim wandering.
    seen.push(r.aiControl(you, r.statsOf(you), true));
    if (seen.length > delay) seen.shift();
    const ctl = { ...seen[0] };
    wob += (-wob / skill.wobbleT) * DT + skill.wobble * Math.sqrt((2 * DT) / skill.wobbleT) * gauss();
    if (ctl.heading !== null) ctl.heading += wob;
    if (lapse > 0) { lapse -= DT; ctl.heading = held; ctl.throttle = 1; ctl.brake = false; }
    else if (r.phase === 'race' && rnd() < skill.lapses * DT) { lapse = skill.lapseT; held = you.a; }
    const input: PlayerInput = { drive: ctl, fire: false, drop: false };
    cool -= DT;
    if (r.phase === 'race' && cool <= 0 && r.charges > 0 && rnd() < skill.trigger * DT) {
      for (const o of r.cars) {
        if (o === you || o.finished) continue;
        const g = r.progressGap(you, o);
        if (g > 3 && g < 22 && Math.abs(o.lat - you.lat) < 10) { input.fire = true; break; }
        if (g < -2 && g > -9) { input.drop = true; break; }
      }
      if (input.fire || input.drop) cool = 1;
    }
    r.step(DT, input);
    for (const e of r.takeEvents()) {
      if (e.type === 'spin' && e.car === you) spins++;
      if (e.type === 'wall' && e.car === you) walls++;
    }
  }
  const place = r.results ? r.results.indexOf(you) + 1 : 4;
  const third = r.results?.[2]?.finishT ?? null;
  const log: RaceLog = {
    race: raceIdx, league, track: def.id, mk: r.mk, place, time: you.finishT, spins, walls, letters: r.letters.filter(Boolean).length,
    top: Math.round(r.statsOf(you).top), rivalTop: Math.round(r.statsOf(r.cars[1]).top),
    gap3: you.finishT !== null && third !== null ? +(you.finishT - third).toFixed(2) : null,
  };
  return { r, log };
}

/**
 * A whole season. A 4th place spends a retry and runs the race again, as in the game; with none left the season
 * would be over, but the probe carries on (recording where it ended) so every league gets measured. After three
 * tries at one race it moves on.
 */
export function runSeason(skill: Skill, seed: number) {
  let k: Career = newCareer(), endedAt: number | null = null, attempt = 0;
  const logs: RaceLog[] = [];
  while (k.race < RACES) {
    const raceIdx = k.race;
    const { r, log } = runRace(raceIdx, k, skill, seed * 1000 + raceIdx * 10 + attempt);
    logs.push(log);
    const res = afterRace(k, { place: log.place, score: r.score, charges: r.charges, mk: r.mk, letters: r.letters, up: r.up, heat: r.heat, retriesWon: r.retriesWon });
    if (attempt >= 2 && res.verdict !== 'next' && res.verdict !== 'crown') {
      // A third failure in a row: move on regardless, so the rest of the season still gets measured.
      if (res.verdict === 'over') endedAt ??= raceIdx;
      k = { ...k, race: k.race + 1, retries: Math.max(1, k.retries) };
      attempt = 0;
    } else if (res.verdict === 'over') {
      endedAt ??= raceIdx;
      k = { ...k, retries: 1 };
      attempt++;
    } else {
      attempt = res.verdict === 'retry' ? attempt + 1 : 0;
      k = res.career;
    }
  }
  return { logs, endedAt, score: k.score };
}
