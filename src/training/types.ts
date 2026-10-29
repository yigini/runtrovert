// What a plan looks like once it has been generated for one runner.

import type { RunnerProfile } from './catalogue';
import type { Paces } from './paces';

export type Effort = 'walk' | 'easy' | 'steady' | 'race' | 'threshold' | 'hard' | 'fast';

export type SessionKind =
  | 'rest'
  | 'runwalk'
  | 'easy'
  | 'recovery'
  | 'long'
  | 'strides'
  | 'fartlek'
  | 'hills'
  | 'threshold'
  | 'intervals'
  | 'reps'
  | 'racepace'
  | 'strength'
  | 'race';

export interface Step {
  kind: 'warm' | 'run' | 'walk' | 'hard' | 'jog' | 'cool' | 'stride' | 'float';
  effort: Effort;
  durationS?: number; // one of the two
  distanceM?: number;
  label: string; // "Comfortably hard"
}

export interface Session {
  id: string; // "w6d4"
  date: number; // local midnight, epoch ms
  kind: SessionKind;
  title: string; // "Threshold 2 × 8 min"
  summary: string; // "10 min easy, 2 × 8 min comfortably hard with 2 min jog, 10 min easy"
  why: string;
  minutes: number; // planned running time (0 for rest/strength)
  km: number; // planned distance; time-based sessions carry an estimate
  hard: boolean; // counts as a quality session
  optional: boolean;
  steps: Step[];
  done: { runId: number; distanceM: number; durationS: number; at: number } | null;
  skipped: boolean; // missed, or deliberately rested
  note: string | null; // what adaptation changed here, in words
}

export type WeekKind = 'base' | 'build' | 'light' | 'peak' | 'taper' | 'race';

export interface Week {
  index: number; // 1-based
  start: number; // local midnight of the week's first day (Monday)
  kind: WeekKind;
  targetKm: number;
  partial?: boolean; // a rebuild started mid-week: the rules read it as history
  sessions: Session[];
}

export interface PlanSetup {
  planId: string;
  startDate: number; // local midnight; the plan's first Monday is on or before it
  raceDate: number | null; // local midnight of race day
  runDays: number[]; // 0 = Sunday
  longRunDay: number;
  daysPerWeek: number;
  extraRecovery: boolean; // light week every third instead of fourth, no back-to-back run days
  race?: { distanceKm: number; timeS: number } | null; // a recent result, for paces
}

export type PlanStatus = 'active' | 'paused' | 'done' | 'stopped';

export interface Plan {
  id: number; // database row
  setup: PlanSetup;
  name: string;
  weeks: Week[];
  runner: RunnerProfile; // the starting point the plan was built from
  paces: Paces | null;
  status: PlanStatus;
  createdAt: number;
  healthCheckAt: number | null;
  log: PlanEvent[]; // what happened along the way, newest last
}

export type PlanEvent =
  | { at: number; kind: 'energy'; mood: number; choice: 'easy' | 'rest' | 'planned' }
  | { at: number; kind: 'pain'; level: 'none' | 'niggle' | 'pain' }
  | { at: number; kind: 'ill'; days: number }
  | { at: number; kind: 'holiday'; from: number; to: number }
  | { at: number; kind: 'rebuilt'; reason: string }
  | { at: number; kind: 'paused' | 'resumed' | 'stopped' | 'finished' };
