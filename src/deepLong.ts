// "Show me everything" across months: how far you hold your pace, what hills
// cost you, streets new to you, when you run against the light, which runs lift
// your energy, and how your times on a loop settle. These read months of runs,
// so the screen shows them only with Everything, once (it asks isUnlocked(),
// never this module).
//
// Pure, no network, no React Native, so `npm run test:deep` checks it under Node.
// Numbers only: the words live in the i18n file.

import { adjustedPace } from './progress';
import { cellOf, median, quantile } from './deepMore';
import { sunTimes } from './runStats';

const DAY = 86400 * 1000;
const YEAR = 365 * DAY;

export interface LongFact {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  moodBefore: number | null;
  moodAfter: number | null;
  placeId: number | null;
  heldM: number | null;
  upS: number | null;
  lat: number | null;
  lon: number | null;
  cells: string[];
}

export interface MonthRange {
  month: number; // first day of the month, local time
  mid: number | null;
  lo: number | null;
  hi: number | null;
  n: number;
}

function monthStart(t: number, back = 0): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() - back, 1).getTime();
}

/** The last six months, oldest first, each with the runs that started in it. */
function sixMonths<T extends { startedAt: number }>(runs: T[], now: number): Array<{ month: number; runs: T[] }> {
  const out: Array<{ month: number; runs: T[] }> = [];
  for (let k = 5; k >= 0; k--) {
    const from = monthStart(now, k);
    const to = monthStart(now, k - 1);
    out.push({ month: from, runs: runs.filter((r) => r.startedAt >= from && r.startedAt < to && r.startedAt <= now) });
  }
  return out;
}

function ranges(months: Array<{ month: number; values: number[] }>, min: number): MonthRange[] {
  return months.map(({ month, values }) =>
    values.length >= min
      ? { month, mid: median(values), lo: quantile(values, 0.25), hi: quantile(values, 0.75), n: values.length }
      : { month, mid: null, lo: null, hi: null, n: values.length },
  );
}

// ---- M1: how far you hold on ---------------------------------------------------------------

export interface Durability {
  months: MonthRange[];
  first: number;
  last: number;
}

/** Monthly middle of how far the pace held on runs of 5 km or more. Needs three months with three such runs. */
export function durability(runs: LongFact[], now = Date.now()): Durability | null {
  const months = ranges(
    sixMonths(runs, now).map((m) => ({ month: m.month, values: m.runs.map((r) => r.heldM).filter((x): x is number => x != null) })),
    3,
  );
  const shown = months.filter((m) => m.mid != null);
  if (shown.length < 3) return null;
  return { months, first: shown[0].mid!, last: shown[shown.length - 1].mid! };
}

// ---- M2: hill price over months -----------------------------------------------------------

export interface HillMonths {
  months: MonthRange[];
  first: number;
  last: number;
}

export function hillMonths(runs: LongFact[], now = Date.now()): HillMonths | null {
  const months = ranges(
    sixMonths(runs, now).map((m) => ({ month: m.month, values: m.runs.map((r) => r.upS).filter((x): x is number => x != null) })),
    2,
  );
  const shown = months.filter((m) => m.mid != null);
  if (shown.length < 3) return null;
  return { months, first: shown[0].mid!, last: shown[shown.length - 1].mid! };
}

// ---- M3: new streets ---------------------------------------------------------------------

export interface NewStreets {
  months: Array<{ month: number; newM: number; knownM: number }>;
  /** The month with the biggest share of new streets, and that share (0–1). */
  best: { month: number; share: number } | null;
}

const SETTLE_DAYS = 30; // in your first month everything is new, so it isn't counted

