// Where the runner stands, read from their own history. Pure, so the tests can
// feed it made-up runs.

import type { RunnerProfile } from './catalogue';
import { DAY_MS } from './dates';
import type { Paces } from './paces';

export interface HistoryRun {
  startedAt: number;
  distanceM: number;
  durationS: number;
}

export const DEFAULT_EASY_S_PER_KM = 390; // 6:30, a conversational jog for most people

/**
 * Average weekly km and runs over the last 4 weeks, the longest run of the
 * last 30 days, and what "easy" costs in time. Easy pace is the median pace of
 * recent runs, slowed by 8%: most people's logged runs are a little quicker
 * than a true easy day.
 */
export function profileFrom(runs: HistoryRun[], now: number, paces?: Paces | null): RunnerProfile {
  const fourWeeks = runs.filter((r) => r.startedAt > now - 28 * DAY_MS && r.startedAt <= now && r.distanceM >= 500);
  const month = runs.filter((r) => r.startedAt > now - 30 * DAY_MS && r.startedAt <= now);
  const weeklyKm = fourWeeks.reduce((a, r) => a + r.distanceM, 0) / 1000 / 4;
  const runsPerWeek = fourWeeks.length / 4;
  const longestKm30 = month.reduce((a, r) => Math.max(a, r.distanceM / 1000), 0);

  let easy = DEFAULT_EASY_S_PER_KM;
  const recent = runs.filter((r) => r.startedAt > now - 56 * DAY_MS && r.distanceM >= 1000 && r.durationS > 0).map((r) => r.durationS / (r.distanceM / 1000));
  if (paces) easy = Math.round((paces.easy[0] + paces.easy[1]) / 2);
  else if (recent.length >= 3) {
    const sorted = [...recent].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    easy = Math.round(Math.min(Math.max(median * 1.08, 240), 720));
  }
  return { weeklyKm: round1(weeklyKm), longestKm30: round1(longestKm30), runsPerWeek: round1(runsPerWeek), easyPaceSPerKm: easy };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
