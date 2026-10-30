// When run reminders fire and what kind of line each one gets. Pure: no React
// Native imports, so `npm run test:reminders` checks it under plain Node.
//
// How often (perWeek): 14 = one or two a day (the default), 7 = one a day,
// 3 = a few a week, 0 = off. 1 and 5 are older settings, still honoured.
//
// The rules, in order:
//  - The main note: at the chosen hour until there are 4 runs in the last 8
//    weeks; then ~45 min before your usual start (when the hour is on Auto).
//    A few a week uses Mon/Wed/Fri, then the weekdays you actually run on.
//  - One or two a day adds a second note in the other half of the day: around
//    17:30 as the working day winds down (or 8:00 for evening runners).
//  - Never in the 12 h after a run (20 h on a few a week), never 21:00–07:00,
//    never more than two a day, and only the main note once you've been away
//    three days or more.
//  - Ignored for a while (no run between): one a day, or one a week on a few a
//    week, until the next run.
//  - Only two weeks ahead, and week two holds one last line. Stop opening the
//    app and it goes quiet.
//  - Ten days without a run and nothing more comes until the next run: Run
//    home says welcome back instead, and the door stays open without a knock.
//  - A wet or foggy slot in the stored forecast swaps in a weather line.

export type PlanKind = 'nudge' | 'rhythm' | 'quiet' | 'gap' | 'weather' | 'window' | 'last' | 'afternoon' | 'weekend';

export interface PlannedReminder {
  at: number; // epoch ms
  kind: PlanKind;
  dryFrom?: number; // 'window': the first dry hour after a wet slot
}

export interface PlanHour {
  t: number;
  rainP: number;
  sky: string;
}

export interface PlanInput {
  now: number;
  perWeek: number; // 0, 3, 7 or 14 (1 and 5 from older settings)
  hour: number; // fixed hour, used when auto is off or there isn't enough history
  minute: number;
  auto: boolean; // follow the learned rhythm once there is one
  runStarts: number[]; // epoch ms, any order
  firedSinceLastRun: number; // reminders already delivered since the last run
  forecast?: PlanHour[]; // hourly, from the stored reading
}

export const HORIZON_DAYS = 14;
export const QUIET_START = 21; // nothing from 21:00
export const QUIET_END = 7; // until 07:00
/** Days after the last run when reminders stop until the next one. */
export const AWAY_QUIET_DAYS = 10;
const DAY = 86400000;
const LEAD_MIN = 45;
const RHYTHM_WEEKS = 8;
const RHYTHM_MIN_RUNS = 4;
const WET = new Set(['rain', 'drizzle', 'fog', 'snow']);
/** The second note of the day: as the working day winds down. */
export const AFTERNOON_MINUTE = 17 * 60 + 30;
/** ...or in the morning, for people whose main note is in the afternoon. */
export const MORNING_MINUTE = 8 * 60;
/** Two notes on one day are at least this far apart. */
export const MIN_APART_MS = 3 * 3600 * 1000;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_DAYS: Record<number, number[]> = { 1: [3], 3: [1, 3, 5], 5: [1, 2, 3, 4, 5], 7: ALL_DAYS, 14: ALL_DAYS };

/** The default for new installs, and what older settings move to: one or two a day. */
export const DEFAULT_PER_WEEK = 14 as const;

/** Daily cadences have every day and their own skip, back-off and cap. */
export function isDaily(perWeek: number): boolean {
  return perWeek >= 7;
}

/** The most notes on one day. */
export function perDayCap(perWeek: number): number {
  return perWeek >= 14 ? 2 : perWeek > 0 ? 1 : 0;
}

function skipAfterRunMs(perWeek: number): number {
  return (isDaily(perWeek) ? 12 : 20) * 3600 * 1000;
}

/** Notes delivered with no run between before it eases off. */
function backoffAfter(perWeek: number): number {
  return perWeek >= 14 ? 8 : perWeek >= 7 ? 5 : 3;
}

export interface Rhythm {
  days: number[]; // 0 = Sunday
  minuteOfDay: number | null; // reminder time, already moved earlier by the lead
  learned: boolean;
}