/** Of each month's distance, how much was on streets you'd never run before (any run, ever, on this phone). */
export function newStreets(all: LongFact[], now = Date.now()): NewStreets | null {
  const runs = [...all].filter((r) => r.cells.length && r.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);
  if (runs.length < 5) return null;
  const firstAt = runs[0].startedAt;
  const seen = new Set<string>();
  const near = (key: string) => {
    const [a, b] = key.split(':').map(Number);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (seen.has(`${a + i}:${b + j}`)) return true;
    return false;
  };
  const per = new Map<number, { newM: number; knownM: number }>();
  for (const r of runs) {
    const fresh = r.cells.filter((c) => !near(c)).length;
    const share = fresh / r.cells.length;
    if (r.startedAt - firstAt >= SETTLE_DAYS * DAY) {
      const m = monthStart(r.startedAt);
      const row = per.get(m) ?? { newM: 0, knownM: 0 };
      row.newM += r.distanceM * share;
      row.knownM += r.distanceM * (1 - share);
      per.set(m, row);
    }
    for (const c of r.cells) seen.add(c);
  }
  const months = sixMonths([], now).map(({ month }) => {
    const row = per.get(month) ?? { newM: 0, knownM: 0 };
    return { month, newM: Math.round(row.newM), knownM: Math.round(row.knownM) };
  });
  const withRuns = months.filter((m) => m.newM + m.knownM > 0);
  if (withRuns.length < 2) return null;
  const best = withRuns.reduce<{ month: number; share: number } | null>((b, m) => {
    const share = m.newM / (m.newM + m.knownM);
    return !b || share > b.share ? { month: m.month, share } : b;
  }, null);
  return { months, best };
}

// ---- M4: following the light ---------------------------------------------------------------

export interface LightRuns {
  /** Each run in the last year: when it started, as days ago and minutes after midnight. */
  runs: Array<{ daysAgo: number; minute: number; dark: boolean }>;
  /** Sunrise and sunset, minutes after midnight, for each week of the year, oldest first. */
  weeks: Array<{ daysAgo: number; sunrise: number | null; sunset: number | null }>;
  inLight: number;
  inDark: number;
}

const minuteOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
};

/** Start times against sunrise and sunset, worked out on the phone. Needs 20 runs over three months. */
export function followLight(all: LongFact[], now = Date.now()): LightRuns | null {
  const runs = all.filter((r) => r.lat != null && r.lon != null && r.startedAt > now - YEAR && r.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);
  if (runs.length < 20 || runs[runs.length - 1].startedAt - runs[0].startedAt < 90 * DAY) return null;
  const out: LightRuns['runs'] = [];
  let inLight = 0;
  let inDark = 0;
  for (const r of runs) {
    const sun = sunTimes(r.startedAt, r.lat!, r.lon!);
    const end = r.startedAt + r.durationS * 1000;
    const dark = sun.sunrise != null && sun.sunset != null ? r.startedAt < sun.sunrise || end > sun.sunset : false;
    if (dark) inDark++;
    else inLight++;
    out.push({ daysAgo: Math.round((now - r.startedAt) / DAY), minute: minuteOf(r.startedAt), dark });
  }
  const here = runs[runs.length - 1];
  const weeks: LightRuns['weeks'] = [];
  for (let k = 52; k >= 0; k--) {
    const t = now - k * 7 * DAY;
    const sun = sunTimes(t, here.lat!, here.lon!);
    weeks.push({ daysAgo: k * 7, sunrise: sun.sunrise != null ? minuteOf(sun.sunrise) : null, sunset: sun.sunset != null ? minuteOf(sun.sunset) : null });
  }
  return { runs: out, weeks, inLight, inDark };
}

// ---- M5: your energy sweet spot ------------------------------------------------------------

export type Effort = 'easier' | 'usual' | 'harder';
export type Length = 'short' | 'mid' | 'long' | 'longer';
export const EFFORTS: Effort[] = ['easier', 'usual', 'harder'];
export const LENGTHS: Length[] = ['short', 'mid', 'long', 'longer'];

export interface SweetSpot {
  /** Mean energy change (after minus before) for each length and effort; null with fewer than 3 runs. */
  cells: Record<Length, Record<Effort, { lift: number | null; n: number }>>;
  best: { length: Length; effort: Effort; lift: number } | null;
  n: number;
}

const MIN_CELL = 3;

function lengthOf(s: number): Length {
  return s < 30 * 60 ? 'short' : s < 45 * 60 ? 'mid' : s < 60 * 60 ? 'long' : 'longer';
}

