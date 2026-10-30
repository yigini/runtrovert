// Deep stats: what "Show me everything" opens. The run page stays calm; these
// are for the runner who wants to look under the bonnet. One run is free, as
// every single-run stat is. The months view reads a year of runs, so it comes
// with Everything, once (the screen asks isUnlocked(), never this module).
//
// Pure, no network, no React Native, so `npm run test:deep` checks it under Node.
// Numbers only: the words live in the i18n file and are put together on screen.

import { adjustedPace, track, weekStart } from './progress';
import { distanceTime, elevationSeries, interp, type StatPoint } from './runStats';
import type { HeartSample } from './heart';

const DAY = 86400 * 1000;
const YEAR = 365 * DAY;
const GAP_MS = 30_000; // same as heart.ts: a longer silence is the watch off the wrist
const STEP_M = 25;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Spread of km paces as a share of their mean, in percent. */
export function wobblePct(kmPaces: number[]): number | null {
  if (kmPaces.length < 3) return null;
  const m = mean(kmPaces)!;
  const sd = Math.sqrt(kmPaces.reduce((a, p) => a + (p - m) ** 2, 0) / kmPaces.length);
  return (sd / m) * 100;
}

// ---- One run ------------------------------------------------------------------

/** even: within a couple of percent. negative: quicker second half. faded: slower second half.
 *  lateKick: even, then a quick last km. wandering: no shape, lots of change. */
export type SplitShape = 'even' | 'negative' | 'faded' | 'lateKick' | 'wandering';

export interface DeepRunInput {
  points: StatPoint[];
  kmPaces: number[]; // s/km of each full km (or mile) split, in order
  heart: HeartSample[]; // cleaned (heart.ts cleanHeart)
  maxHr: number | null; // highest heart rate this phone has seen, for zones
}

export interface DeepRun {
  /** How much the km paces wander, in percent, with the quickest and slowest km (1-based). */
  wobble: { pct: number; quickest: number; slowest: number } | null;
  /** The shape of the splits, and the second half against the first in percent (minus = quicker). */
  shape: { kind: SplitShape; diffPct: number } | null;
  /** Longest stretch where the pace held within ±3%. */
  steady: { m: number; pace: number; fromM: number } | null;
  /** Pace going up (over +2%), down (under −2%) and on the flat, with the metres of each. */
  grade: { up: Bucket | null; down: Bucket | null; flat: Bucket | null } | null;
  /** Aerobic decoupling: pace per heartbeat, first half against second. Plus = the heart worked harder for the same pace. */
  drift: { pct: number; firstBpm: number; secondBpm: number } | null;
  /** Seconds in each of five zones, as a share of the highest heart rate seen. */
  zones: { maxHr: number; seconds: number[] } | null;
}

export interface Bucket {
  pace: number; // s/km
  m: number;
}

export const STEADY_BAND = 0.03;
export const ZONE_EDGES = [0.6, 0.7, 0.8, 0.9]; // share of max: under 60%, 60–70, 70–80, 80–90, 90 and over

function halvesDiffPct(kmPaces: number[]): number {
  const h = kmPaces.length / 2;
  // Half a km at the middle of an odd count goes to each side.
  let first = 0;
  let second = 0;
  kmPaces.forEach((p, i) => {
    const inFirst = Math.max(0, Math.min(1, h - i));
    first += p * inFirst;
    second += p * (1 - inFirst);
  });
  return ((second - first) / first) * 100;
}

export function splitShape(kmPaces: number[]): DeepRun['shape'] {
  if (kmPaces.length < 3) return null;
  const n = kmPaces.length;
  const diffPct = halvesDiffPct(kmPaces);
  const before = kmPaces.slice(0, -1);
  const last = kmPaces[n - 1];
  let kind: SplitShape;
  // A kick at the end would read as a negative split; it's its own shape when the rest was even.
  if (last <= median(before)! * 0.95 && Math.abs(halvesDiffPct(before)) < 2) kind = 'lateKick';
  else if (diffPct <= -2) kind = 'negative';
  else if (diffPct >= 3) kind = 'faded';
  else if (wobblePct(kmPaces)! > 6) kind = 'wandering';
  else kind = 'even';
  return { kind, diffPct: Math.round(diffPct * 10) / 10 };
}

/** Pace every 25 m over a 200 m window, unthinned. */
function finePace(d: number[], t: number[]): number[] {
  const total = d[d.length - 1] ?? 0;
  const out: number[] = [];
  for (let x = 0; x <= total; x += STEP_M) {
    const a = Math.max(0, x - 100);
    const b = Math.min(total, x + 100);
    if (b - a < 100) {
      out.push(NaN);
      continue;
    }
    out.push(((interp(d, t, b) - interp(d, t, a)) / (b - a)) * 1000);
  }
  return out;
}

