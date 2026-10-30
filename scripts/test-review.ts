// A guided session as it was run, set against what it asked for, and what an
// answer to "How did it feel?" does to the plan. Every plan, at every day
// count, gets tough answers on its easy days and must still keep the nine rules.
//   npm run test:review
import { PLANS, daysFit, type RunnerProfile } from '../src/training/catalogue.ts';
import { addDays, dayStart } from '../src/training/dates.ts';
import { generate } from '../src/training/generate.ts';
import { pacesFromRace } from '../src/training/paces.ts';
import { applyFeel } from '../src/training/adapt.ts';
import { MAX_VDOT_STEP, refreshPaces, soFar } from '../src/training/overview.ts';
import { feelToRpe, reviewSession } from '../src/training/review.ts';
import { validatePlan } from '../src/training/rules.ts';
import { paceSetFor } from '../src/training/sessions.ts';
import type { Plan, PlanSetup, Session } from '../src/training/types.ts';
import { advance, createWorkout, finishWorkout } from '../src/training/workout.ts';

let failures = 0;
let checked = 0;
function fail(msg: string) {
  failures++;
  console.log('  ✗ ' + msg);
}

const today = dayStart(Date.UTC(2026, 10, 2, 12)); // a Monday
const runner: RunnerProfile = { weeklyKm: 30, longestKm30: 12, runsPerWeek: 4, easyPaceSPerKm: 360 };
const DAYS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 0], 4: [2, 3, 5, 0], 5: [1, 2, 4, 5, 0], 6: [1, 2, 3, 4, 6, 0] };

function planFor(id: string, days: number): Plan | null {
  const spec = PLANS.find((p) => p.id === id)!;
  const runDays = DAYS[days];
  const raceDate = spec.raceKm == null ? null : addDays(today, spec.weeks * 7 - 1);
  const setup: PlanSetup = { planId: id, startDate: today, raceDate, runDays, longRunDay: runDays.includes(0) ? 0 : runDays[runDays.length - 1], daysPerWeek: days, extraRecovery: false, race: null };
  const res = generate({ spec, setup, runner, paces: null });
  if (!res.ok) return null;
  return { id: 1, setup, name: spec.name, weeks: res.weeks, runner: { ...runner, longestKm30: res.assumedLongestKm }, paces: null, status: 'active', createdAt: today, healthCheckAt: today, log: [] };
}

/** A copy of the plan with every run up to and including `date` done as planned. */
function doneUntil(plan: Plan, date: number): Plan {
  const p = JSON.parse(JSON.stringify(plan)) as Plan;
  for (const s of p.weeks.flatMap((w) => w.sessions)) if (s.date <= date && s.kind !== 'strength' && !s.skipped && !s.done) s.done = { runId: 2, distanceM: s.km * 1000, durationS: s.minutes * 60, at: s.date };
  return p;
}

/** Run a session's steps at a steady `secPerKm`, one tick a second, stopping after `stopAtS` moving seconds. */
function runIt(s: Session, secPerKm: number, stopAtS = Infinity) {
  const w = createWorkout(s.steps);
  const total = w.steps.reduce((a, st) => a + (st.durationS ?? ((st.distanceM ?? 0) / 1000) * secPerKm), 0);
  const end = Math.min(total + 2, stopAtS);
  const t0 = 1_000_000;
  for (let t = 0; t <= end; t++) advance(w, (t / secPerKm) * 1000, t, t0 + t * 1000);
  return finishWorkout(w, (end / secPerKm) * 1000, end, t0 + end * 1000);
}

