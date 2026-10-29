// Your runs: the month summary, the run list's sections, and energy patterns.
// Pure functions with no React Native imports, so `npm run test:patterns` can
// check them under plain Node.
//
// The rules for patterns: they are the runner's own before and after answers,
// counted. Every line shows its counts and dates. No score, no "because", no
// advice: we say what happened after, never what caused it, and say nothing
// when there is too little to count.

import { weekStart } from './progress';
import type { Mood } from './types';

export interface PatternRun {
  id: number;
  startedAt: number; // epoch ms
  distanceM: number;
  durationS: number;
  moodBefore: Mood | null;
  moodAfter: Mood | null;
  /** The place this run is logged in, if any. */
  placeId?: number | null;
}

export interface PatternPlace {
  id: number;
  name: string;
}

const DAY = 86400 * 1000;
const WEEK = 7 * DAY;

// ---- Month summary and list sections ---------------------------------------------

export interface MonthSummary {
  runs: number;
  distanceM: number;
  durationS: number;
}

/** Free: this calendar month so far. */
export function monthSummary(runs: PatternRun[], now = Date.now()): MonthSummary {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const month = runs.filter((r) => r.startedAt >= from && r.startedAt < to);
  return {
    runs: month.length,
    distanceM: month.reduce((a, r) => a + r.distanceM, 0),
    durationS: month.reduce((a, r) => a + r.durationS, 0),
  };
}

export interface RunGroup<T> {
  key: string;
  title: string;
  data: T[];
}

/**
 * This week, Last week, then one section per month, newest first. `monthName`
 * turns a month's first day into its label (the screen passes the locale's).
 */
