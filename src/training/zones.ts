// Heart-rate ranges for each effort, as a second reading next to the talk test
// (rule 8: effort first). Pure. With a resting heart rate the ranges are
// fractions of heart-rate reserve (Karvonen 1957); without, of maximum heart
// rate. Percentages after Daniels' Running Formula. Short fast work gets no
// range: the heart lags behind the legs for the first minute or two.

import type { Goal } from './catalogue';
import type { Effort, Step } from './types';

export type MaxSource = 'entered' | 'measured' | 'age';

export interface HeartSetup {
  maxHr: number;
  restHr: number | null;
  source: MaxSource;
  easyNudge: boolean; // a quiet "this could be easier" on easy running, from a watch
}

/** Kept with the plan's own values in the settings table: the runner's numbers, on the phone. */
export const HEART_KEY = 'heartZones';

/** Tanaka, Monahan & Seals 2001: 208 − 0.7 × age. ±10 bpm for most people, so a measured or entered max is better. */
export function maxFromAge(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export function saneMax(n: number): boolean {
  return n >= 130 && n <= 230;
}

export function saneRest(n: number, max: number): boolean {
  return n >= 30 && n <= 100 && n < max - 50;
}

type Band = [number, number];
// [low, high] as a share of max (no resting) or of reserve (with resting).
const OF_MAX: Partial<Record<Effort, Band>> = { walk: [0.5, 0.65], easy: [0.65, 0.79], steady: [0.8, 0.89], threshold: [0.88, 0.92], hard: [0.95, 1] };
const OF_RESERVE: Partial<Record<Effort, Band>> = { walk: [0.4, 0.58], easy: [0.59, 0.74], steady: [0.75, 0.84], threshold: [0.83, 0.88], hard: [0.95, 1] };
// "Race" effort is the goal race's own: marathon at steady, half near threshold, 10K and 5K above it.
const RACE_OF_MAX: Record<Goal, Band> = { none: [0.8, 0.89], marathon: [0.8, 0.89], half: [0.86, 0.91], '10k': [0.9, 0.95], '5k': [0.93, 0.98] };
const RACE_OF_RESERVE: Record<Goal, Band> = { none: [0.75, 0.84], marathon: [0.75, 0.84], half: [0.81, 0.87], '10k': [0.86, 0.92], '5k': [0.9, 0.96] };

/** The range for an effort in bpm, or null when a range would mislead (sprints, or no setup). */
export function rangeFor(effort: Effort, goal: Goal, h: HeartSetup | null): Band | null {
  if (!h || !saneMax(h.maxHr)) return null;
  const rest = h.restHr != null && saneRest(h.restHr, h.maxHr) ? h.restHr : null;
  const band = effort === 'race' ? (rest != null ? RACE_OF_RESERVE : RACE_OF_MAX)[goal] : (rest != null ? OF_RESERVE : OF_MAX)[effort];
  if (!band) return null;
  const at = (f: number) => Math.round(rest != null ? rest + f * (h.maxHr - rest) : f * h.maxHr);
  return [at(band[0]), at(band[1])];
}

/** A step's range, or null when it is too short for the heart to get there. */
export function stepRange(step: Pick<Step, 'kind' | 'effort' | 'durationS' | 'distanceM'>, goal: Goal, h: HeartSetup | null): Band | null {
  if (step.kind === 'stride' || step.effort === 'fast') return null;
  const seconds = step.durationS ?? (step.distanceM != null ? step.distanceM / 4 : 0);
  if ((step.kind === 'hard' || step.effort === 'hard') && seconds < 150) return null;
  return rangeFor(step.effort, goal, h);
}

/** Steps where an over-the-range reading is worth a word: easy running, warm-ups, cool-downs. */
export function nudgeable(step: Pick<Step, 'kind' | 'effort'>): boolean {
  return step.effort === 'easy' && (step.kind === 'run' || step.kind === 'warm' || step.kind === 'cool');
}

export interface NudgeState {
  overSince: number | null; // epoch ms of the first reading above the range in this stretch
  lastAt: number; // the last nudge
  count: number;
}

/** A minute above the easy range, at most one word every six minutes, three a run. */
export const NUDGE_AFTER_MS = 60_000;
export const NUDGE_GAP_MS = 6 * 60_000;
export const NUDGE_MAX = 3;

export function newNudge(): NudgeState {
  return { overSince: null, lastAt: 0, count: 0 };
}

/** Feed a reading; true when it is time to say something. */
export function shouldNudge(n: NudgeState, bpm: number, ts: number, top: number | null): boolean {
  if (top == null || bpm <= top) {
    n.overSince = null;
    return false;
  }
  if (n.overSince == null) n.overSince = ts;
  if (ts - n.overSince < NUDGE_AFTER_MS || n.count >= NUDGE_MAX || (n.lastAt && ts - n.lastAt < NUDGE_GAP_MS)) return false;
  n.lastAt = ts;
  n.count++;
  n.overSince = null;
  return true;
}