// ---- The step log ----
{
  const plan = planFor('10k-improve', 4)!;
  const intervals = plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'threshold' || s.kind === 'intervals')!;
  const steps = runIt(intervals, 300);
  const planned = createWorkout(intervals.steps).steps;
  if (steps.length !== planned.length) fail(`a full run logged ${steps.length} steps, the session has ${planned.length}`);
  if (steps.some((st) => !st.full)) fail('a full run left a step unfinished');
  for (const [i, st] of steps.entries()) if (planned[i].durationS != null && Math.abs(st.s - planned[i].durationS!) > 1) fail(`step ${i} logged ${st.s}s, planned ${planned[i].durationS}s`);
  if (steps.some((st, i) => i > 0 && st.from !== steps[i - 1].to)) fail('steps do not follow on in wall-clock time');
  const r = reviewSession({ session: intervals, steps, run: { distanceM: 10000, durationS: intervals.minutes * 60 }, feel: 4, paces: null });
  if (r.verdict !== 'asPlanned') fail(`a full run reads '${r.verdict}', expected asPlanned`);
  if (r.rpe !== 7 || r.load !== Math.round(7 * intervals.minutes)) fail(`rpe ${r.rpe}, load ${r.load} for "hard" over ${intervals.minutes} min`);

  const half = runIt(intervals, 300, (intervals.minutes * 60) / 2);
  if (half[half.length - 1].full) fail('a stopped run closed its last step as finished');
  const rh = reviewSession({ session: intervals, steps: half, run: { distanceM: 5000, durationS: (intervals.minutes * 60) / 2 }, feel: null, paces: null });
  if (rh.verdict !== 'shorter') fail(`half a session reads '${rh.verdict}', expected shorter`);

  // With heart rate: one sample a second at 150 bpm.
  const heart = Array.from({ length: intervals.minutes * 60 }, (_, i) => ({ ts: 1_000_000 + i * 1000, bpm: 150 }));
  const rr = reviewSession({ session: intervals, steps, run: { distanceM: 10000, durationS: intervals.minutes * 60 }, feel: null, paces: null, heart });
  if (!rr.steps.filter((st) => st.s >= 60).every((st) => st.hr === 150)) fail('heart rate was not found for every step of a minute or more');
  checked += 4;
}

// ---- Verdicts ----
{
  const plan = planFor('half-improve', 4)!;
  const easy = plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'easy')!;
  const paces = paceSetFor(runner, pacesFromRace(10, 50 * 60), 'half');
  const steady = runIt(easy, paces.easy);
  const ok = reviewSession({ session: easy, steps: steady, run: { distanceM: 5000, durationS: easy.minutes * 60 }, feel: 2, paces });
  if (ok.verdict !== 'asPlanned') fail(`easy run at easy pace reads '${ok.verdict}'`);
  const quick = reviewSession({ session: easy, steps: runIt(easy, paces.easy * 0.85), run: { distanceM: 6000, durationS: easy.minutes * 60 }, feel: 2, paces });
  if (quick.verdict !== 'quick') fail(`easy run 15% fast reads '${quick.verdict}', expected quick`);
  const noPaces = reviewSession({ session: easy, steps: runIt(easy, paces.easy * 0.85), run: { distanceM: 6000, durationS: easy.minutes * 60 }, feel: 2, paces: null });
  if (noPaces.verdict !== 'asPlanned') fail(`without race paces an easy run was judged on pace ('${noPaces.verdict}')`);
  const tough = reviewSession({ session: easy, steps: steady, run: { distanceM: 5000, durationS: easy.minutes * 60 }, feel: 4, paces: null });
  if (tough.verdict !== 'tough') fail(`easy run that felt hard reads '${tough.verdict}', expected tough`);
  const unguided = reviewSession({ session: easy, steps: null, run: { distanceM: 5000, durationS: easy.minutes * 60 }, feel: null, paces: null });
  if (unguided.verdict !== 'unguided') fail(`a run without steps reads '${unguided.verdict}'`);
  if (feelToRpe(1) !== 2 || feelToRpe(5) !== 9) fail('feel → CR-10 mapping changed');
  checked += 6;
}