export function groupRuns<T extends { startedAt: number }>(runs: T[], now = Date.now(), monthName: (t: number) => string = defaultMonth): RunGroup<T>[] {
  const thisWeek = weekStart(now);
  const lastWeek = thisWeek - WEEK;
  const year = new Date(now).getFullYear();
  const out: RunGroup<T>[] = [];
  const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
  for (const r of sorted) {
    let key: string;
    let title: string;
    if (r.startedAt >= thisWeek) {
      key = 'this-week';
      title = 'This week';
    } else if (r.startedAt >= lastWeek) {
      key = 'last-week';
      title = 'Last week';
    } else {
      const d = new Date(r.startedAt);
      const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      key = `m-${d.getFullYear()}-${d.getMonth()}`;
      title = d.getFullYear() === year ? monthName(first) : `${monthName(first)} ${d.getFullYear()}`;
    }
    const last = out[out.length - 1];
    if (last && last.key === key) last.data.push(r);
    else out.push({ key, title, data: [r] });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function defaultMonth(t: number): string {
  return MONTHS[new Date(t).getMonth()];
}

// ---- Energy patterns ---------------------------------------------------------------

/** How the screen writes dates and distances; plain defaults so tests read easily. */
export interface PatternFormat {
  date: (t: number) => string;
  distance: (m: number) => string;
}

const PLAIN: PatternFormat = {
  date: (t) => {
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  },
  distance: (m) => `${(m / 1000).toFixed(1)} km`,
};

export type Change = 'up' | 'same' | 'down';

export type PatternKey = 'lift' | 'shortWeekday' | 'places' | 'timeOfDay';

export interface Insight {
  key: PatternKey;
  /** The name of the pattern, also used on its lock row. */
  title: string;
  /** One plain observation, or a line saying what it is waiting for. */
  line: string;
  /** Counts and dates behind the line. */
  detail: string;
  /** False while there are too few runs to count. */
  ready: boolean;
  /** For "lift": each of the counted runs, oldest first. */
  changes?: Change[];
  /** Extra rows, e.g. one per place or per time of day. */
  rows?: Array<{ label: string; value: string }>;
}

export interface Patterns {
  /** Free: what happened to your energy over your last runs. */
  first: Insight;
  /** The ones that read months of runs: behind the unlock. */
  more: Insight[];
}

export const TITLES: Record<PatternKey, string> = {
  lift: 'Your energy, before and after',
  shortWeekday: 'Shorter weekday runs and your energy',
  places: 'Places you most often go back to',
  timeOfDay: 'The time of day you finish happiest',
};

/** Runs with both check-ins counted for "lift". */
export const LIFT_RUNS = 10;
export const LIFT_MIN = 5;
/** Weekday runs with both check-ins, and at least this many on each side of the split. */
export const WEEKDAY_MIN = 8;
export const WEEKDAY_SIDE_MIN = 4;
/** Runs logged in one place before it is named here. */
export const PLACE_MIN = 3;
/** Runs in a time of day before it is compared; at least two times of day. */
export const TIME_MIN = 3;
/** Patterns that read months look back this far. */
export const LOOK_BACK_DAYS = 180;
/** A difference in share smaller than this is reported as "about the same". */
const CLEAR = 0.2;

function rated(runs: PatternRun[]): Array<PatternRun & { moodBefore: Mood; moodAfter: Mood }> {
  return runs.filter((r): r is PatternRun & { moodBefore: Mood; moodAfter: Mood } => r.moodBefore != null && r.moodAfter != null);
}

export function change(r: { moodBefore: Mood; moodAfter: Mood }): Change {
  return r.moodAfter > r.moodBefore ? 'up' : r.moodAfter < r.moodBefore ? 'down' : 'same';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function span(fmt: PatternFormat, list: Array<{ startedAt: number }>): string {
  const ts = list.map((r) => r.startedAt);
  const from = Math.min(...ts);
  const to = Math.max(...ts);
  const a = fmt.date(from);
  const b = fmt.date(to);
  return a === b ? a : `${a} to ${b}`;
}

function waiting(key: PatternKey, need: string, have: number, one: string, many?: string): Insight {
  return {
    key,
    title: TITLES[key],
    line: need,
    detail: have === 0 ? `None yet.` : `${plural(have, one, many)} so far.`,
    ready: false,
  };
}

/** Free: of your last ten runs with both check-ins, how many ended with more energy. */
export function lift(runs: PatternRun[], fmt: PatternFormat = PLAIN): Insight {
  const last = rated(runs)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, LIFT_RUNS);
  if (last.length < LIFT_MIN) {
    return waiting('lift', `Shows up after ${LIFT_MIN} runs where you answered both energy questions.`, last.length, 'run');
  }
  const changes = last.map(change).reverse();
  const n = changes.length;
  const up = changes.filter((c) => c === 'up').length;
  const same = changes.filter((c) => c === 'same').length;
  const down = n - up - same;
  // Lead with whatever happened most; ties go to "more", then "the same".
  const line =
    up >= same && up >= down
      ? `You had more energy after ${up} of your last ${n} runs.`
      : same >= down
        ? `Your energy stayed the same after ${same} of your last ${n} runs.`
        : `You had less energy after ${down} of your last ${n} runs.`;
  return {
    key: 'lift',
    title: TITLES.lift,
    line,
    detail: `${up} more, ${same} the same, ${down} less. From your before and after check-ins, ${span(fmt, last)}. No score, just your answers counted.`,
    ready: true,
    changes,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function recent<T extends { startedAt: number }>(runs: T[], now: number): T[] {
  return runs.filter((r) => r.startedAt >= now - LOOK_BACK_DAYS * DAY && r.startedAt <= now);
}

/** Weekday runs split at your own middle distance: how often each half ended with more energy. */
export function shortWeekday(runs: PatternRun[], now = Date.now(), fmt: PatternFormat = PLAIN): Insight {
  const week = rated(recent(runs, now)).filter((r) => {
    const d = new Date(r.startedAt).getDay();
    return d >= 1 && d <= 5;
  });
  if (week.length < WEEKDAY_MIN) {
    return waiting('shortWeekday', `Shows up after ${WEEKDAY_MIN} weekday runs where you answered both energy questions.`, week.length, 'weekday run');
  }
  const mid = median(week.map((r) => r.distanceM));
  const short = week.filter((r) => r.distanceM < mid);
  const long = week.filter((r) => r.distanceM >= mid);
  if (short.length < WEEKDAY_SIDE_MIN || long.length < WEEKDAY_SIDE_MIN) {
    return waiting('shortWeekday', 'Your weekday runs are mostly the same length, so there is nothing to compare yet.', week.length, 'weekday run');
  }
  const su = short.filter((r) => change(r) === 'up').length;
  const lu = long.filter((r) => change(r) === 'up').length;
  const rs = su / short.length;
  const rl = lu / long.length;
  const line =
    rs - rl >= CLEAR
      ? 'Your shorter weekday runs more often ended with more energy.'
      : rl - rs >= CLEAR
        ? 'Your longer weekday runs more often ended with more energy.'
        : 'Shorter and longer weekday runs ended with more energy about as often.';
  const d = fmt.distance(mid);
  return {
    key: 'shortWeekday',
    title: TITLES.shortWeekday,
    line,
    detail: `Weekday runs with both check-ins, ${span(fmt, week)}. Split at ${d}, the middle of your own distances.`,
    ready: true,
    rows: [
      { label: `Under ${d}`, value: `more energy after ${su} of ${short.length}` },
      { label: `${d} or more`, value: `more energy after ${lu} of ${long.length}` },
    ],
  };
}

/** The places you log most, how often, and what your energy did there when you said. */
export function placesBack(runs: PatternRun[], places: PatternPlace[], now = Date.now(), fmt: PatternFormat = PLAIN): Insight {
  const byPlace = new Map<number, PatternRun[]>();
  for (const r of recent(runs, now)) {
    if (r.placeId == null) continue;
    const list = byPlace.get(r.placeId) ?? [];
    list.push(r);
    byPlace.set(r.placeId, list);
  }
  const names = new Map(places.map((p) => [p.id, p.name]));
  const top = [...byPlace.entries()]
    .filter(([id, list]) => names.has(id) && list.length >= PLACE_MIN)
    .sort((a, b) => b[1].length - a[1].length || Math.max(...b[1].map((r) => r.startedAt)) - Math.max(...a[1].map((r) => r.startedAt)))
    .slice(0, 3);
  if (top.length === 0) {
    const most = Math.max(0, ...[...byPlace.values()].map((l) => l.length));
    return waiting('places', `Shows up once you have run one of your places ${PLACE_MIN} times.`, most, 'run in one place', 'runs in one place');
  }
  const [firstId, firstRuns] = top[0];
  const all = top.flatMap(([, l]) => l);
  return {
    key: 'places',
    title: TITLES.places,
    line: `You went back to ${names.get(firstId)} most: ${plural(firstRuns.length, 'run')} since ${fmt.date(Math.min(...firstRuns.map((r) => r.startedAt)))}.`,
    detail: `Runs logged in your places, ${span(fmt, all)}.`,
    ready: true,
    rows: top.map(([id, list]) => {
      const r = rated(list);
      const up = r.filter((x) => change(x) === 'up').length;
      return {
        label: names.get(id)!,
        value: `${plural(list.length, 'run')}` + (r.length >= PLACE_MIN ? `, more energy after ${up} of ${r.length}` : ''),
      };
    }),
  };
}

export type DayPart = 'morning' | 'midday' | 'evening';
const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', midday: 'Midday', evening: 'Evening' };

export function dayPart(t: number): DayPart {
  const h = new Date(t).getHours();
  return h < 11 ? 'morning' : h < 16 ? 'midday' : 'evening';
}

/** Which time of day most often ended on Good or Recharged (4 or 5 of 5). */
export function timeOfDay(runs: PatternRun[], now = Date.now(), fmt: PatternFormat = PLAIN): Insight {
  const list = rated(recent(runs, now));
  const parts = (['morning', 'midday', 'evening'] as DayPart[])
    .map((p) => {
      const rs = list.filter((r) => dayPart(r.startedAt) === p);
      const high = rs.filter((r) => r.moodAfter >= 4).length;
      return { p, n: rs.length, high, share: rs.length ? high / rs.length : 0 };
    })
    .filter((x) => x.n >= TIME_MIN);
  if (parts.length < 2) {
    return waiting('timeOfDay', `Shows up after ${TIME_MIN} runs at two different times of day, with both energy questions answered.`, list.length, 'run');
  }
  const sorted = [...parts].sort((a, b) => b.share - a.share);
  const best = sorted[0];
  const line =
    best.share - sorted[1].share >= CLEAR
      ? `Your ${best.p} runs most often ended on Good or Recharged: ${best.high} of ${best.n}.`
      : `Your runs ended on Good or Recharged about as often at any time of day.`;
  const counted = list.filter((r) => parts.some((x) => x.p === dayPart(r.startedAt)));
  return {
    key: 'timeOfDay',
    title: TITLES.timeOfDay,
    line,
    detail: `Morning is before 11:00, evening from 16:00. Your after-run answers, ${span(fmt, counted)}.`,
    ready: true,
    rows: parts.map((x) => ({ label: PART_LABEL[x.p], value: `Good or Recharged after ${x.high} of ${x.n}` })),
  };
}

/** Everything the Patterns section shows, in order. The first is free. */
export function energyPatterns(runs: PatternRun[], places: PatternPlace[], now = Date.now(), fmt: PatternFormat = PLAIN): Patterns {
  return {
    first: lift(runs, fmt),
    more: [shortWeekday(runs, now, fmt), placesBack(runs, places, now, fmt), timeOfDay(runs, now, fmt)],
  };
}