/** Longest run of 25 m steps whose pace stays inside ±band of the stretch's middle. */
export function steadyStretch(d: number[], t: number[], band = STEADY_BAND): DeepRun['steady'] {
  const total = d[d.length - 1] ?? 0;
  if (total < 1000) return null;
  const p = finePace(d, t);
  const ratio = (1 + band) / (1 - band);
  let best: { i: number; j: number } | null = null;
  // Two pointers with monotone queues for the max and min inside the window.
  const maxQ: number[] = [];
  const minQ: number[] = [];
  let i = 0;
  for (let j = 0; j < p.length; j++) {
    if (!isFinite(p[j]) || p[j] > 1200) {
      maxQ.length = 0;
      minQ.length = 0;
      i = j + 1;
      continue;
    }
    while (maxQ.length && p[maxQ[maxQ.length - 1]] <= p[j]) maxQ.pop();
    maxQ.push(j);
    while (minQ.length && p[minQ[minQ.length - 1]] >= p[j]) minQ.pop();
    minQ.push(j);
    while (p[maxQ[0]] / p[minQ[0]] > ratio) {
      i++;
      if (maxQ[0] < i) maxQ.shift();
      if (minQ[0] < i) minQ.shift();
    }
    if (!best || j - i > best.j - best.i) best = { i, j };
  }
  if (!best) return null;
  const fromM = best.i * STEP_M;
  const toM = Math.min(total, best.j * STEP_M);
  const m = toM - fromM;
  if (m < 400) return null;
  const pace = ((interp(d, t, toM) - interp(d, t, fromM)) / m) * 1000;
  return { m: Math.round(m / 10) * 10, pace, fromM };
}

export function gradePace(points: StatPoint[], d: number[], t: number[]): DeepRun['grade'] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const elev = elevationSeries(sorted, d);
  if (elev.length < 5) return null;
  const xs = elev.map((e) => e.d);
  const ys = elev.map((e) => e.v);
  const total = Math.min(d[d.length - 1], xs[xs.length - 1]);
  const sums = { up: { m: 0, s: 0 }, down: { m: 0, s: 0 }, flat: { m: 0, s: 0 } };
  const STEP = 50;
  for (let x = 0; x + STEP <= total; x += STEP) {
    const g = (interp(xs, ys, x + STEP) - interp(xs, ys, x)) / STEP;
    const s = interp(d, t, x + STEP) - interp(d, t, x);
    const k = g > 0.02 ? 'up' : g < -0.02 ? 'down' : 'flat';
    sums[k].m += STEP;
    sums[k].s += s;
  }
  const b = (k: keyof typeof sums): Bucket | null => (sums[k].m >= 200 ? { pace: (sums[k].s / sums[k].m) * 1000, m: sums[k].m } : null);
  const out = { up: b('up'), down: b('down'), flat: b('flat') };
  // A flat run has nothing to compare: say nothing rather than "all flat".
  return out.up || out.down ? out : null;
}

function avgHeart(samples: HeartSample[]): number | null {
  let w = 0;
  let time = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].ts - samples[i - 1].ts;
    if (dt <= 0 || dt > GAP_MS) continue;
    w += ((samples[i].bpm + samples[i - 1].bpm) / 2) * dt;
    time += dt;
  }
  return time >= 5 * 60_000 ? w / time : null;
}

/** Pace per heartbeat in the first half of the running time against the second. Needs 20 minutes. */
export function heartDrift(points: StatPoint[], heart: HeartSample[]): DeepRun['drift'] {
  const pts = [...points].sort((a, b) => a.ts - b.ts);
  if (pts.length < 10 || heart.length < 10) return null;
  const { d, t } = track(pts);
  const T = t[t.length - 1];
  if (T < 20 * 60) return null;
  let mid = 0;
  while (mid < t.length - 1 && t[mid] < T / 2) mid++;
  const tsMid = pts[mid].ts;
  const h1 = avgHeart(heart.filter((s) => s.ts <= tsMid));
  const h2 = avgHeart(heart.filter((s) => s.ts > tsMid));
  if (h1 == null || h2 == null) return null;
  const v1 = d[mid] / t[mid];
  const v2 = (d[d.length - 1] - d[mid]) / (T - t[mid]);
  if (!(v1 > 0) || !(v2 > 0)) return null;
  const ef1 = v1 / h1;
  const ef2 = v2 / h2;
  return { pct: Math.round(((ef1 - ef2) / ef1) * 1000) / 10, firstBpm: Math.round(h1), secondBpm: Math.round(h2) };
}