/** The weekdays and time you actually run, or the defaults if there isn't enough to go on. */
export function learnRhythm(runStarts: number[], now: number, perWeek: number): Rhythm {
  const fallback = DEFAULT_DAYS[perWeek] ?? [];
  const recent = runStarts.filter((t) => t <= now && now - t < RHYTHM_WEEKS * 7 * DAY);
  if (recent.length < RHYTHM_MIN_RUNS || perWeek === 0) return { days: fallback, minuteOfDay: null, learned: false };

  const byDay = new Map<number, number[]>();
  for (const t of recent) {
    const d = new Date(t);
    const list = byDay.get(d.getDay()) ?? [];
    list.push(d.getHours() * 60 + d.getMinutes());
    byDay.set(d.getDay(), list);
  }
  // Days run on at least twice, most-run first; fill up from the defaults if you run on fewer days.
  const usual = [...byDay.entries()].filter(([, m]) => m.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0] - b[0]).map(([d]) => d);
  if (isDaily(perWeek)) {
    const all = recent.map((t) => new Date(t).getHours() * 60 + new Date(t).getMinutes());
    return { days: ALL_DAYS, minuteOfDay: clampMinute(median(all) - LEAD_MIN), learned: true };
  }
  const days = usual.slice(0, perWeek);
  for (const d of fallback) if (days.length < perWeek && !days.includes(d)) days.push(d);

  const minutes = usual.flatMap((d) => byDay.get(d) ?? []);
  const all = minutes.length ? minutes : recent.map((t) => new Date(t).getHours() * 60 + new Date(t).getMinutes());
  const at = median(all) - LEAD_MIN;
  return { days: days.sort((a, b) => a - b), minuteOfDay: clampMinute(at), learned: true };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function clampMinute(m: number): number {
  return Math.min(Math.max(m, QUIET_END * 60), QUIET_START * 60 - 30);
}

export function inQuietHours(t: number): boolean {
  const h = new Date(t).getHours();
  return h >= QUIET_START || h < QUIET_END;
}

function weatherAt(forecast: PlanHour[] | undefined, at: number): { wet: boolean; dryFrom?: number } | null {
  if (!forecast?.length) return null;
  const slot = forecast.find((h) => at >= h.t && at < h.t + 3600 * 1000);
  if (!slot || !WET.has(slot.sky)) return null;
  const endOfDay = new Date(at);
  endOfDay.setHours(QUIET_START, 0, 0, 0);
  const dry = forecast.find((h) => h.t > at && h.t < endOfDay.getTime() - 3600 * 1000 && h.rainP < 30 && !WET.has(h.sky) && h.sky !== 'storm');
  return { wet: true, dryFrom: dry && slot.sky !== 'fog' ? dry.t : undefined };
}

export function planReminders(p: PlanInput): PlannedReminder[] {
  if (p.perWeek <= 0) return [];
  const rhythm = learnRhythm(p.runStarts, p.now, p.perWeek);
  const minuteOfDay = p.auto && rhythm.minuteOfDay != null ? rhythm.minuteOfDay : clampMinute(p.hour * 60 + p.minute);
  const second = minuteOfDay < 13 * 60 ? AFTERNOON_MINUTE : MORNING_MINUTE;
  const lastRun = p.runStarts.length ? Math.max(...p.runStarts) : null;
  const backedOff = p.firedSinceLastRun >= backoffAfter(p.perWeek);
  const daily = isDaily(p.perWeek);
  const skipMs = skipAfterRunMs(p.perWeek);

  type Slot = { at: number; main: boolean };
  const slots: Slot[] = [];
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const date = new Date(p.now);
    date.setDate(date.getDate() + d);
    if (!rhythm.days.includes(date.getDay())) continue;
    const day: Slot[] = [{ at: atMinute(date, minuteOfDay), main: true }];
    if (p.perWeek >= 14) day.push({ at: atMinute(date, second), main: false });
    for (const s of day.sort((a, b) => a.at - b.at)) {
      if (s.at <= p.now + 60_000) continue;
      if (lastRun != null && s.at - lastRun < skipMs && s.at > lastRun) continue;
      if (lastRun != null && awayDays(lastRun, s.at) >= AWAY_QUIET_DAYS) continue;
      if (inQuietHours(s.at)) continue;
      // Away a few days, or easing off: only the main note.
      const since = lastRun == null ? null : (s.at - lastRun) / DAY;
      if (!s.main && (backedOff || (since != null && since >= 3))) continue;
      slots.push(s);
    }
  }

  // Week one: the normal plan, eased off if ignored. Week two: one last line.
  const weekOneEnd = p.now + 7 * DAY;
  const weekOne = slots.filter((s) => s.at < weekOneEnd);
  const chosen = !backedOff ? weekOne : daily ? onePerDay(weekOne) : weekOne.slice(0, 1);
  const lastChosen = chosen.length ? chosen[chosen.length - 1].at : null;
  const last = slots.find((s) => s.at >= weekOneEnd && s.main && (lastChosen == null || s.at - lastChosen >= 2 * DAY));

  const out: PlannedReminder[] = chosen.map((s) => ({ at: s.at, kind: kindFor(s, lastRun, backedOff, rhythm.learned && p.auto) }));
  for (const r of out) {
    const w = weatherAt(p.forecast, r.at);
    if (w?.wet) {
      r.kind = w.dryFrom != null ? 'window' : 'weather';
      if (w.dryFrom != null) r.dryFrom = w.dryFrom;
    }
  }
  if (last != null) out.push({ at: last.at, kind: 'last' });
  return out;
}

