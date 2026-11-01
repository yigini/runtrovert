// A quick workout: run-walk or intervals of your own, without joining a plan.
// It becomes an ordinary Session so the guided steps, voice cues, watch and
// heart-rate ranges work exactly as they do for a plan's session. Free: one
// workout is a single-run thing.

import { ui } from '../i18n/ui';
import { EFFORT_LABEL } from './sessions';
import type { Session, Step } from './types';
import { formatMin } from './workout';

export type QuickEffort = 'easy' | 'steady' | 'hard';
export type QuickRest = 'walk' | 'jog';

export interface QuickSpec {
  workS: number;
  effort: QuickEffort;
  restS: number; // 0: no break between repeats
  rest: QuickRest;
  reps: number;
  warmMin: number; // 0, 5 or 10
  coolMin: number;
}

export const WORK_S = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 900, 1200];
export const REST_S = [0, 30, 60, 90, 120, 180, 240, 300];
export const WARM_MIN = [0, 5, 10];
export const MAX_REPS = 20;

export type QuickPresetKey = 'runWalk' | 'gentle' | 'tempo' | 'surges';

export const QUICK_PRESETS: Record<QuickPresetKey, QuickSpec> = {
  runWalk: { workS: 180, effort: 'easy', restS: 60, rest: 'walk', reps: 6, warmMin: 5, coolMin: 5 },
  gentle: { workS: 60, effort: 'easy', restS: 60, rest: 'walk', reps: 10, warmMin: 5, coolMin: 0 },
  tempo: { workS: 180, effort: 'hard', restS: 120, rest: 'jog', reps: 5, warmMin: 10, coolMin: 10 },
  surges: { workS: 60, effort: 'steady', restS: 60, rest: 'jog', reps: 8, warmMin: 10, coolMin: 5 },
};

const near = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);

/** Inside the steppers' values, and hard running always starts with a warm-up of at least 5 minutes. */
export function clampSpec(s: QuickSpec): QuickSpec {
  const effort: QuickEffort = s.effort === 'hard' || s.effort === 'steady' ? s.effort : 'easy';
  const warm = near(WARM_MIN, s.warmMin);
  return {
    workS: near(WORK_S, s.workS),
    effort,
    restS: near(REST_S, s.restS),
    rest: s.rest === 'jog' ? 'jog' : 'walk',
    reps: Math.max(1, Math.min(MAX_REPS, Math.round(s.reps))),
    warmMin: effort === 'hard' ? Math.max(5, warm) : warm,
    coolMin: near(WARM_MIN, s.coolMin),
  };
}

export function quickSteps(spec: QuickSpec): Step[] {
  const s = clampSpec(spec);
  const steps: Step[] = [];
  if (s.warmMin) steps.push({ kind: 'warm', effort: 'easy', label: ui().sessions.warmUpEasy, durationS: s.warmMin * 60 });
  for (let i = 0; i < s.reps; i++) {
    steps.push({ kind: s.effort === 'hard' ? 'hard' : 'run', effort: s.effort, label: EFFORT_LABEL[s.effort], durationS: s.workS });
    if (s.restS && i < s.reps - 1) steps.push(s.rest === 'walk' ? { kind: 'walk', effort: 'walk', label: EFFORT_LABEL.walk, durationS: s.restS } : { kind: 'jog', effort: 'easy', label: ui().sessions.jog, durationS: s.restS });
  }
  if (s.coolMin) steps.push({ kind: 'cool', effort: 'easy', label: ui().sessions.coolDownEasy, durationS: s.coolMin * 60 });
  return steps;
}

export function quickMinutes(spec: QuickSpec): number {
  return Math.round(quickSteps(spec).reduce((n, st) => n + (st.durationS ?? 0), 0) / 60);
}

/** "Run 3 min, walk 1 min, 6 times". */
export function quickTitle(spec: QuickSpec): string {
  const s = clampSpec(spec);
  return ui().quick.titleOf(ui().quick.effortWord[s.effort], formatMin(s.workS), s.restS ? ui().quick.restWord[s.rest] : null, s.restS ? formatMin(s.restS) : null, s.reps);
}

const QUICK_PREFIX = 'quick-';

export function isQuick(s: Session | null | undefined): boolean {
  return !!s && s.id.startsWith(QUICK_PREFIX);
}

/** The workout as a session for today, so the run screen guides it like any other. */
export function quickSession(spec: QuickSpec, now: number): Session {
  const s = clampSpec(spec);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const minutes = quickMinutes(s);
  return {
    id: `${QUICK_PREFIX}${now}`,
    date: d.getTime(),
    kind: s.effort === 'easy' && s.rest === 'walk' && s.restS ? 'runwalk' : s.effort === 'easy' ? 'easy' : 'fartlek',
    title: quickTitle(s),
    summary: ui().quick.about(minutes),
    why: ui().quick.why,
    minutes,
    km: 0,
    hard: s.effort === 'hard',
    optional: true,
    steps: quickSteps(s),
    done: null,
    skipped: false,
    note: null,
  };
}