export function heartZones(heart: HeartSample[], maxHr: number | null): DeepRun['zones'] {
  if (!maxHr || maxHr < 120 || heart.length < 2) return null;
  const seconds = [0, 0, 0, 0, 0];
  for (let i = 1; i < heart.length; i++) {
    const dt = heart[i].ts - heart[i - 1].ts;
    if (dt <= 0 || dt > GAP_MS) continue;
    const share = (heart[i].bpm + heart[i - 1].bpm) / 2 / maxHr;
    let z = 0;
    while (z < ZONE_EDGES.length && share >= ZONE_EDGES[z]) z++;
    seconds[z] += dt / 1000;
  }
  if (seconds.reduce((a, b) => a + b, 0) < 5 * 60) return null;
  return { maxHr, seconds: seconds.map(Math.round) };
}

export function deepRun({ points, kmPaces, heart, maxHr }: DeepRunInput): DeepRun {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const { d, t } = sorted.length > 1 ? distanceTime(sorted) : { d: [0], t: [0] };
  const wob = wobblePct(kmPaces);
  let wobble: DeepRun['wobble'] = null;
  if (wob != null) {
    const quickest = kmPaces.indexOf(Math.min(...kmPaces)) + 1;
    const slowest = kmPaces.indexOf(Math.max(...kmPaces)) + 1;
    wobble = { pct: Math.round(wob * 10) / 10, quickest, slowest };
  }
  return {
    wobble,
    shape: splitShape(kmPaces),
    steady: steadyStretch(d, t),
    grade: sorted.length > 1 ? gradePace(sorted, d, t) : null,
    drift: heartDrift(sorted, heart),
    zones: heartZones(heart, maxHr),
  };
}

// ---- Across months --------------------------------------------------------------

export interface DeepFact {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  moodBefore: number | null;
  moodAfter: number | null;
  tempC: number | null;
  windKmh: number | null;
  placeId: number | null;
  kmPaces: number[];
}

export interface Group {
  key: string;
  n: number;
  pace: number | null; // median climb-adjusted s/km
  lift?: number | null; // mean energy after minus before
}

export interface DeepMonths {
  /** Median km wobble per month, the last six months, oldest first. */
  wobble: Array<{ month: number; pct: number | null; n: number }>;
  /** Your pace against the temperature, then against the wind. Only bands with 3 runs or more. */
  heat: Group[];
  wind: Group[];
  /** Morning (before 11), midday (before 16), evening. */
  dayPart: Array<Group & { distanceM: number | null }>;
  /** Days since the run before: next day, two or three days, four or more. */
  recovery: Group[];
  /** Your places, by quarter of the year: Dec–Feb, Mar–May, Jun–Aug, Sep–Nov. */
  places: Array<{ placeId: number; name: string; quarters: Array<{ q: number; n: number; pace: number | null }> }>;
  /** Minutes run on every day of the last 52 weeks, a week per row, Monday first, oldest week first. */
  year: { weeks: number[][]; days: number; minutes: number };
  /** Last km against the first, in percent (minus = you finish quicker). Median, and per month for six months. */
  firstLast: { pct: number; n: number; months: Array<{ month: number; pct: number | null }> } | null;
}

const MIN_GROUP = 3;

function monthStart(t: number, back = 0): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() - back, 1).getTime();
}

function group(key: string, runs: DeepFact[], withLift = false): Group {
  const paces = runs.map(adjustedPace).filter((p): p is number => p != null);
  const g: Group = { key, n: runs.length, pace: median(paces) };
  if (withLift) {
    const rated = runs.filter((r) => r.moodBefore != null && r.moodAfter != null);
    g.lift = rated.length >= MIN_GROUP ? mean(rated.map((r) => r.moodAfter! - r.moodBefore!)) : null;
  }
  return g;
}

function keep<T extends Group>(gs: T[]): T[] {
  const ok = gs.filter((g) => g.n >= MIN_GROUP && g.pace != null);
  return ok.length >= 2 ? ok : [];
}

export function lastFirstPct(kmPaces: number[]): number | null {
  if (kmPaces.length < 3) return null;
  return ((kmPaces[kmPaces.length - 1] - kmPaces[0]) / kmPaces[0]) * 100;
}

