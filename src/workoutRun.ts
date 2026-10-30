// The guided session during a run: steps advance off the tracker's own tick,
// so cues arrive with the screen off, and the run screen reads the current
// step to draw it. The steps as run are kept here until the run is saved.

import { cueWorkoutStep } from './cues';
import { setProgressHook, type TrackingStatus } from './tracking';
import type { Session, StepDone } from './training/types';
import { advance, createWorkout, finishWorkout, stepCue, type WorkoutState, type WorkoutView } from './training/workout';

export interface GuidedRun {
  session: Session;
  view: WorkoutView;
}

let session: Session | null = null;
let state: WorkoutState | null = null;
let current: GuidedRun | null = null;
const listeners = new Set<(g: GuidedRun | null) => void>();

function emit() {
  listeners.forEach((l) => l(current));
}

function onProgress(distanceM: number, durationS: number, status: TrackingStatus) {
  if (!state || !session || status === 'idle') return;
  const { view, changed } = advance(state, distanceM, durationS, Date.now());
  current = { session, view };
  if (changed) cueWorkoutStep(stepCue(view.step, view.finished), view.finished);
  emit();
}

/** Call just before the run starts. The first step is announced as the run begins. */
export function beginWorkout(s: Session) {
  session = s;
  state = createWorkout(s.steps);
  current = { session: s, view: advance(state, 0, 0, Date.now()).view };
  setProgressHook(onProgress);
  if (current.view.step) cueWorkoutStep(stepCue(current.view.step, false));
  emit();
}

export function endWorkout() {
  setProgressHook(null);
  session = null;
  state = null;
  current = null;
  emit();
}

/** At save: every step as it was run, the one in progress closed where the run stopped. null without a guided session. */
export function takeWorkoutSteps(distanceM: number, durationS: number): StepDone[] | null {
  if (!state) return null;
  return finishWorkout(state, distanceM, durationS, Date.now()).map((s) => ({ ...s }));
}

export function currentWorkout(): GuidedRun | null {
  return current;
}

export function subscribeWorkout(l: (g: GuidedRun | null) => void): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}
