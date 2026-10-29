// You vs you. Personal bests and trends against your own past runs, never
// anyone else's. Pure functions with no React Native imports, so
// `npm run test:progress` can check them under plain Node.
//
// The rules: compare in weeks, not days (six-week windows, medians), name the
// method behind every number, and say nothing when nothing stands out.

import { finish, monthName } from './i18n/lang';
import { voice } from './i18n/voice';

export type EffortKey = '1k' | 'mile' | '5k' | '10k' | 'half' | 'full';

export const EFFORTS: Array<{ key: EffortKey; m: number; label: string }> = [
  { key: '1k', m: 1000, label: '1 km' },
  { key: 'mile', m: 1609.344, label: '1 mile' },
  { key: '5k', m: 5000, label: '5 km' },
  { key: '10k', m: 10000, label: '10 km' },
  { key: 'half', m: 21097.5, label: 'half marathon' },
  { key: 'full', m: 42195, label: 'marathon' },
];

/** Fastest seconds over each distance, found anywhere inside one run. */
export type Efforts = Partial<Record<EffortKey, number>>;

export interface TimedPoint {
  ts: number; // epoch ms
  lat: number;
  lon: number;
}

/** What the progress maths needs from a stored run. */
export interface RunFacts {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  moodBefore: number | null;
  moodAfter: number | null;
  efforts: Efforts;
}

const DAY = 86400 * 1000;
const WEEK = 7 * DAY;
const WINDOW = 42 * DAY; // six weeks
const RIEGEL = 1.06;
/** Nothing faster than this per km counts: 2:40/km is past world-record pace, so it's GPS noise. */
const FASTEST_S_PER_KM = 160;
/** Simple climb adjustment: about 7 s/km for every 10 m of climbing per km. */
const CLIMB_S_PER_M_PER_KM = 0.7;

function dist(a: TimedPoint, b: TimedPoint): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cumulative distance and active time along a run. Points stop arriving while
 * paused, so a long gap between two fixes is mostly standing still: it only
 * counts for as long as it would take to cover that gap at the pace you were
 * going. Jumps faster than 12 m/s are GPS glitches and are skipped.
 */
export function track(points: TimedPoint[]): { d: number[]; t: number[] } {
  const d = [0];
  const t = [0];
  let speed = 2.5;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].ts - points[i - 1].ts) / 1000;
    const dd = dist(points[i - 1], points[i]);
    let step = dd;
    let time = dt;
    if (dt <= 0 || dd / Math.max(dt, 0.001) > 12) {
      step = 0;
      time = 0;
    } else if (dt > 15) {
      time = Math.min(dt, dd / Math.max(speed, 1));
    } else if (dd > 0) {
      speed = 0.7 * speed + 0.3 * (dd / dt);
    }
    d.push(d[i - 1] + step);
    t.push(t[i - 1] + time);
  }
  return { d, t };
}

/** Fastest time over `target` metres: a sliding window with interpolation at the start edge. */
function fastest(d: number[], t: number[], target: number): number | null {
  let best: number | null = null;
  let i = 0;
  for (let j = 1; j < d.length; j++) {
    if (d[j] < target) continue;
    while (i + 1 < j && d[j] - d[i + 1] >= target) i++;
    const startD = d[j] - target;
    const span = d[i + 1] - d[i];
    const f = span > 0 ? (startD - d[i]) / span : 0;
    const startT = t[i] + f * (t[i + 1] - t[i]);
    const s = t[j] - startT;
    if (s > 0 && (best == null || s < best)) best = s;
  }
  return best;
}

export function bestEfforts(points: TimedPoint[]): Efforts {
  const { d, t } = track(points);
  const out: Efforts = {};
  for (const e of EFFORTS) {
    const s = fastest(d, t, e.m);
    if (s != null && s >= (e.m / 1000) * FASTEST_S_PER_KM) out[e.key] = Math.round(s);
  }
  return out;
}

// ---- Bests ---------------------------------------------------------------------

export type BestKey = EffortKey | 'longest' | 'climb';