export function deepMonths(all: DeepFact[], places: Array<{ id: number; name: string }>, now = Date.now()): DeepMonths {
  const runs = all.filter((r) => r.startedAt > now - YEAR && r.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);

  const wobble: DeepMonths['wobble'] = [];
  const flMonths: Array<{ month: number; pct: number | null }> = [];
  for (let k = 5; k >= 0; k--) {
    const from = monthStart(now, k);
    const to = monthStart(now, k - 1);
    const inMonth = runs.filter((r) => r.startedAt >= from && r.startedAt < to);
    const w = inMonth.map((r) => wobblePct(r.kmPaces)).filter((x): x is number => x != null);
    wobble.push({ month: from, pct: median(w), n: w.length });
    const fl = inMonth.map((r) => lastFirstPct(r.kmPaces)).filter((x): x is number => x != null);
    flMonths.push({ month: from, pct: median(fl) });
  }

  const heat = keep([
    group('cold', runs.filter((r) => r.tempC != null && r.tempC < 8)),
    group('mild', runs.filter((r) => r.tempC != null && r.tempC >= 8 && r.tempC < 18)),
    group('warm', runs.filter((r) => r.tempC != null && r.tempC >= 18 && r.tempC < 25)),
    group('hot', runs.filter((r) => r.tempC != null && r.tempC >= 25)),
  ]);
  const wind = keep([
    group('calm', runs.filter((r) => r.windKmh != null && r.windKmh < 20)),
    group('windy', runs.filter((r) => r.windKmh != null && r.windKmh >= 20)),
  ]);

  const hour = (r: DeepFact) => new Date(r.startedAt).getHours();
  const part = (key: string, rs: DeepFact[]) => ({ ...group(key, rs, true), distanceM: median(rs.map((r) => r.distanceM)) });
  const dayPart = keep([
    part('morning', runs.filter((r) => hour(r) < 11)),
    part('midday', runs.filter((r) => hour(r) >= 11 && hour(r) < 16)),
    part('evening', runs.filter((r) => hour(r) >= 16)),
  ]);

  const gaps: Record<'next' | 'short' | 'long', DeepFact[]> = { next: [], short: [], long: [] };
  // The run before can be older than a year: look in everything.
  const ordered = [...all].sort((a, b) => a.startedAt - b.startedAt);
  for (let i = 1; i < ordered.length; i++) {
    const r = ordered[i];
    if (!runs.includes(r)) continue;
    const gap = (r.startedAt - ordered[i - 1].startedAt) / DAY;
    gaps[gap < 1.5 ? 'next' : gap < 4 ? 'short' : 'long'].push(r);
  }
  const recovery = keep([group('next', gaps.next, true), group('short', gaps.short, true), group('long', gaps.long, true)]);

  const quarter = (t: number) => Math.floor(((new Date(t).getMonth() + 1) % 12) / 3); // 0 = Dec–Feb
  const byPlace = new Map<number, DeepFact[]>();
  for (const r of runs) if (r.placeId != null) byPlace.set(r.placeId, [...(byPlace.get(r.placeId) ?? []), r]);
  const placeRows: DeepMonths['places'] = [];
  for (const p of places) {
    const rs = byPlace.get(p.id) ?? [];
    const quarters = [0, 1, 2, 3]
      .map((q) => {
        const inQ = rs.filter((r) => quarter(r.startedAt) === q);
        return { q, n: inQ.length, pace: median(inQ.map(adjustedPace).filter((x): x is number => x != null)) };
      })
      .filter((x) => x.n >= 2 && x.pace != null);
    if (quarters.length >= 2) placeRows.push({ placeId: p.id, name: p.name, quarters });
  }
  placeRows.sort((a, b) => b.quarters.reduce((s, q) => s + q.n, 0) - a.quarters.reduce((s, q) => s + q.n, 0));

  const thisWeek = weekStart(now);
  const weeks: number[][] = [];
  let days = 0;
  let minutes = 0;
  for (let k = 51; k >= 0; k--) {
    const row = [0, 0, 0, 0, 0, 0, 0];
    const from = weekStart(thisWeek - k * 7 * DAY + 3 * DAY);
    // weekStart, not from + 7 days, so a clock change inside the week can't move a run.
    for (const r of all) if (r.startedAt <= now && weekStart(r.startedAt) === from) row[(new Date(r.startedAt).getDay() + 6) % 7] += r.durationS / 60;
    weeks.push(row.map(Math.round));
    days += row.filter((m) => m > 0).length;
    minutes += row.reduce((a, b) => a + b, 0);
  }

  const fl = runs.filter((r) => r.startedAt > now - 180 * DAY).map((r) => lastFirstPct(r.kmPaces)).filter((x): x is number => x != null);
  const flMedian = median(fl);

  return {
    wobble,
    heat,
    wind,
    dayPart,
    recovery,
    places: placeRows.slice(0, 3),
    year: { weeks, days, minutes: Math.round(minutes) },
    firstLast: flMedian != null && fl.length >= 5 ? { pct: Math.round(flMedian * 10) / 10, n: fl.length, months: flMonths } : null,
  };
}
