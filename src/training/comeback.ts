// Coming back after a break. Ten days or more without a run and Run home stops
// talking about the plan: nothing is overdue, today is a free run, and what to
// do with the plan is a separate choice. Every choice goes through adapt.ts or
// the generator, so none of them adds load, and each one is checked against
// the nine rules before it is offered. Pure: `npm run test:comeback`.

import { AWAY_QUIET_DAYS } from '../reminderPlan';
import { missedState, rebuild } from './adapt';
import { planById, type PlanSpec, type RunnerProfile } from './catalogue';
import { addDays, dayStart, daysBetween, mondayOf } from './dates';
import { generate } from './generate';
import { validatePlan } from './rules';
import type { Plan, Week } from './types';

/** Days without a run before Run home says welcome back. Reminders go quiet at the same point. */
export const WELCOME_BACK_DAYS = AWAY_QUIET_DAYS;

export type ComebackChoice = 'ease' | 'pickup' | 'restart' | 'pause';

export interface ComebackOption {
  key: ComebackChoice;
  title: string;
  hint: string;
}

/** An option with the plan it would leave, already checked. */
export interface CheckedOption extends ComebackOption {
  plan: Plan;
}

/** Whole days since the last run, or null before the first one. */
export function daysAway(lastRunAt: number | null, now: number): number | null {
  return lastRunAt == null ? null : Math.max(0, daysBetween(lastRunAt, now));
}

/** Ten days or more since a run. A brand-new runner gets the ordinary Run home. */
export function isWelcomeBack(lastRunAt: number | null, now: number): boolean {
  const d = daysAway(lastRunAt, now);
  return d != null && d >= WELCOME_BACK_DAYS;
}

/** The plan week the last run fell in, or the plan's current week if nothing was run yet. */
export function stoppedWeek(plan: Plan, lastRunAt: number | null, today: number): Week {
  const at = lastRunAt != null ? dayStart(lastRunAt) : today;
  const inWeek = plan.weeks.find((w) => at >= w.start && at < addDays(w.start, 7));
  if (inWeek) return inWeek;
  return at < plan.weeks[0].start ? plan.weeks[0] : plan.weeks[plan.weeks.length - 1];
}

/**
 * What the sheet offers, and which one is picked to begin with. Easing back in
 * is the default after two weeks off. A month or more off takes "pick up" away:
 * the plan's own rule is a step back to 60% after that long.
 */
export function comebackOptions(plan: Plan, today: number, lastRunAt: number | null): { options: ComebackOption[]; recommended: ComebackChoice } {
  const gap = missedState(plan, today, lastRunAt).gapDays;
  const options: ComebackOption[] = [
    { key: 'ease', title: 'Ease back in', hint: gap >= 14 ? 'Gentler after more than two weeks off: about 60% of your last full week, then it builds again.' : 'About 60% of your last full week, then it builds again.' },
  ];
  if (gap < 28) options.push({ key: 'pickup', title: 'Pick up where you stopped', hint: 'Where you stopped. The same amount as your last full week, on new dates.' });
  options.push({ key: 'restart', title: 'Start the plan again', hint: 'Back to week 1, from today.' });
  options.push({ key: 'pause', title: 'Leave it paused', hint: 'Run freely. The plan stays where it is.' });
  return { options, recommended: gap >= 14 ? 'ease' : 'pickup' };
}

/**
 * The options as the sheet shows them: each one worked out against where the
 * runner stands today and kept only if the weeks from today keep the nine
 * rules. Leaving it paused is always there. If the usual pick did not pass,
 * the first one that did is picked instead.
 */
export function checkedOptions(plan: Plan, today: number, lastRunAt: number | null, runner: RunnerProfile): { options: CheckedOption[]; recommended: ComebackChoice; note: string | null } {
  const day = dayStart(today);
  const spec = planById(plan.setup.planId);
  const { options, recommended } = comebackOptions(plan, day, lastRunAt);
  const out: CheckedOption[] = [];
  for (const o of options) {
    const r = applyComeback(plan, o.key, day, runner);
    if (!r.ok) continue;
    if (o.key !== 'pause' && (!spec || !keepsRules(r.plan, spec, day))) continue;
    out.push({ ...o, plan: r.plan });
  }
  const pick = out.find((o) => o.key === recommended) ?? out.find((o) => o.key !== 'pause') ?? out[out.length - 1];
  // Nothing but pause passed: say why, and where the gentler plan is.
  const note = pick.key === 'pause' ? 'After this long, this plan cannot pick up again within its own rules. Run freely for now, or start Come back in Train: it is made for this.' : null;
  return { options: out, recommended: pick.key, note };
}