// ---- How it felt, across every plan: never more load, always the nine rules ----
for (const spec of PLANS) {
  for (const days of spec.daysOptions) {
    if (!daysFit(spec, runner, days)) continue;
    const plan = planFor(spec.id, days);
    if (!plan) continue;
    const runs = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength' && s.kind !== 'rest');
    const kmBefore = runs.reduce((a, s) => a + s.km, 0);
    // Two easy runs in the same week that felt hard, in an ordinary week and in a light one.
    for (const light of [false, true]) {
      const week = plan.weeks.find((w) => w.index >= 3 && (w.kind === 'light') === light && w.sessions.filter((s) => !s.hard && s.kind === 'easy').length >= 2 && w.kind !== 'race' && w.kind !== 'taper');
      if (!week) continue;
      const [a, b] = week.sessions.filter((s) => !s.hard && s.kind === 'easy');
      // The runner ran everything up to each answer, as planned.
      let p = applyFeel(doneUntil(plan, a.date), a.date, a.id, 4).plan;
      const r = applyFeel(doneUntil(p, b.date), b.date, b.id, 5);
      p = r.plan;
      checked++;
      const after = p.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength' && s.kind !== 'rest');
      const kmAfter = after.reduce((x, s) => x + s.km, 0);
      if (kmAfter > kmBefore + 0.05) fail(`${spec.id} ${days}d${light ? ' light week' : ''}: tough answers added ${(kmAfter - kmBefore).toFixed(1)} km`);
      const hardNear = after.find((s) => s.date > a.date && s.date <= addDays(a.date, 3) && s.hard && !s.done);
      if (hardNear) fail(`${spec.id} ${days}d${light ? ' light week' : ''}: a hard session stayed within three days of a tough easy run`);
      const v = validatePlan(p, spec);
      if (v.length) fail(`${spec.id} ${days}d${light ? ' light week' : ''}: ${v.length} rule(s) broken after tough answers: ${v.slice(0, 3).map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      const following = p.weeks.find((w) => w.start === addDays(week.start, 7));
      if (r.lighter && following && following.sessions.some((s) => s.hard)) fail(`${spec.id} ${days}d${light ? ' light week' : ''}: the lighter week still has a hard session`);
      // A good answer changes nothing but the log.
      const calm = applyFeel(plan, a.date, a.id, 2).plan;
      if (JSON.stringify(calm.weeks) !== JSON.stringify(plan.weeks)) fail(`${spec.id} ${days}d${light ? ' light week' : ''}: an easy answer changed the plan`);
    }
  }
}

// ---- Your plan so far ----
for (const spec of PLANS) {
  const days = spec.daysOptions[0];
  if (!daysFit(spec, runner, days)) continue;
  const plan = planFor(spec.id, days);
  if (!plan) continue;
  checked++;
  // Phases cover every week once, in order.
  const f0 = soFar(plan, today);
  let next = plan.weeks[0].index;
  for (const ph of f0.phases) {
    if (ph.from !== next || ph.to < ph.from) fail(`${spec.id}: phases jump at week ${ph.from} (expected ${next})`);
    next = ph.to + 1;
  }
  if (next !== plan.weeks[plan.weeks.length - 1].index + 1) fail(`${spec.id}: phases stop at week ${next - 1}`);
  if (spec.raceKm != null && f0.phases[f0.phases.length - 1].phase !== 'taper') fail(`${spec.id}: a race plan does not end in the taper`);
  if (f0.due !== 0 || f0.done !== 0) fail(`${spec.id}: a fresh plan already has ${f0.due} due`);
  // Three weeks in: everything run but one skipped and one let slide.
  const at = addDays(today, 21);
  const p = doneUntil(plan, addDays(at, -1));
  const runs = p.weeks.flatMap((w) => w.sessions).filter((x) => x.kind !== 'strength' && x.kind !== 'rest' && x.date < at);
  runs[1].done = null;
  runs[1].skipped = true;
  runs[2].done = null;
  const f = soFar(p, at);
  if (f.due !== runs.length - 1 || f.done !== runs.length - 2 || f.skipped !== 1 || f.missed !== 1) fail(`${spec.id}: three weeks in reads due ${f.due} done ${f.done} skipped ${f.skipped} missed ${f.missed}, expected ${runs.length - 1}/${runs.length - 2}/1/1`);
  if (f.weeks.filter((w) => w.when === 'past').length !== 3) fail(`${spec.id}: ${f.weeks.filter((w) => w.when === 'past').length} weeks read as past after three`);
  const only1 = soFar(p, at, (w) => w.index === plan.weeks[0].index);
  if (only1.weeks.length !== 1) fail(`${spec.id}: a locked view shows ${only1.weeks.length} weeks`);
}
{
  const plan = planFor('10k-improve', 4)!;
  const withPaces = { ...plan, paces: pacesFromRace(10, 50 * 60) };
  const slower = refreshPaces(withPaces, 10, 52 * 60, addDays(today, 42));
  if (slower.capped || slower.paces.vdot >= withPaces.paces.vdot) fail('a slower race did not lower the paces');
  if (slower.plan.pacesAt !== addDays(today, 42) || !slower.plan.log.some((e) => e.kind === 'paces')) fail('refreshing paces left no date or log line');
  const leap = refreshPaces(withPaces, 5, 17 * 60, addDays(today, 42));
  if (!leap.capped || Math.abs(leap.paces.vdot - (withPaces.paces.vdot + MAX_VDOT_STEP)) > 0.2) fail(`a huge jump gave VDOT ${leap.paces.vdot.toFixed(1)} from ${withPaces.paces.vdot.toFixed(1)}, capped=${leap.capped}`);
  const stale = soFar({ ...withPaces, pacesAt: today }, addDays(today, 43));
  if (stale.pacesWeeks !== 6) fail(`paces set 43 days ago read as ${stale.pacesWeeks} weeks`);
  checked += 4;
}

console.log(`\n${checked} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