export interface Best {
  key: BestKey;
  value: number; // seconds for efforts, metres for longest/climb
  runId: number;
  at: number;
}

/** All-time bests, or bests since `since` (e.g. the last 90 days). */
export function bests(runs: RunFacts[], since = 0): Best[] {
  const pool = runs.filter((r) => r.startedAt >= since);
  const out: Best[] = [];
  for (const e of EFFORTS) {
    let b: Best | null = null;
    for (const r of pool) {
      const s = r.efforts[e.key];
      if (s != null && (b == null || s < b.value)) b = { key: e.key, value: s, runId: r.id, at: r.startedAt };
    }
    if (b) out.push(b);
  }
  let longest: Best | null = null;
  let climb: Best | null = null;
  for (const r of pool) {
    if (r.distanceM > 0 && (longest == null || r.distanceM > longest.value)) longest = { key: 'longest', value: r.distanceM, runId: r.id, at: r.startedAt };
    if (r.elevationGainM > 0 && (climb == null || r.elevationGainM > climb.value)) climb = { key: 'climb', value: r.elevationGainM, runId: r.id, at: r.startedAt };
  }
  if (longest) out.push(longest);
  if (climb) out.push(climb);
  return out;
}

// ---- Baselines -----------------------------------------------------------------

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Seconds per km with hilly runs nudged back towards flat. */
export function adjustedPace(r: { distanceM: number; durationS: number; elevationGainM: number }): number | null {
  if (r.distanceM < 1000 || r.durationS <= 0) return null;
  const km = r.distanceM / 1000;
  return r.durationS / km - CLIMB_S_PER_M_PER_KM * (r.elevationGainM / km);
}

/** Riegel: what an effort over `m` metres says about a 5 km. */
export function fiveKEquivalent(seconds: number, m: number): number {
  return seconds * Math.pow(5000 / m, RIEGEL);
}

/** Best 5 km equivalent from efforts of 3 km or more in a set of runs. */
function fitness(runs: RunFacts[]): number | null {
  let best: number | null = null;
  const consider = (s: number, m: number) => {
    const v = fiveKEquivalent(s, m);
    if (best == null || v < best) best = v;
  };
  for (const r of runs) {
    for (const e of EFFORTS) {
      const s = r.efforts[e.key];
      if (s != null && e.m >= 3000) consider(s, e.m);
    }
    if (r.distanceM >= 3000 && r.durationS > 0) consider(r.durationS, r.distanceM);
  }
  return best;
}

function between(runs: RunFacts[], from: number, to: number): RunFacts[] {
  return runs.filter((r) => r.startedAt >= from && r.startedAt < to);
}

/** Monday 00:00 local of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export interface Trends {
  /** Best 5 km equivalent, last six weeks vs the six before. */
  fitness: { now: number; before: number | null; series: number[] } | null;
  /** Median climb-adjusted pace (s/km), last six weeks vs the six before. */
  pace: { now: number; before: number | null; series: number[] } | null;
  /** Running seconds this week vs the average of the four full weeks before. */
  week: { now: number; usual: number | null; bars: number[] };
  /** Average energy change per run, with the time of day that lifts you most. */
  recharge: { avg: number; best: 'morning' | 'midday' | 'evening' | null } | null;
  /** Which of the last 12 weeks had a run, oldest first. */
  rhythm: boolean[];
}

