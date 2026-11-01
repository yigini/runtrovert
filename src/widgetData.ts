// What the home-screen widgets show, worked out on the phone and handed to
// them as plain words (the widgets have no strings of their own, so every
// language comes from src/i18n/ui like the rest of the app). Pure: no React
// Native, so `npm run test:widget` runs it in Node.

import { formatDistance, formatDuration } from './geo';
import { formatDay } from './training/dates';
import { goalParts, roughDistance, weekOf, weekSoFar, type WeekGoal } from './weekGoal';
import { ui } from './i18n/ui';

export type WidgetData = {
  v: 1;
  lastTitle: string;
  lastValue: string;
  weekTitle: string;
  weekValue: string;
  /** Shown instead of weekValue once the week is over and the app hasn't been opened since. */
  weekZero: string;
  weekEnd: number;
  start: string;
};

export function widgetData(runs: Array<{ startedAt: number; distanceM: number; durationS: number }>, goal: WeekGoal | null, km: boolean, now: number): WidgetData {
  const w = ui().widget;
  const last = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.startedAt > a.startedAt ? r : a), null);
  const week = weekSoFar(runs, now);
  const g = goal?.on ? goal : null;
  const weekValue = g ? w.weekGoal(goalParts(g, week, km).done, goalParts(g, week, km).target) : week.runs ? w.weekValue(roughDistance(week.distanceM, km), week.runs) : w.weekZero;
  const zero = { distanceM: 0, durationS: 0, runs: 0 };
  return {
    v: 1,
    lastTitle: w.lastRun,
    lastValue: last ? w.lastValue(formatDistance(last.distanceM, km), formatDuration(last.durationS), formatDay(last.startedAt)) : w.noRuns,
    weekTitle: w.thisWeek,
    weekValue,
    weekZero: g ? w.weekGoal(goalParts(g, zero, km).done, goalParts(g, zero, km).target) : w.weekZero,
    weekEnd: weekOf(now).end,
    start: w.start,
  };
}
