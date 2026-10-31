// The guided session during a run: steps advance off the tracker's own tick,
// so cues arrive with the screen off, and the run screen reads the current
// step to draw it. The steps as run are kept here until the run is saved.

import { cueWorkoutStep } from './cues';
import { setProgressHook, type TrackingStatus } from './tracking';
import { loadHeart, loadPlan, planSpec } from './training/store';
import { newNudge, nudgeable, shouldNudge, stepRange, type HeartSetup, type NudgeState } from './training/zones';
import type { Goal } from './training/catalogue';
import { setHeartListener } from './heartIn';
import { ui } from './i18n/ui';
import type { Session, StepDone } from './training/types';
import { advance, createWorkout, finishWorkout, stepCue, type WorkoutState, type WorkoutView } from './training/workout';

export interface GuidedRun {
  session: Session;
  view: WorkoutView;
  range: [number, number] | null; // the current step's heart-rate range, once the runner has given their numbers
}

let session: Session | null = null;
let state: WorkoutState | null = null;
let current: GuidedRun | null = null;
let heart: HeartSetup | null = null;
let goal: Goal = 'none';
let nudge: NudgeState = newNudge();
const listeners = new Set<(g: GuidedRun | null) => void>();

function emit() {
  listeners.forEach((l) => l(current));
}

function onProgress(distanceM: number, durationS: number, status: TrackingStatus) {
  if (!state || !session || status === 'idle') return;
  const { view, changed } = advance(state, distanceM, durationS, Date.now());
  current = { session, view, range: rangeOf(view) };
  if (changed) cueWorkoutStep(stepCue(view.step, view.finished), view.finished);
  emit();
}

/** Call just before the run starts. The first step is announced as the run begins. */
export function beginWorkout(s: Session) {
  session = s;
  state = createWorkout(s.steps);
  const first = advance(state, 0, 0, Date.now()).view;
  current = { session: s, view: first, range: null };
  nudge = newNudge();
  setProgressHook(onProgress);
  // The ranges arrive a moment later; the run does not wait for them.
  void Promise.all([loadHeart(), loadPlan()])
    .then(([h, plan]) => {
      heart = h;
      goal = plan ? planSpec(plan).goal : 'none';
      if (current) current = { ...current, range: rangeOf(current.view) };
      emit();
    })
    .catch(() => {});
  setHeartListener(onHeart);
  if (current.view.step) cueWorkoutStep(stepCue(current.view.step, false));
  emit();
}

function rangeOf(v: WorkoutView): [number, number] | null {
  return v.step ? stepRange(v.step, goal, heart) : null;
}

/** On easy running only, and only when asked for: a minute over the easy range gets one quiet word. */
function onHeart(bpm: number, ts: number) {
  if (!current || !heart?.easyNudge || !current.view.step || !nudgeable(current.view.step)) return;
  if (shouldNudge(nudge, bpm, ts, current.range?.[1] ?? null)) void cueWorkoutStep(ui().zones.couldBeEasier);
}

export function endWorkout() {
  setHeartListener(null);
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
