// How a session went, set against what it asked for. Pure: the store hands it
// the steps as run, the watch's heart rate and the runner's own answer, and it
// says one thing back. Effort comes first: paces are only judged when they came
// from a real race (rule 8), and nothing here ever adds load.

import { cleanHeart, heartSummary, type HeartSample } from '../heart';
import type { PaceSet } from './sessions';
import type { Feel, Session, SessionResult, Step, StepDone, Verdict } from './types';

/** The talk test on Borg's CR-10: could sing 2, could chat 3, short sentences 5, a few words 7, no words 9. */
const RPE: Record<Feel, number> = { 1: 2, 2: 3, 3: 5, 4: 7, 5: 9 };

export function feelToRpe(f: Feel): number {
  return RPE[f];
}

/** Sessions that should feel easy all the way: a "hard" answer on one of these means something is off. */
const EASY_KINDS: Session['kind'][] = ['easy', 'recovery', 'long', 'runwalk', 'strides'];

export function shouldFeelEasy(s: Session): boolean {
  return !s.hard && EASY_KINDS.includes(s.kind);
}

/** The work of a session, as opposed to warming up, jogging between and cooling down. */
function isMain(k: Step['kind']): boolean {
  return k === 'run' || k === 'hard' || k === 'stride';
}

/** Average heart rate for each step from the watch's samples, where there is a minute or more of them. */
export function withHeart(steps: StepDone[], samples: HeartSample[]): StepDone[] {
  if (!samples.length) return steps;
  return steps.map((st) => {
    if (!st.from || !st.to || st.to <= st.from) return st;
    const h = heartSummary(cleanHeart(samples, st.from, st.to));
    return h ? { ...st, hr: h.avg } : st;
  });
}

export interface ReviewInput {
  session: Session;
  steps: StepDone[] | null; // null when the run was not guided
  run: { distanceM: number; durationS: number };
  feel: Feel | null;
  paces: PaceSet | null; // only from a recent race
  heart?: HeartSample[];
}

export function reviewSession(x: ReviewInput): SessionResult {
  const steps = x.steps ? withHeart(x.steps, x.heart ?? []) : [];
  const minutes = x.run.durationS / 60;
  const rpe = x.feel ? feelToRpe(x.feel) : null;
  return {
    steps,
    feel: x.feel,
    rpe,
    load: rpe != null ? Math.round(rpe * minutes) : null,
    verdict: verdictOf(x.session, steps, x.run, x.feel, x.paces),
  };
}

/** The answer came later (from the session page): same steps, new verdict. */
export function withFeel(session: Session, result: SessionResult | null | undefined, feel: Feel, paces: PaceSet | null): SessionResult {
  const run = session.done ?? { distanceM: 0, durationS: 0 };
  const steps = result?.steps ?? [];
  return reviewSession({ session, steps: steps.length ? steps : null, run: { distanceM: run.distanceM, durationS: run.durationS }, feel, paces });
}

function verdictOf(s: Session, steps: StepDone[], run: { distanceM: number; durationS: number }, feel: Feel | null, paces: PaceSet | null): Verdict {
  const plannedS = s.minutes * 60;
  const tough = feel != null && (shouldFeelEasy(s) ? feel >= 4 : feel >= 5);

  if (!steps.length) {
    if (plannedS > 0 && run.durationS > 0 && run.durationS < plannedS * 0.8) return 'shorter';
    if (tough) return 'tough';
    if (plannedS > 0 && run.durationS > plannedS * 1.2) return 'longer';
    return 'unguided';
  }

  // How much of the main work was run: each step's share, weighted by its size (metres count at 4 m/s).
  const weight = (st: { durationS?: number; distanceM?: number; plannedS?: number; plannedM?: number }) => (st.durationS ?? st.plannedS ?? 0) + ((st.distanceM ?? st.plannedM ?? 0) / 4) * ((st.durationS ?? st.plannedS) == null ? 1 : 0);
  const planned = s.steps.filter((st) => isMain(st.kind)).reduce((a, st) => a + weight(st), 0);
  const ran = steps
    .filter((st) => isMain(st.kind))
    .reduce((a, st) => a + weight(st) * Math.min(1, st.plannedS != null ? st.s / Math.max(1, st.plannedS) : st.m / Math.max(1, st.plannedM ?? 1)), 0);
  if (planned > 0 && ran < planned * 0.8) return 'shorter';
  if (tough) return 'tough';
  if (paces && tooQuick(steps, paces)) return 'quick';
  if (plannedS > 0 && run.durationS > plannedS * 1.2) return 'longer';
  return 'asPlanned';
}

/**
 * Easy running more than 8% quicker than easy pace over five minutes or more,
 * or hard work more than 5% quicker than its pace: more strain, no more benefit
 * (Daniels). Strides and short reps are left alone.
 */
function tooQuick(steps: StepDone[], p: PaceSet): boolean {
  const easy = steps.filter((st) => st.effort === 'easy' && (st.kind === 'run' || st.kind === 'warm' || st.kind === 'cool') && st.m > 0);
  const easyS = easy.reduce((a, st) => a + st.s, 0);
  const easyM = easy.reduce((a, st) => a + st.m, 0);
  if (easyS >= 300 && easyM > 0 && easyS / (easyM / 1000) < p.easy * 0.92) return true;
  const target = (e: StepDone['effort']) => (e === 'threshold' ? p.threshold : e === 'hard' ? p.interval : null);
  const hard = steps.filter((st) => st.kind === 'hard' && target(st.effort) != null && st.s >= 120);
  if (hard.length) {
    const s = hard.reduce((a, st) => a + st.s, 0);
    const m = hard.reduce((a, st) => a + st.m, 0);
    const t = hard.reduce((a, st) => a + target(st.effort)! * st.s, 0) / s;
    // Under 2:00/km is a GPS jump, not a runner: never judged.
    if (m > 0 && s / (m / 1000) < t * 0.95 && s / (m / 1000) > 120) return true;
  }
  return false;
}
