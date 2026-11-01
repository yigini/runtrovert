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
import { lang, monthName, upperFirst } from './i18n/lang';
import { live, ui } from './i18n/ui';

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
  // Month names come from Intl, which is slow on the phone: one call per month, not per run.
  const titles = new Map<string, string>();
  for (const r of sorted) {
    let key: string;
    let title: string;
    if (r.startedAt >= thisWeek) {
      key = 'this-week';
      title = ui().patterns.thisWeek;
    } else if (r.startedAt >= lastWeek) {
      key = 'last-week';
      title = ui().patterns.lastWeek;
    } else {
      const d = new Date(r.startedAt);
      key = `m-${d.getFullYear()}-${d.getMonth()}`;
      const known = titles.get(key);
      if (known != null) title = known;
      else {
        const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        title = d.getFullYear() === year ? monthName(first) : `${monthName(first)} ${d.getFullYear()}`;
        titles.set(key, title);
      }
    }
    const last = out[out.length - 1];
    if (last && last.key === key) last.data.push(r);
    else out.push({ key, title, data: [r] });
  }
  return out;
}

function defaultMonth(t: number): string {
  return upperFirst(monthName(t));
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
    return lang() === 'en' ? `${d.getDate()} ${monthName(t).slice(0, 3)}` : d.toLocaleDateString(lang() === 'pt' ? 'pt-BR' : lang(), { day: 'numeric', month: 'short' });
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

export const TITLES: Record<PatternKey, string> = live(() => ui().patterns.titles);

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

function span(fmt: PatternFormat, list: Array<{ startedAt: number }>): string {
  const ts = list.map((r) => r.startedAt);
  const from = Math.min(...ts);
  const to = Math.max(...ts);
  const a = fmt.date(from);
  const b = fmt.date(to);
  return a === b ? a : ui().patterns.span(a, b);
}

function waiting(key: PatternKey, need: string, have: number, counted: (n: number) => string): Insight {
  return {
    key,
    title: TITLES[key],
    line: need,
    detail: have === 0 ? ui().patterns.noneYet : ui().patterns.xSoFar(counted(have)),
    ready: false,
  };
}

/** Free: of your last ten runs with both check-ins, how many ended with more energy. */
export function lift(runs: PatternRun[], fmt: PatternFormat = PLAIN): Insight {
  const last = rated(runs)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, LIFT_RUNS);
  if (last.length < LIFT_MIN) {
    return waiting('lift', ui().patterns.showsUpAfterXRuns(LIFT_MIN), last.length, ui().patterns.runs);
  }
  const changes = last.map(change).reverse();
  const n = changes.length;
  const up = changes.filter((c) => c === 'up').length;
  const same = changes.filter((c) => c === 'same').length;
  const down = n - up - same;
  // Lead with whatever happened most; ties go to "more", then "the same".
  const line =
    up >= same && up >= down
      ? ui().patterns.youHadMoreEnergyAfter(up, n)
      : same >= down
        ? ui().patterns.yourEnergyStayedTheSame(same, n)
        : ui().patterns.youHadLessEnergyAfter(down, n);
  return {
    key: 'lift',
    title: TITLES.lift,
    line,
    detail: ui().patterns.xMoreXTheSame(up, same, down, span(fmt, last)),
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
    return waiting('shortWeekday', ui().patterns.showsUpAfterXWeekday(WEEKDAY_MIN), week.length, ui().patterns.weekdayRuns);
  }
  const mid = median(week.map((r) => r.distanceM));
  const short = week.filter((r) => r.distanceM < mid);
  const long = week.filter((r) => r.distanceM >= mid);
  if (short.length < WEEKDAY_SIDE_MIN || long.length < WEEKDAY_SIDE_MIN) {
    return waiting('shortWeekday', ui().patterns.yourWeekdayRunsAreMostly, week.length, ui().patterns.weekdayRuns);
  }
  const su = short.filter((r) => change(r) === 'up').length;
  const lu = long.filter((r) => change(r) === 'up').length;
  const rs = su / short.length;
  const rl = lu / long.length;
  const line =
    rs - rl >= CLEAR
      ? ui().patterns.yourShorterWeekdayRunsMore
      : rl - rs >= CLEAR
        ? ui().patterns.yourLongerWeekdayRunsMore
        : ui().patterns.shorterAndLongerWeekdayRuns;
  const d = fmt.distance(mid);
  return {
    key: 'shortWeekday',
    title: TITLES.shortWeekday,
    line,
    detail: ui().patterns.weekdayRunsWithBothCheck(span(fmt, week), d),
    ready: true,
    rows: [
      { label: ui().patterns.underX(d), value: ui().patterns.moreEnergyAfterXOf(su, short.length) },
      { label: ui().patterns.xOrMore(d), value: ui().patterns.moreEnergyAfterXOf2(lu, long.length) },
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
    return waiting('places', ui().patterns.showsUpOnceYouHave(PLACE_MIN), most, ui().patterns.runsInOnePlace);
  }
  const [firstId, firstRuns] = top[0];
  const all = top.flatMap(([, l]) => l);
  return {
    key: 'places',
    title: TITLES.places,
    line: ui().patterns.youWentBackToX(names.get(firstId) ?? '', firstRuns.length, fmt.date(Math.min(...firstRuns.map((r) => r.startedAt)))),
    detail: ui().patterns.runsLoggedInYourPlaces(span(fmt, all)),
    ready: true,
    rows: top.map(([id, list]) => {
      const r = rated(list);
      const up = r.filter((x) => change(x) === 'up').length;
      return {
        label: names.get(id)!,
        value: ui().patterns.runs(list.length) + (r.length >= PLACE_MIN ? ui().patterns.moreEnergyAfterXOf3(up, r.length) : ''),
      };
    }),
  };
}

export type DayPart = 'morning' | 'midday' | 'evening';
const PART_LABEL: Record<DayPart, string> = live(() => ui().patterns.part);

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
    return waiting('timeOfDay', ui().patterns.showsUpAfterXRuns2(TIME_MIN), list.length, ui().patterns.runs);
  }
  const sorted = [...parts].sort((a, b) => b.share - a.share);
  const best = sorted[0];
  const line =
    best.share - sorted[1].share >= CLEAR
      ? ui().patterns.yourXRunsMostOften(best.p, best.high, best.n)
      : ui().patterns.yourRunsEndedOnGood;
  const counted = list.filter((r) => parts.some((x) => x.p === dayPart(r.startedAt)));
  return {
    key: 'timeOfDay',
    title: TITLES.timeOfDay,
    line,
    detail: ui().patterns.morningIsBefore1100(span(fmt, counted)),
    ready: true,
    rows: parts.map((x) => ({ label: PART_LABEL[x.p], value: ui().patterns.goodOrRechargedAfterX(x.high, x.n) })),
  };
}

/** Everything the Patterns section shows, in order. The first is free. */
export function energyPatterns(runs: PatternRun[], places: PatternPlace[], now = Date.now(), fmt: PatternFormat = PLAIN): Patterns {
  return {
    first: lift(runs, fmt),
    more: [shortWeekday(runs, now, fmt), placesBack(runs, places, now, fmt), timeOfDay(runs, now, fmt)],
  };
}