/** Run length and effort (against your own usual pace) against how your energy changed. Needs 15 runs with both answers. */
export function sweetSpot(all: LongFact[], now = Date.now()): SweetSpot | null {
  const runs = all.filter((r) => r.startedAt > now - YEAR && r.startedAt <= now);
  const usual = median(runs.map(adjustedPace).filter((p): p is number => p != null));
  if (usual == null) return null;
  const rated = runs.filter((r) => r.moodBefore != null && r.moodAfter != null && adjustedPace(r) != null);
  if (rated.length < 15) return null;
  const sums = {} as Record<Length, Record<Effort, { sum: number; n: number }>>;
  for (const l of LENGTHS) sums[l] = { easier: { sum: 0, n: 0 }, usual: { sum: 0, n: 0 }, harder: { sum: 0, n: 0 } };
  for (const r of rated) {
    const p = adjustedPace(r)!;
    const effort: Effort = p > usual * 1.04 ? 'easier' : p < usual * 0.96 ? 'harder' : 'usual';
    const c = sums[lengthOf(r.durationS)][effort];
    c.sum += r.moodAfter! - r.moodBefore!;
    c.n++;
  }
  const cells = {} as SweetSpot['cells'];
  let best: SweetSpot['best'] = null;
  for (const l of LENGTHS) {
    cells[l] = {} as Record<Effort, { lift: number | null; n: number }>;
    for (const e of EFFORTS) {
      const c = sums[l][e];
      const lift = c.n >= MIN_CELL ? Math.round((c.sum / c.n) * 10) / 10 : null;
      cells[l][e] = { lift, n: c.n };
      if (lift != null && lift > 0 && (!best || lift > best.lift)) best = { length: l, effort: e, lift };
    }
  }
  return { cells, best, n: rated.length };
}

// ---- M6: your loop, settling ----------------------------------------------------------------

export interface LoopMonths {
  placeId: number;
  name: string;
  loopM: number;
  months: Array<{ month: number; times: number[]; mid: number | null }>;
  /** Spread (slowest minus quickest, seconds) in the first and the last month shown. */
  firstSpread: number;
  lastSpread: number;
}

/** Times on each of your places, scaled to the loop's length, month by month. Needs three months with two runs each. */
export function loopsSettling(all: LongFact[], places: Array<{ id: number; name: string; distanceM: number }>, now = Date.now()): LoopMonths[] {
  const out: LoopMonths[] = [];
  for (const p of places) {
    if (p.distanceM < 500) continue;
    const runs = all.filter((r) => r.placeId === p.id && Math.abs(r.distanceM - p.distanceM) <= p.distanceM * 0.1 && r.durationS > 0);
    const months = sixMonths(runs, now).map(({ month, runs: rs }) => {
      const times = rs.map((r) => Math.round((r.durationS * p.distanceM) / r.distanceM));
      return { month, times, mid: times.length >= 2 ? median(times) : null };
    });
    const shown = months.filter((m) => m.mid != null);
    if (shown.length < 3) continue;
    const spread = (t: number[]) => Math.max(...t) - Math.min(...t);
    out.push({ placeId: p.id, name: p.name, loopM: p.distanceM, months, firstSpread: spread(shown[0].times), lastSpread: spread(shown[shown.length - 1].times) });
  }
  return out.sort((a, b) => b.months.reduce((s, m) => s + m.times.length, 0) - a.months.reduce((s, m) => s + m.times.length, 0)).slice(0, 2);
}

// ---- All together --------------------------------------------------------------------------

export interface DeepLong {
  durability: Durability | null;
  hills: HillMonths | null;
  streets: NewStreets | null;
  light: LightRuns | null;
  sweet: SweetSpot | null;
  loops: LoopMonths[];
}

export function deepLong(all: LongFact[], places: Array<{ id: number; name: string; distanceM: number }>, now = Date.now()): DeepLong {
  return {
    durability: durability(all, now),
    hills: hillMonths(all, now),
    streets: newStreets(all, now),
    light: followLight(all, now),
    sweet: sweetSpot(all, now),
    loops: loopsSettling(all, places, now),
  };
}

export { cellOf };