/** The nine rules, judged on the weeks from this one on: the weeks behind are history. */
export function keepsRules(plan: Plan, spec: PlanSpec, today: number): boolean {
  const monday = mondayOf(today);
  const from = plan.weeks.find((w) => w.start >= monday)?.index ?? Infinity;
  return validatePlan(plan, spec).every((v) => v.week != null && v.week < from);
}

/** One line for the card on Run home once a choice is made. */
export function choiceLine(choice: ComebackChoice): string {
  switch (choice) {
    case 'ease':
      return 'Easing back in from today';
    case 'pickup':
      return 'Picked up from today';
    case 'restart':
      return 'Started again at week 1';
    case 'pause':
      return 'Paused for now';
  }
}

export type ComebackResult = { ok: true; plan: Plan } | { ok: false; message: string };

/**
 * Apply the choice. Ease back in and pick up go through `rebuild` (missed
 * sessions drop off as skipped, the weeks ahead are laid out again under the
 * nine rules); start again lays the whole plan out from today; pause only
 * changes the status. Anything but pause also un-pauses the plan.
 */
export function applyComeback(plan: Plan, choice: ComebackChoice, today: number, runner: RunnerProfile): ComebackResult {
  const day = dayStart(today);
  if (choice === 'pause') {
    if (plan.status === 'paused') return { ok: true, plan };
    return { ok: true, plan: withStatus(plan, 'paused', day) };
  }
  const spec = planById(plan.setup.planId);
  if (!spec) return { ok: false, message: 'This plan is no longer in the catalogue.' };
  const base = plan.status === 'paused' ? withStatus(plan, 'active', day) : plan;
  if (choice === 'restart') {
    const setup = { ...base.setup, startDate: day };
    // Week 1 again, never from more than the last full week before the break.
    const before = lastFullWeekKm(base, day);
    const from = before != null && runner.weeklyKm > before ? { ...runner, weeklyKm: before } : runner;
    const res = generate({ spec, setup, runner: from, paces: base.paces });
    if (!res.ok) return { ok: false, message: res.message };
    const p: Plan = {
      ...base,
      setup,
      weeks: res.weeks,
      runner: { ...from, longestKm30: from.longestKm30 > 0 ? from.longestKm30 : res.assumedLongestKm },
      log: [...base.log, { at: day, kind: 'rebuilt', reason: 'Back after a break: started the plan again at week 1.' }],
    };
    return { ok: true, plan: p };
  }
  const reason = choice === 'ease' ? 'Back after a break: eased back in at about 60% of the last full week.' : 'Back after a break: picked up at the volume of the last full week.';
  return rebuild(base, spec, day, runner, choice === 'ease' ? 'stepback' : 'repeat', reason);
}

/** What was actually run in the last week before `day` where most runs were done. */
function lastFullWeekKm(plan: Plan, day: number): number | null {
  const weeks = plan.weeks.filter((w) => addDays(w.start, 7) <= mondayOf(day));
  for (let i = weeks.length - 1; i >= 0; i--) {
    const runs = weeks[i].sessions.filter((s) => s.kind !== 'strength');
    const done = runs.filter((s) => s.done);
    if (runs.length && done.length >= Math.ceil(runs.length * 0.6)) return Math.round(done.reduce((a, s) => a + s.done!.distanceM / 1000, 0) * 10) / 10;
  }
  return null;
}

function withStatus(plan: Plan, status: Plan['status'], day: number): Plan {
  const p = JSON.parse(JSON.stringify(plan)) as Plan;
  p.status = status;
  p.log.push({ at: day, kind: status === 'paused' ? 'paused' : 'resumed' });
  return p;
}
