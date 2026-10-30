// Run to work, Run home. Home and work are two points the runner sets in
// Settings; they stay on the phone. From them: whether a run was a commute
// (it starts near one and ends near the other), the one quiet line the Run tab
// offers on a weekday morning or late afternoon, how far and how long that run
// is likely to be, and when the weekday notes go. Pure, so
// `npm run test:commute` checks it under plain Node.

import type { LatLon } from './types';

export interface Commute {
  home: LatLon | null;
  work: LatLon | null;
  /** Weekday notes: a run to work in the morning, a run home as work winds down. On by default once both are set. */
  nudges: Nudges;
}

export type Nudges = 'off' | 'morning' | 'afternoon' | 'both';

export const NO_COMMUTE: Commute = { home: null, work: null, nudges: 'both' };

export type CommuteDir = 'toWork' | 'home';

/** A run that starts and ends this close to home and work counts as a commute. */
export const NEAR_M = 400;
/** Where the phone last was, this close to home (or work), for the Run tab to offer the run from there. */
export const HERE_M = 1500;
/** Home and work closer than this are not a run apart; further than this, not an everyday one. */
export const MIN_APART_M = 1000;
export const MAX_APART_M = 30000;
/** Streets wind: a commute runs about this much longer than the straight line, until there's a real one to go by. */
export const DETOUR = 1.3;
/** Seconds per km when there are no runs to learn a pace from. */
export const DEFAULT_PACE_S = 390;
/** When the notes go: 07:00 (the first minute out of quiet hours) and 16:30. */
export const MORNING_NOTE = { hour: 7, minute: 0 };
export const AFTERNOON_NOTE = { hour: 16, minute: 30 };
/** Days of notes laid out at a time; the app lays them out again on every open and every saved run. */
export const NOTE_DAYS = 7;
/** Ten days without a run and the notes go quiet, as every reminder does, until the next run. */
export const AWAY_DAYS = 10;

/** The morning offer: 05:00 to 10:59. The afternoon one: 14:00 to 20:59. */
const MORNING = [5, 11];
const AFTERNOON = [14, 21];

export function metres(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Both points set, and a runnable distance apart. */
export function ready(c: Commute): c is Commute & { home: LatLon; work: LatLon } {
  if (!c.home || !c.work) return false;
  const d = metres(c.home, c.work);
  return d >= MIN_APART_M && d <= MAX_APART_M;
}

/** Home to work, work to home, or neither. Direction comes from which end is where. */
export function commuteOf(start: LatLon | null, end: LatLon | null, c: Commute): CommuteDir | null {
  if (!start || !end || !ready(c)) return null;
  if (metres(start, c.home) <= NEAR_M && metres(end, c.work) <= NEAR_M) return 'toWork';
  if (metres(start, c.work) <= NEAR_M && metres(end, c.home) <= NEAR_M) return 'home';
  return null;
}

export interface PastRun {
  startedAt: number;
  distanceM: number;
  durationS: number;
  dir: CommuteDir | null;
}

export interface Estimate {
  distanceM: number;
  durationS: number;
  /** From the runner's own commutes, not a guess from the straight line. */
  known: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * How far and how long: the middle of the last five runs that way, or the
 * straight line with a little for the streets, at the runner's usual pace.
 */
export function estimate(dir: CommuteDir, c: Commute & { home: LatLon; work: LatLon }, runs: PastRun[]): Estimate {
  const same = runs.filter((r) => r.dir === dir && r.distanceM > 0 && r.durationS > 0).sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  if (same.length) return { distanceM: median(same.map((r) => r.distanceM)), durationS: median(same.map((r) => r.durationS)), known: true };
  const paces = runs
    .filter((r) => r.distanceM >= 1000 && r.durationS > 0)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10)
    .map((r) => r.durationS / (r.distanceM / 1000));
  const pace = paces.length ? median(paces) : DEFAULT_PACE_S;
  const distanceM = metres(c.home, c.work) * DETOUR;
  return { distanceM, durationS: (distanceM / 1000) * pace, known: false };
}

export interface Offer extends Estimate {
  dir: CommuteDir;
  /** Where the run ends: work for Run to work, home for Run home. */
  goal: LatLon;
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * The Run tab's one line, or nothing. Weekdays only; Run to work in the
 * morning, Run home in the afternoon; never once there's a run today; and when
 * the phone knows roughly where it is, only from the right end.
 */
export function offerFor(p: { now: number; c: Commute; here: LatLon | null; runs: PastRun[] }): Offer | null {
  const { c } = p;
  if (!ready(c)) return null;
  const d = new Date(p.now);
  const day = d.getDay();
  if (day === 0 || day === 6) return null;
  const h = d.getHours();
  const dir: CommuteDir | null = h >= MORNING[0] && h < MORNING[1] ? 'toWork' : h >= AFTERNOON[0] && h < AFTERNOON[1] ? 'home' : null;
  if (!dir) return null;
  // A run already today ends the offer, except that a run to work this morning still leaves the run home.
  if (p.runs.some((r) => sameDay(r.startedAt, p.now) && !(dir === 'home' && r.dir === 'toWork'))) return null;
  const from = dir === 'toWork' ? c.home : c.work;
  if (p.here && metres(p.here, from) > HERE_M) return null;
  return { dir, goal: dir === 'toWork' ? c.work : c.home, ...estimate(dir, c, p.runs) };
}

/** Minutes, rounded to the nearest five once it's past a quarter of an hour: an estimate shouldn't look precise. */
export function roughMinutes(durationS: number): number {
  const m = durationS / 60;
  return m < 15 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5;
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface CommuteNote {
  at: number;
  dir: CommuteDir;
}

/**
 * The weekday notes for the next week: "run to work?" at 07:00 and "running
 * home?" at 16:30, as picked. None on a day that already has a run (a run to
 * work still leaves the afternoon one), none on a plan rest day, only the
 * afternoon one on a plan day (the plan's own note is the morning's), and
 * nothing at all after ten days away.
 */
export function commuteNotes(p: {
  now: number;
  c: Commute;
  lastRun: { at: number; dir: CommuteDir | null } | null;
  /** Local midnights of the plan's days: 'rest', or 'session' for any day with something to run. */
  plan?: Map<number, 'rest' | 'session'>;
}): CommuteNote[] {
  const { c } = p;
  if (!ready(c) || c.nudges === 'off') return [];
  const out: CommuteNote[] = [];
  for (let i = 0; i < NOTE_DAYS; i++) {
    const day = new Date(p.now);
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);
    const wd = day.getDay();
    if (wd === 0 || wd === 6) continue;
    const start = day.getTime();
    if (p.lastRun && Math.round((start - dayStart(p.lastRun.at)) / 86400000) >= AWAY_DAYS) continue;
    const planDay = p.plan?.get(start);
    if (planDay === 'rest') continue;
    const ranToday = p.lastRun != null && dayStart(p.lastRun.at) === start;
    const slots: Array<[CommuteDir, { hour: number; minute: number }]> = [];
    if ((c.nudges === 'morning' || c.nudges === 'both') && planDay !== 'session' && !ranToday) slots.push(['toWork', MORNING_NOTE]);
    if ((c.nudges === 'afternoon' || c.nudges === 'both') && (!ranToday || p.lastRun?.dir === 'toWork')) slots.push(['home', AFTERNOON_NOTE]);
    for (const [dir, t] of slots) {
      const at = new Date(start);
      at.setHours(t.hour, t.minute, 0, 0);
      if (at.getTime() > p.now + 60_000) out.push({ at: at.getTime(), dir });
    }
  }
  return out;
}
