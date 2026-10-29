// A session as a sequence of steps, walked through against live distance and
// time. Pure: the run screen feeds it numbers and reads back where it is.

import { EFFORT_LABEL } from './sessions';
import type { Step } from './types';
import { ui } from '../i18n/ui';

export interface WorkoutState {
  steps: Step[];
  index: number; // current step; steps.length when finished
  stepStartM: number;
  stepStartS: number;
}

export interface WorkoutView {
  index: number;
  total: number;
  step: Step | null;
  next: Step | null;
  leftS: number | null; // seconds left in a timed step
  leftM: number | null; // metres left in a distance step
  fraction: number; // 0 → 1 through the current step
  finished: boolean;
}

export function createWorkout(steps: Step[]): WorkoutState {
  return { steps: steps.filter((s) => (s.durationS ?? 0) > 0 || (s.distanceM ?? 0) > 0), index: 0, stepStartM: 0, stepStartS: 0 };
}

/** Feed the latest totals; says whether the step changed. Only moving time counts, so pauses stretch a step rather than skip it. */
export function advance(w: WorkoutState, distanceM: number, durationS: number): { view: WorkoutView; changed: boolean } {
  let changed = false;
  while (w.index < w.steps.length) {
    const s = w.steps[w.index];
    const doneS = durationS - w.stepStartS;
    const doneM = distanceM - w.stepStartM;
    const over = s.durationS != null ? doneS >= s.durationS : doneM >= (s.distanceM ?? 0);
    if (!over) break;
    w.stepStartS += s.durationS ?? doneS;
    w.stepStartM += s.distanceM ?? doneM;
    w.index++;
    changed = true;
  }
  return { view: view(w, distanceM, durationS), changed };
}

export function view(w: WorkoutState, distanceM: number, durationS: number): WorkoutView {
  const total = w.steps.length;
  if (w.index >= total) return { index: total, total, step: null, next: null, leftS: null, leftM: null, fraction: 1, finished: true };
  const s = w.steps[w.index];
  const doneS = durationS - w.stepStartS;
  const doneM = distanceM - w.stepStartM;
  const leftS = s.durationS != null ? Math.max(0, s.durationS - doneS) : null;
  const leftM = s.durationS == null ? Math.max(0, (s.distanceM ?? 0) - doneM) : null;
  const fraction = s.durationS != null ? Math.min(1, doneS / s.durationS) : Math.min(1, doneM / Math.max(1, s.distanceM ?? 1));
  return { index: w.index, total, step: s, next: w.steps[w.index + 1] ?? null, leftS, leftM, fraction, finished: false };
}

/** "Comfortably hard · 8 min" */
export function stepLine(s: Step): string {
  const size = s.durationS != null ? formatMin(s.durationS) : `${formatM(s.distanceM ?? 0)}`;
  return `${s.label || EFFORT_LABEL[s.effort]} · ${size}`;
}

/** What the voice says when a step begins. Short, because you are running. */
export function stepCue(s: Step | null, finished: boolean): string {
  if (finished || !s) return ui().workout.thatIsTheSessionEasy;
  const size = s.durationS != null ? formatMin(s.durationS) : formatM(s.distanceM ?? 0);
  return `${stepName(s)}, ${size}.`;
}

/** What the block is, in a word or two: "Warm up", "Walk", "Comfortably hard". */
export function stepName(s: Step): string {
  return s.kind === 'warm' ? ui().workout.warmUp : s.kind === 'cool' ? ui().workout.coolDown : s.kind === 'walk' ? ui().workout.walk : s.kind === 'jog' || s.kind === 'float' ? ui().workout.jog : s.kind === 'stride' ? ui().workout.stride : s.label.split('.')[0];
}

/** How it should feel, after the name: "Full sentences." Empty when the label says nothing more. */
export function stepFeel(s: Step): string {
  return EFFORT_LABEL[s.effort].split('. ').slice(1).join('. ');
}

/** The big number on the block card: "4:12" for a timed block, "650 m" for a distance one. */
export function leftClock(v: WorkoutView): string {
  return formatLeft(v).replace(/ left$/, '');
}

export function formatMin(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? ui().workout.xMinXS(m, s) : `${m} min`;
}

export function formatM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${Math.round(m)} m`;
}

export function formatLeft(v: WorkoutView): string {
  if (v.leftS != null) {
    const m = Math.floor(v.leftS / 60);
    const s = Math.floor(v.leftS % 60);
    return ui().workout.xXLeft(m, String(s).padStart(2, '0'));
  }
  if (v.leftM != null) return `${formatM(v.leftM)} left`;
  return '';
}
