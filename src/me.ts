// The Me tab: the long view of one runner, worked out from the runs on this
// phone. Pure, no React Native, so `npm run test:me` runs it in Node.
// Totals, years and this week are plain sums (free); the trends and patterns
// that read months of runs stay in progress.ts and patterns.ts behind isUnlocked().

import { weekOf } from './weekGoal';

export type MeRun = { id: number; startedAt: number; distanceM: number; durationS: number };

export interface Lifetime {
  runs: number;
  distanceM: number;
  durationS: number;
  /** When the first run started, or null with no runs. */
  firstAt: number | null;
}

export function lifetime(runs: MeRun[]): Lifetime {
  let distanceM = 0;
  let durationS = 0;
  let firstAt: number | null = null;
  for (const r of runs) {
    distanceM += Math.max(0, r.distanceM);
    durationS += Math.max(0, r.durationS);
    if (firstAt == null || r.startedAt < firstAt) firstAt = r.startedAt;
  }
  return { runs: runs.length, distanceM, durationS, firstAt };
}

export interface YearTotal {
  year: number;
  runs: number;
  distanceM: number;
}

/** One line a year, newest first, local calendar years. Years with no runs between are left out. */
export function years(runs: MeRun[]): YearTotal[] {
  const by = new Map<number, YearTotal>();
  for (const r of runs) {
    const year = new Date(r.startedAt).getFullYear();
    const t = by.get(year) ?? { year, runs: 0, distanceM: 0 };
    t.runs++;
    t.distanceM += Math.max(0, r.distanceM);
    by.set(year, t);
  }
  return [...by.values()].sort((a, b) => b.year - a.year);
}

/** The year with the most distance, or null. A tie goes to the later year. */
export function bestYear(ys: YearTotal[]): number | null {
  let best: YearTotal | null = null;
  for (const y of ys) if (!best || y.distanceM > best.distanceM || (y.distanceM === best.distanceM && y.year > best.year)) best = y;
  return best?.year ?? null;
}

/** Monday to Sunday of this week: true for each day with a run. Never a streak, just the week. */
export function weekDays(runs: MeRun[], now: number): boolean[] {
  const { start, end } = weekOf(now);
  const days = [false, false, false, false, false, false, false];
  for (const r of runs) {
    if (r.startedAt < start || r.startedAt >= end) continue;
    const d = new Date(r.startedAt);
    // Monday 0 … Sunday 6, by the local weekday, so a clock change can't shift a day.
    days[(d.getDay() + 6) % 7] = true;
  }
  return days;
}

/**
 * Straight-line distances (km) for the journey line, shortest first. The
 * words for each, in every language, are ui().me.journeys in the same order.
 * A marathon count covers anything shorter; laps of the Earth anything longer.
 */
export const JOURNEY_KM = [344, 577, 1105, 1434, 2314, 2764, 3905, 5570, 9714];
export const MARATHON_KM = 42.195;
export const EARTH_KM = 40075;

export type Journey = { kind: 'none' } | { kind: 'marathons'; n: number } | { kind: 'trip'; index: number } | { kind: 'earth'; n: number };

/**
 * The longest trip the total covers, allowing it to be up to a tenth short so
 * "about" stays honest. Under one marathon there is nothing to say.
 */
export function journey(distanceM: number): Journey {
  const km = distanceM / 1000;
  if (km >= EARTH_KM * 0.95) return { kind: 'earth', n: Math.round((km / EARTH_KM) * 10) / 10 };
  let index = -1;
  for (let i = 0; i < JOURNEY_KM.length; i++) if (km >= JOURNEY_KM[i] * 0.9) index = i;
  if (index >= 0) return { kind: 'trip', index };
  if (km >= MARATHON_KM) return { kind: 'marathons', n: Math.floor(km / MARATHON_KM) };
  return { kind: 'none' };
}

/** Your places by how many runs are logged in each, most first; ties by name. */
export function topPlaces(placeOf: Map<number, number>, places: Array<{ id: number; name: string }>, n = 3): Array<{ id: number; name: string; runs: number }> {
  const count = new Map<number, number>();
  for (const pid of placeOf.values()) count.set(pid, (count.get(pid) ?? 0) + 1);
  return places
    .map((p) => ({ id: p.id, name: p.name, runs: count.get(p.id) ?? 0 }))
    .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Runs between home and work in the calendar month of `now`. */
export function commutesThisMonth(runs: MeRun[], tags: Map<number, 'toWork' | 'home'>, now: number): { toWork: number; home: number } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const out = { toWork: 0, home: 0 };
  for (const r of runs) {
    if (r.startedAt < start || r.startedAt >= end) continue;
    const t = tags.get(r.id);
    if (t) out[t]++;
  }
  return out;
}

/**
 * The loop behind the top of Me: calm, cinematic, a runner you can see.
 * One per day (so it never switches while you look), from a small day set, or
 * a night set after dark. The Run tab rotates by weather; Me stays quieter.
 */
export const ME_DAY_FOOTAGE = ['sunset-water', 'glass-river', 'sun-trees'] as const;
export const ME_NIGHT_FOOTAGE = ['dark-forest', 'night-park'] as const;
export type MeFootage = (typeof ME_DAY_FOOTAGE)[number] | (typeof ME_NIGHT_FOOTAGE)[number];

export function meFootage(now: number): MeFootage {
  const d = new Date(now);
  const h = d.getHours();
  const dayNo = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  const pool: readonly MeFootage[] = h < 6 || h >= 21 ? ME_NIGHT_FOOTAGE : ME_DAY_FOOTAGE;
  return pool[((dayNo % pool.length) + pool.length) % pool.length];
}

/**
 * Bests as bars: each race distance's best, as pace per km, scaled so the
 * quickest pace is the full width and the slowest still shows. 0..1 each.
 */
export function bestBars(efforts: Array<{ key: string; m: number; seconds: number }>): Array<{ key: string; share: number; paceS: number }> {
  if (efforts.length === 0) return [];
  const paces = efforts.map((e) => e.seconds / (e.m / 1000));
  const quick = Math.min(...paces);
  const slow = Math.max(...paces);
  return efforts.map((e, i) => ({
    key: e.key,
    paceS: paces[i],
    // Quickest = 1, slowest = 0.45: a gap you can see without the slow end vanishing.
    share: slow === quick ? 1 : 1 - ((paces[i] - quick) / (slow - quick)) * 0.55,
  }));
}
