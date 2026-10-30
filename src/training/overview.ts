// "Your plan so far": the plan read back, week by week, planned against done.
// Pure: counts what the store already keeps, never asks the database, never
// changes the plan. Refreshing paces is the one write, and it goes through the
// store like every other change.

import { addDays, daysBetween } from './dates';
import { pacesFromRace, type Paces } from './paces';
import type { Plan, Session, Week, WeekKind } from './types';

export interface WeekSoFar {
  index: number;
  kind: WeekKind;
  when: 'past' | 'now' | 'ahead';
  plannedKm: number;
  doneKm: number;
  plannedMin: number;
  doneMin: number;
  runs: number; // sessions in the week, skipped left out
  done: number;
  skipped: number;
  hardDone: number;
  hardPlanned: number;
  longPlannedKm: number | null;
  longDoneKm: number | null;
  load: number | null; // RPE × minutes, over the sessions with an answer
  answered: number; // sessions with a "How did it feel?"
}

export type Phase = 'base' | 'build' | 'peak' | 'taper';

export interface PhaseSpan {
  phase: Phase;
  from: number; // week index
  to: number;
}

export interface SoFar {
  weeks: WeekSoFar[];
  phases: PhaseSpan[];
  phaseNow: Phase | null;
  // Up to today: what was due, what was run, what was let go.
  due: number;
  done: number;
  skipped: number;
  missed: number; // due, not run, not skipped (fell off quietly)
  asPlanned: number;
  hardDone: number;
  hardDue: number;
  kmDone: number;
  kmDue: number;
  longestDoneKm: number;
  firstLongKm: number | null;
  lastLongKm: number | null;
  pacesWeeks: number | null; // weeks since the paces were set, when there are paces
}

const PHASE_OF: Record<WeekKind, Phase> = { base: 'base', build: 'build', light: 'build', peak: 'peak', taper: 'taper', race: 'taper' };

/** Daniels: look at paces again every four to six weeks; we say so from the sixth. */
export const PACES_STALE_WEEKS = 6;

const runs = (w: Week) => w.sessions.filter((s) => s.kind !== 'strength' && s.kind !== 'rest');
const doneKm = (s: Session) => (s.done ? s.done.distanceM / 1000 : 0);
const doneMin = (s: Session) => (s.done ? s.done.durationS / 60 : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function soFar(plan: Plan, today: number, open: (w: Week) => boolean = () => true): SoFar {
  const shown = plan.weeks.filter(open);
  const weeks: WeekSoFar[] = shown.map((w) => {
    const rs = runs(w);
    const kept = rs.filter((s) => !s.skipped);
    const long = rs.find((s) => s.kind === 'long');
    const answered = rs.filter((s) => s.result?.load != null);
    const end = addDays(w.start, 7);
    return {
      index: w.index,
      kind: w.kind,
      when: today >= end ? 'past' : today >= w.start ? 'now' : 'ahead',
      plannedKm: r1(w.targetKm),
      doneKm: r1(rs.reduce((a, s) => a + doneKm(s), 0)),
      plannedMin: Math.round(kept.reduce((a, s) => a + s.minutes, 0)),
      doneMin: Math.round(rs.reduce((a, s) => a + doneMin(s), 0)),
      runs: kept.length,
      done: rs.filter((s) => s.done).length,
      skipped: rs.filter((s) => s.skipped).length,
      hardDone: rs.filter((s) => s.hard && s.done).length,
      hardPlanned: kept.filter((s) => s.hard).length,
      longPlannedKm: long ? r1(long.km) : null,
      longDoneKm: long?.done ? r1(doneKm(long)) : null,
      load: answered.length ? answered.reduce((a, s) => a + (s.result!.load ?? 0), 0) : null,
      answered: answered.length,
    };
  });

  const phases: PhaseSpan[] = [];
  for (const w of plan.weeks) {
    const phase = PHASE_OF[w.kind];
    const last = phases[phases.length - 1];
    // A light week inside the build is still the build, and so is one between base weeks.
    if (last && (last.phase === phase || (w.kind === 'light' && last.phase !== 'taper'))) last.to = w.index;
    else phases.push({ phase, from: w.index, to: w.index });
  }
  const now = plan.weeks.find((w) => today >= w.start && today < addDays(w.start, 7));
  const phaseNow = now ? phases.find((p) => now.index >= p.from && now.index <= p.to)?.phase ?? null : null;

  // Today counts once it is run; until then it is still ahead.
  const due = shown.flatMap(runs).filter((s) => s.date < today || (s.date === today && !!s.done));
  const longs = due.filter((s) => s.kind === 'long' && s.done && s.done.distanceM > 0);
  return {
    weeks,
    phases,
    phaseNow,
    due: due.filter((s) => !s.skipped).length,
    done: due.filter((s) => s.done).length,
    skipped: due.filter((s) => s.skipped).length,
    missed: due.filter((s) => !s.done && !s.skipped).length,
    asPlanned: due.filter((s) => s.result?.verdict === 'asPlanned').length,
    hardDone: due.filter((s) => s.hard && s.done).length,
    hardDue: due.filter((s) => s.hard && !s.skipped).length,
    kmDone: r1(due.reduce((a, s) => a + doneKm(s), 0)),
    kmDue: r1(due.filter((s) => !s.skipped).reduce((a, s) => a + s.km, 0)),
    longestDoneKm: r1(Math.max(0, ...due.map(doneKm))),
    firstLongKm: longs.length ? r1(doneKm(longs[0])) : null,
    lastLongKm: longs.length ? r1(doneKm(longs[longs.length - 1])) : null,
    pacesWeeks: plan.paces ? Math.floor(daysBetween(plan.pacesAt ?? plan.createdAt, today) / 7) : null,
  };
}

/** Most a single refresh may raise VDOT. A big jump is more often a short course or a GPS slip than fitness (Daniels moves one point at a time). */
export const MAX_VDOT_STEP = 3;

/**
 * A recent race or time trial: paces follow it. Slower results are taken as
 * they are; faster ones are taken up to MAX_VDOT_STEP above the paces in use.
 */
export function refreshPaces(plan: Plan, distanceKm: number, timeS: number, today: number): { plan: Plan; paces: Paces; capped: boolean } {
  const p = JSON.parse(JSON.stringify(plan)) as Plan;
  let paces = pacesFromRace(distanceKm, timeS);
  let capped = false;
  if (p.paces && paces.vdot > p.paces.vdot + MAX_VDOT_STEP) {
    const ratio = predictRatio(p.paces.vdot + MAX_VDOT_STEP, paces.vdot, distanceKm, timeS);
    paces = pacesFromRace(distanceKm, timeS * ratio);
    capped = true;
  }
  p.paces = paces;
  p.pacesAt = today;
  p.setup = { ...p.setup, race: { distanceKm, timeS } };
  p.log.push({ at: today, kind: 'paces', vdot: Math.round(paces.vdot * 10) / 10, capped });
  return { plan: p, paces, capped };
}

/** The factor on a race time that lands it on `want` VDOT, by bisection (VDOT falls as time grows). */
function predictRatio(want: number, got: number, distanceKm: number, timeS: number): number {
  let lo = 1;
  let hi = 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pacesFromRace(distanceKm, timeS * mid).vdot > want) lo = mid;
    else hi = mid;
  }
  return got > want ? (lo + hi) / 2 : 1;
}