function atMinute(date: Date, minuteOfDay: number): number {
  const d = new Date(date);
  d.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return d.getTime();
}

function onePerDay<T extends { at: number; main: boolean }>(slots: T[]): T[] {
  const seen = new Set<string>();
  return slots.filter((s) => {
    if (!s.main) return false;
    const k = new Date(s.at).toDateString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Calendar days from the last run to `at`, so a reminder at 08:00 on day ten counts as ten. */
export function awayDays(lastRun: number, at: number): number {
  const a = new Date(lastRun);
  a.setHours(0, 0, 0, 0);
  const b = new Date(at);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

function kindFor(s: { at: number; main: boolean }, lastRun: number | null, backedOff: boolean, learned: boolean): PlanKind {
  const since = lastRun == null ? null : (s.at - lastRun) / DAY;
  if (since != null && since >= 7) return 'gap';
  if (backedOff || (since != null && since >= 3)) return 'quiet';
  const date = new Date(s.at);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  if (!s.main) return weekend ? 'weekend' : date.getHours() >= 15 ? 'afternoon' : 'nudge';
  if (learned) return 'rhythm';
  return weekend && date.getHours() >= 9 ? 'weekend' : 'nudge';
}

// ---- One scheduler for every kind of note ----------------------------------

/**
 * A note from elsewhere in the app (a training plan, Run to work / Run home),
 * fitted in with the reminders. Extras win a day's places over reminders, so a
 * day with two commute notes has no ordinary one.
 */
export interface ExtraNote<T = unknown> {
  at: number;
  /** Higher wins a day's last place. Reminders are 0. */
  priority: number;
  payload: T;
}

export type Fitted<T> = { at: number; reminder: PlannedReminder; extra?: undefined } | { at: number; extra: ExtraNote<T>; reminder?: undefined };

/**
 * Everything that would fire, cut down to what the day allows: reminders step
 * aside on days in `ownedDays` (day starts, local), extras go first, then at
 * most `perDayCap` a day, three hours apart, never in quiet hours.
 */
export function fitNotes<T>(reminders: PlannedReminder[], extras: ExtraNote<T>[], ownedDays: Set<number>, perWeek: number): Fitted<T>[] {
  const cap = Math.max(perDayCap(perWeek), extras.length ? 1 : 0);
  const all: (Fitted<T> & { priority: number })[] = [
    ...extras.filter((e) => !inQuietHours(e.at)).map((e) => ({ at: e.at, extra: e, priority: e.priority })),
    ...reminders.filter((r) => !ownedDays.has(startOfDay(r.at))).map((r) => ({ at: r.at, reminder: r, priority: 0 })),
  ];
  const byDay = new Map<number, (Fitted<T> & { priority: number })[]>();
  for (const n of all) {
    const k = startOfDay(n.at);
    byDay.set(k, [...(byDay.get(k) ?? []), n]);
  }
  const out: Fitted<T>[] = [];
  for (const list of byDay.values()) {
    const kept: (Fitted<T> & { priority: number })[] = [];
    for (const n of [...list].sort((a, b) => b.priority - a.priority || a.at - b.at)) {
      if (kept.length >= cap) break;
      if (kept.some((k) => Math.abs(k.at - n.at) < MIN_APART_MS)) continue;
      kept.push(n);
    }
    for (const { priority: _p, ...n } of kept) out.push(n as Fitted<T>);
  }
  return out.sort((a, b) => a.at - b.at);
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
