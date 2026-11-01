// A weekly goal: optional, off until switched on, and quiet. A time or a
// distance for Monday to Sunday, shown beside the date on the Run tab. No
// streaks, no count of missed weeks, nothing said when a week falls short, and
// never mentioned by a reminder. Every run counts, added by hand too. Free.

import { decimal } from './i18n/lang';
import { addDays, mondayOf } from './training/dates';
import { ui } from './i18n/ui';

export type WeekGoal = {
  on: boolean;
  kind: 'time' | 'distance';
  minutes: number;
  /** Metres. */
  distanceM: number;
};

export const NO_GOAL: WeekGoal = { on: false, kind: 'time', minutes: 120, distanceM: 15_000 };

/** What the Settings page offers. Distances are whole km or mi. */
export const GOAL_MINUTES = [60, 90, 120, 180, 240, 300];
export const GOAL_KM = [10, 15, 20, 30, 40, 50];
export const GOAL_MI = [5, 10, 15, 20, 25, 30];

export function cleanGoal(g: Partial<WeekGoal> | null | undefined): WeekGoal {
  const kind = g?.kind === 'distance' ? 'distance' : 'time';
  const minutes = typeof g?.minutes === 'number' && g.minutes > 0 ? Math.round(g.minutes) : NO_GOAL.minutes;
  const distanceM = typeof g?.distanceM === 'number' && g.distanceM > 0 ? g.distanceM : NO_GOAL.distanceM;
  return { on: g?.on === true, kind, minutes, distanceM };
}

/** Monday 00:00 to the next Monday 00:00, local time. */
export function weekOf(now: number): { start: number; end: number } {
  const start = mondayOf(now);
  return { start, end: addDays(start, 7) };
}

export type WeekSoFar = { distanceM: number; durationS: number; runs: number };

export function weekSoFar(runs: Array<{ startedAt: number; distanceM: number; durationS: number }>, now: number): WeekSoFar {
  const { start, end } = weekOf(now);
  const out = { distanceM: 0, durationS: 0, runs: 0 };
  for (const r of runs) {
    if (r.startedAt < start || r.startedAt >= end) continue;
    out.distanceM += Math.max(0, r.distanceM);
    out.durationS += Math.max(0, r.durationS);
    out.runs++;
  }
  return out;
}

/** 0..1 of the way there. */
export function goalShare(g: WeekGoal, w: WeekSoFar): number {
  const share = g.kind === 'time' ? w.durationS / 60 / g.minutes : w.distanceM / g.distanceM;
  return Math.max(0, Math.min(1, share));
}

/** Whole km (or mi) from 10 up, one decimal under 10, so the line stays short. */
export function roughDistance(m: number, km: boolean): string {
  const n = m / (km ? 1000 : 1609.344);
  const text = n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  return `${decimal(text)} ${km ? 'km' : 'mi'}`;
}

export function goalParts(g: WeekGoal, w: WeekSoFar, km: boolean): { done: string; target: string } {
  if (g.kind === 'time') return { done: ui().weekGoal.minutes(Math.floor(w.durationS / 60)), target: ui().weekGoal.minutes(g.minutes) };
  return { done: roughDistance(w.distanceM, km), target: roughDistance(g.distanceM, km) };
}

/** The one line beside the date. Reached says only the number, never a cheer or a count. */
export function goalLine(g: WeekGoal, w: WeekSoFar, km: boolean): string | null {
  if (!g.on) return null;
  const p = goalParts(g, w, km);
  return goalShare(g, w) >= 1 ? ui().weekGoal.reached(p.done) : ui().weekGoal.line(p.done, p.target);
}
