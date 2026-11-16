// The season: 24 races in three leagues, and what carries from race to race (score, charges, the machine, letters,
// upgrades, Dynamo's heat, retries). The high-score table's rules. Pure.
import { HEAT, LEAGUES, SEASON, WEAPONS, WORD, type Upgrade } from './config';
import { TRACKS } from './data/tracks';

export interface Career {
  /** Race index, 0..RACES-1. */
  race: number;
  score: number;
  charges: number;
  /** Machine index into MACHINES. */
  mk: number;
  letters: boolean[];
  up: Record<Upgrade, number>;
  heat: number;
  retries: number;
}

export const RACES = LEAGUES.length * TRACKS.length;

export function newCareer(): Career {
  return {
    race: 0, score: 0, charges: WEAPONS.startCharges, mk: 0, letters: Array<boolean>(WORD.length).fill(false),
    up: { thruster: 0, core: 0, grip: 0 }, heat: 0, retries: SEASON.retries,
  };
}

export const leagueOf = (race: number) => Math.floor(race / TRACKS.length);
export const trackOf = (race: number) => race % TRACKS.length;
/** Rival pace creeps up through each league, on top of the league's own pace. */
export const rampOf = (race: number) => 1 + SEASON.ramp * trackOf(race);

/** Dynamo cools off by one between races. */
export const heatForNextRace = (heat: number) => Math.max(0, heat - HEAT.perRace);

/** What a race hands back to the season. */
export interface RaceOutcome {
  place: number;
  score: number;
  charges: number;
  mk: number;
  letters: readonly boolean[];
  up: Readonly<Record<Upgrade, number>>;
  heat: number;
  retriesWon: number;
}

/**
 * `next`: on to the next race. `crown`: that was the last race. `retry`: 4th, a retry is spent and the race runs again
 * from where it started (its points and pickups are lost). `over`: 4th with no retries left.
 */
export type Verdict = 'next' | 'crown' | 'retry' | 'over';

/** The career after a race, and what happens next. Doesn't change `before`. */
export function afterRace(before: Career, r: RaceOutcome): { career: Career; verdict: Verdict } {
  if (r.place > SEASON.qualify) {
    if (before.retries > 0) return { career: { ...before, retries: before.retries - 1 }, verdict: 'retry' };
    return { career: { ...before }, verdict: 'over' };
  }
  const career: Career = {
    race: before.race + 1, score: before.score + r.score, charges: r.charges, mk: r.mk, letters: [...r.letters], up: { ...r.up },
    heat: heatForNextRace(r.heat), retries: before.retries + r.retriesWon,
  };
  return { career, verdict: career.race >= RACES ? 'crown' : 'next' };
}

export interface HighScore {
  score: number;
  /** Races finished in the top three. */
  races: number;
  crown: boolean;
}

/** Adds an entry to the table (best first, ties keep the older entry first) and keeps the top `SEASON.table`. */
export function addHighScore(table: readonly HighScore[], entry: HighScore): { table: HighScore[]; rank: number } {
  const all = [...table, entry].sort((a, b) => b.score - a.score);
  const kept = all.slice(0, SEASON.table), rank = kept.indexOf(entry);
  return { table: kept, rank };
}
