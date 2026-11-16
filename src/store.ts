// The high-score table and lap records, kept in localStorage. Storage can be blocked or full (private windows, embeds),
// so every access is in try/catch and the game carries on without it.
import { ATTRACT } from './attract';
import { SEASON } from './config';
import type { HighScore } from './season';

const SCORES = 'pro-racer-z-scores';
const LAPS = 'pro-racer-z-laps';
/** The table's top score as a plain number, for Arcadia's cabinet ("Your best"). */
const HI = 'pro-racer-z-hi';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  // Attract mode shares the origin with Arcadia and every other game: it never writes.
  if (ATTRACT) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked or full: this session just won't remember it.
  }
}

const isEntry = (e: unknown): e is HighScore =>
  !!e && typeof (e as HighScore).score === 'number' && typeof (e as HighScore).races === 'number' && typeof (e as HighScore).crown === 'boolean';

export function loadScores(): HighScore[] {
  const t = read<unknown>(SCORES, []);
  return Array.isArray(t) ? t.filter(isEntry).slice(0, SEASON.table) : [];
}

export function saveScores(table: readonly HighScore[]) {
  write(SCORES, table);
  syncHi(table);
}

/** Keeps the plain high score in step with the table (tables saved before it existed get one on the next title). */
export function syncHi(table: readonly HighScore[] = loadScores()) {
  const best = table[0]?.score ?? 0;
  if (best > 0 && read<unknown>(HI, 0) !== best) write(HI, best);
}

const lapKey = (track: string, league: number) => `${track}/${league}`;

/** Best lap in seconds for a track and league, or null. */
export function loadLap(track: string, league: number): number | null {
  const t = read<Record<string, unknown>>(LAPS, {}), v = t && typeof t === 'object' ? t[lapKey(track, league)] : null;
  return typeof v === 'number' && v > 0 ? v : null;
}

export function saveLap(track: string, league: number, secs: number) {
  const t = read<Record<string, number>>(LAPS, {});
  write(LAPS, { ...(t && typeof t === 'object' ? t : {}), [lapKey(track, league)]: secs });
}
