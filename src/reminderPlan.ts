// When run reminders fire and what kind of line each one gets. Pure: no React
// Native imports, so `npm run test:reminders` checks it under plain Node.
//
// The rules, in order:
//  - Your rhythm: Mon/Wed/Fri at the chosen hour until there are 4 runs in the
//    last 8 weeks; then the weekdays you actually run on, ~45 min before your
//    usual start (when the hour is on Auto).
//  - Never within 20 h of a run, never more than one a day, never 21:00–07:00.
//  - Ignored three in a row (no run between): one a week until the next run.
//  - Only two weeks ahead, and week two holds one last line. Stop opening the
//    app and it goes quiet.
//  - Ten days without a run and nothing more comes until the next run: Run
//    home says welcome back instead, and the door stays open without a knock.
//  - A wet or foggy slot in the stored forecast swaps in a weather line.

export type PlanKind = 'nudge' | 'rhythm' | 'quiet' | 'gap' | 'weather' | 'window' | 'last';

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
  perWeek: number; // 0, 1, 3 or 5
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
const SKIP_AFTER_RUN_MS = 20 * 3600 * 1000;
const RHYTHM_WEEKS = 8;
const RHYTHM_MIN_RUNS = 4;
const BACKOFF_AFTER = 3;
const WET = new Set(['rain', 'drizzle', 'fog', 'snow']);

const DEFAULT_DAYS: Record<number, number[]> = { 1: [3], 3: [1, 3, 5], 5: [1, 2, 3, 4, 5] };

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
  const lastRun = p.runStarts.length ? Math.max(...p.runStarts) : null;
  const backedOff = p.firedSinceLastRun >= BACKOFF_AFTER;

  const slots: number[] = [];
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const date = new Date(p.now);
    date.setDate(date.getDate() + d);
    date.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    const at = date.getTime();
    if (!rhythm.days.includes(date.getDay())) continue;
    if (at <= p.now + 60_000) continue;
    if (lastRun != null && at - lastRun < SKIP_AFTER_RUN_MS) continue;
    if (lastRun != null && awayDays(lastRun, at) >= AWAY_QUIET_DAYS) continue;
    if (inQuietHours(at)) continue;
    slots.push(at);
  }

  // Week one: the normal plan, or one when backed off. Week two: one last line.
  const weekOneEnd = p.now + 7 * DAY;
  const weekOne = slots.filter((t) => t < weekOneEnd);
  const chosen = backedOff ? weekOne.slice(0, 1) : weekOne;
  const last = slots.find((t) => t >= weekOneEnd && (!chosen.length || t - chosen[chosen.length - 1] >= 2 * DAY));

  const out: PlannedReminder[] = chosen.map((at) => ({ at, kind: kindFor(at, lastRun, backedOff, rhythm.learned && p.auto) }));
  for (const r of out) {
    const w = weatherAt(p.forecast, r.at);
    if (w?.wet) {
      r.kind = w.dryFrom != null ? 'window' : 'weather';
      if (w.dryFrom != null) r.dryFrom = w.dryFrom;
    }
  }
  if (last != null) out.push({ at: last, kind: 'last' });
  return out;
}

/** Calendar days from the last run to `at`, so a reminder at 08:00 on day ten counts as ten. */
export function awayDays(lastRun: number, at: number): number {
  const a = new Date(lastRun);
  a.setHours(0, 0, 0, 0);
  const b = new Date(at);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

function kindFor(at: number, lastRun: number | null, backedOff: boolean, learned: boolean): PlanKind {
  const since = lastRun == null ? null : (at - lastRun) / DAY;
  if (since != null && since >= 7) return 'gap';
  if (backedOff || (since != null && since >= 3)) return 'quiet';
  if (learned) return 'rhythm';
  return 'nudge';
}