export function trends(runs: RunFacts[], now = Date.now()): Trends {
  // Rolling six-week values at weekly steps, for the little lines.
  const steps = 8;
  const fitSeries: number[] = [];
  const paceSeries: number[] = [];
  for (let k = steps - 1; k >= 0; k--) {
    const end = now - k * WEEK;
    const win = between(runs, end - WINDOW, end + 1);
    const f = fitness(win);
    const p = median(win.map(adjustedPace).filter((x): x is number => x != null));
    if (f != null) fitSeries.push(f);
    if (p != null) paceSeries.push(p);
  }
  const recent = between(runs, now - WINDOW, now + 1);
  const prior = between(runs, now - 2 * WINDOW, now - WINDOW);
  const fNow = fitness(recent);
  const pNow = median(recent.map(adjustedPace).filter((x): x is number => x != null));
  const pBefore = median(prior.map(adjustedPace).filter((x): x is number => x != null));

  const thisWeek = weekStart(now);
  const bars: number[] = [];
  for (let k = 5; k >= 0; k--) {
    const from = thisWeek - k * WEEK;
    bars.push(between(runs, from, from + WEEK).reduce((a, r) => a + r.durationS, 0));
  }
  const prev4 = [1, 2, 3, 4].map((k) => between(runs, thisWeek - k * WEEK, thisWeek - (k - 1) * WEEK).reduce((a, r) => a + r.durationS, 0));
  const hadHistory = runs.some((r) => r.startedAt < thisWeek - WEEK);

  const rated = runs.filter((r) => r.moodBefore != null && r.moodAfter != null);
  let recharge: Trends['recharge'] = null;
  if (rated.length >= 8) {
    const last = rated.slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 20);
    const avg = last.reduce((a, r) => a + (r.moodAfter! - r.moodBefore!), 0) / last.length;
    const buckets: Record<'morning' | 'midday' | 'evening', number[]> = { morning: [], midday: [], evening: [] };
    for (const r of rated) {
      const h = new Date(r.startedAt).getHours();
      buckets[h < 11 ? 'morning' : h < 16 ? 'midday' : 'evening'].push(r.moodAfter! - r.moodBefore!);
    }
    // Only name a time of day when there's something to compare it with and it clearly wins.
    const avgs = (['morning', 'midday', 'evening'] as const)
      .filter((k) => buckets[k].length >= 3)
      .map((k) => ({ k, a: buckets[k].reduce((s, x) => s + x, 0) / buckets[k].length }))
      .sort((x, y) => y.a - x.a);
    const best = avgs.length >= 2 && avgs[0].a - avgs[1].a >= 0.25 ? avgs[0].k : null;
    recharge = { avg, best };
  }

  const rhythm: boolean[] = [];
  for (let k = 11; k >= 0; k--) {
    const from = thisWeek - k * WEEK;
    rhythm.push(between(runs, from, from + WEEK).length > 0);
  }

  return {
    fitness: fNow != null ? { now: fNow, before: fitness(prior), series: fitSeries } : null,
    pace: pNow != null && recent.length >= 3 ? { now: pNow, before: prior.length >= 3 ? pBefore : null, series: paceSeries } : null,
    week: { now: bars[bars.length - 1], usual: hadHistory ? prev4.reduce((a, b) => a + b, 0) / 4 : null, bars },
    recharge,
    rhythm,
  };
}

// ---- The one line on the finish screen -----------------------------------------

/** Everything worth knowing about one run compared with the runs before it. */
export interface Comparison {
  /** A new all-time best over a distance (largest distance wins). */
  best: { key: EffortKey; label: string; seconds: number; marginS: number | null; previousAt: number | null } | null;
  /** Fastest over a distance in 90 days, when the all-time best is older. */
  recentBest: { key: EffortKey; label: string; seconds: number } | null;
  /** Days since the run before this one. */
  gapDays: number | null;
  longest: 'ever' | 'months' | null;
  recharge: number | null; // after minus before
  /** Climb-adjusted pace minus your six-week median (negative = quicker), s/km. */
  baselineDeltaS: number | null;
  runsThisWeek: number; // including this one
  slowestThisMonth: boolean;
  firstRun: boolean;
}

