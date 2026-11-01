// A session as a workout the watch can guide on its own: steps with their
// time or distance, and a pace or heart rate target where one helps. Free,
// like every way of taking your own things out of the app. Whether a session
// can be seen at all (week 1 of a plan, quick workouts) is decided by the
// screen that offers the button, never here.

import type { Goal } from './catalogue';
import { paceFor, type PaceSet } from './sessions';
import type { Session, Step } from './types';
import { stepName } from './workout';
import { stepRange, type HeartSetup } from './zones';
import { workoutFileName, writeFitWorkout, type Intensity, type WorkoutIn, type WorkoutStepIn, type WorkoutTarget } from '../io/fitWorkout';

export interface WorkoutFileInput {
  session: Session;
  paces: PaceSet | null; // only when the plan has paces from a race; guessed paces would mislead a watch
  heart: HeartSetup | null;
  goal: Goal;
  createdAt: number;
}

function intensity(s: Step): Intensity {
  switch (s.kind) {
    case 'warm':
      return 'warmup';
    case 'cool':
      return 'cooldown';
    case 'walk':
    case 'jog':
    case 'float':
      return 'recovery';
    default:
      return 'active';
  }
}

/** Pace first (±3% around the step's pace, ±7% when easy), then heart rate, else none. Never on walks or strides. */
export function targetFor(s: Step, paces: PaceSet | null, heart: HeartSetup | null, goal: Goal): WorkoutTarget {
  // Walks, strides and recovery jogs ("as slow as you like") never beep at you.
  if (s.kind === 'walk' || s.kind === 'stride' || s.kind === 'jog' || s.kind === 'float' || s.effort === 'walk') return null;
  if (paces) {
    const p = paceFor(s.effort, paces);
    // Easy running gets a wide band: the watch should not nag on a hill.
    const w = s.effort === 'easy' ? 0.07 : 0.03;
    return { kind: 'pace', slowSPerKm: Math.round(p * (1 + w)), fastSPerKm: Math.round(p * (1 - w)) };
  }
  const r = stepRange(s, goal, heart);
  return r ? { kind: 'heart', low: r[0], high: r[1] } : null;
}

export function sessionWorkout(input: WorkoutFileInput): WorkoutIn {
  const { session, paces, heart, goal } = input;
  const steps: WorkoutStepIn[] = session.steps
    .filter((s) => (s.durationS ?? 0) > 0 || (s.distanceM ?? 0) > 0)
    .map((s) => ({ name: stepName(s), intensity: intensity(s), durationS: s.durationS, distanceM: s.durationS ? undefined : s.distanceM, target: targetFor(s, paces, heart, goal) }));
  return { name: session.title, createdAt: input.createdAt, steps };
}

export function sessionWorkoutFile(input: WorkoutFileInput): { name: string; bytes: Uint8Array } {
  return { name: workoutFileName(input.session.title, input.session.date), bytes: writeFitWorkout(sessionWorkout(input)) };
}

/** Sessions worth a file: something to run, step by step. */
export function hasWorkoutFile(s: Session): boolean {
  return s.kind !== 'rest' && s.kind !== 'strength' && s.steps.some((st) => (st.durationS ?? 0) > 0 || (st.distanceM ?? 0) > 0);
}