export function compare(run: RunFacts, history: RunFacts[]): Comparison {
  const before = history.filter((r) => r.id !== run.id && r.startedAt < run.startedAt);
  let best: Comparison['best'] = null;
  let recentBest: Comparison['recentBest'] = null;
  for (const e of [...EFFORTS].reverse()) {
    const s = run.efforts[e.key];
    if (s == null) continue;
    let prev: RunFacts | null = null;
    for (const r of before) {
      const p = r.efforts[e.key];
      if (p != null && (prev == null || p < prev.efforts[e.key]!)) prev = r;
    }
    if (!best && before.length > 0 && (prev == null || s < prev.efforts[e.key]!)) {
      best = { key: e.key, label: e.label, seconds: s, marginS: prev ? prev.efforts[e.key]! - s : null, previousAt: prev?.startedAt ?? null };
    }
    if (!recentBest && prev && s >= prev.efforts[e.key]!) {
      const recent = before.filter((r) => r.startedAt >= run.startedAt - 90 * DAY && r.efforts[e.key] != null);
      if (recent.length >= 2 && recent.every((r) => s < r.efforts[e.key]!)) recentBest = { key: e.key, label: e.label, seconds: s };
    }
  }
  const last = before.reduce<RunFacts | null>((a, r) => (a == null || r.startedAt > a.startedAt ? r : a), null);
  const gapDays = last ? Math.floor((run.startedAt - last.startedAt) / DAY) : null;

  let longest: Comparison['longest'] = null;
  if (before.length >= 3) {
    if (before.every((r) => r.distanceM < run.distanceM)) longest = 'ever';
    else {
      const recent = before.filter((r) => r.startedAt >= run.startedAt - 60 * DAY);
      if (recent.length >= 3 && recent.every((r) => r.distanceM < run.distanceM)) longest = 'months';
    }
  }

  const recharge = run.moodBefore != null && run.moodAfter != null ? run.moodAfter - run.moodBefore : null;

  let baselineDeltaS: number | null = null;
  const mine = adjustedPace(run);
  const window = before.filter((r) => r.startedAt >= run.startedAt - WINDOW);
  const base = median(window.map(adjustedPace).filter((x): x is number => x != null));
  if (mine != null && base != null && window.length >= 4) baselineDeltaS = mine - base;

  const wk = weekStart(run.startedAt);
  const runsThisWeek = before.filter((r) => r.startedAt >= wk).length + 1;

  const month = new Date(run.startedAt);
  const sameMonth = before.filter((r) => {
    const d = new Date(r.startedAt);
    return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  });
  const myPace = run.distanceM > 1000 ? run.durationS / run.distanceM : null;
  const slowestThisMonth =
    myPace != null && sameMonth.length >= 3 && sameMonth.every((r) => r.distanceM <= 1000 || r.durationS / r.distanceM < myPace);

  return { best, recentBest, gapDays, longest, recharge, baselineDeltaS, runsThisWeek, slowestThisMonth, firstRun: before.length === 0 };
}

export function formatClock(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * The single you-vs-you line: a headline and one detail sentence. A best wins,
 * then a comeback, a longest run, a big recharge, then the baseline. Returns
 * null when nothing stands out, which is most runs, and that's fine.
 */
export function youVsYou(c: Comparison, km = true): { title: string; detail: string } | null {
  const y = voice().you;
  const line = (l: { title: string; detail: string }) => ({ title: finish(l.title), detail: finish(l.detail) });
  if (c.best) {
    if (c.best.marginS == null) return line(y.bestFirst(c.best.key, formatClock(c.best.seconds)));
    return line(y.best(c.best.key, formatClock(c.best.seconds), c.best.marginS, c.best.previousAt ? monthName(c.best.previousAt) : null));
  }
  if (c.gapDays != null && c.gapDays >= 14) return line(y.welcomeBack(c.gapDays));
  if (c.recentBest) return line(y.recentBest(c.recentBest.key, formatClock(c.recentBest.seconds)));
  if (c.longest === 'ever') return line(y.longestEver);
  if (c.longest === 'months') return line(y.longestMonths);
  if (c.recharge != null && c.recharge >= 2) return line(y.recharge(c.recharge));
  if (c.baselineDeltaS != null) {
    const d = Math.round(Math.abs(c.baselineDeltaS) * (km ? 1 : 1.609344));
    if (c.baselineDeltaS <= -5) return line(y.quicker(d, km));
    if (c.baselineDeltaS >= 10 && c.recharge != null && c.recharge >= 1) return line(y.slowerGood);
  }
  return null;
}
