// npm run test:comeback — coming back after a break: when Run home says welcome
// back, what the plan sheet offers, and that every choice keeps the nine rules,
// leaves nothing overdue and never asks for more than before the break.
import { PLANS, type RunnerProfile } from '../src/training/catalogue.ts';
import { applyComeback, checkedOptions, comebackOptions, daysAway, isWelcomeBack, keepsRules, WELCOME_BACK_DAYS } from '../src/training/comeback.ts';
import { addDays, dayStart, mondayOf } from '../src/training/dates.ts';
import { generate } from '../src/training/generate.ts';
import { profileFrom } from '../src/training/profile.ts';
import { validatePlan } from '../src/training/rules.ts';
import type { Plan, PlanSetup } from '../src/training/types.ts';

let failures = 0;
let checked = 0;
const withheld: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  checked++;
  if (!ok) {
    failures++;
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const monday = dayStart(new Date(2026, 10, 2, 12).getTime());

// ---- When it shows ----
{
  const now = new Date(2026, 9, 29, 9).getTime();
  check('no runs yet: ordinary Run home', !isWelcomeBack(null, now));
  check('nine days: ordinary Run home', !isWelcomeBack(new Date(2026, 9, 20, 19).getTime(), now));
  check('ten days: welcome back', isWelcomeBack(new Date(2026, 9, 19, 19).getTime(), now));
  check('days are calendar days', daysAway(new Date(2026, 9, 11, 23, 30).getTime(), now) === 18);
  check('threshold is ten', WELCOME_BACK_DAYS === 10);
}

// ---- The choices, across plans and gaps ----
const runner: RunnerProfile = { weeklyKm: 22, longestKm30: 8, runsPerWeek: 3, easyPaceSPerKm: 390 };
const cases: Array<{ id: string; raceWeeks: number | null; days: number[] }> = [
  { id: '5k-finish', raceWeeks: null, days: [2, 4, 0] },
  { id: '10k-improve', raceWeeks: null, days: [2, 4, 6, 0] },
  { id: 'half-improve', raceWeeks: 16, days: [2, 3, 5, 0] },
  { id: 'keep', raceWeeks: null, days: [1, 3, 6] },
  { id: 'start', raceWeeks: null, days: [2, 4, 6] },
];

for (const c of cases) {
  const spec = PLANS.find((p) => p.id === c.id)!;
  const longRunDay = c.days.includes(0) ? 0 : c.days[c.days.length - 1];
  const raceDate = c.raceWeeks == null ? null : addDays(monday, c.raceWeeks * 7 - 1);
  const setup: PlanSetup = { planId: spec.id, startDate: monday, raceDate, runDays: c.days, longRunDay, daysPerWeek: c.days.length, extraRecovery: false, race: null };
  const made = generate({ spec, setup, runner, paces: null });
  if (!made.ok) {
    check(`${c.id}: plan generates`, false, made.message);
    continue;
  }
  const base: Plan = { id: 1, setup, name: spec.name, weeks: made.weeks, runner: { ...runner, longestKm30: runner.longestKm30 || made.assumedLongestKm }, paces: null, status: 'active', createdAt: monday, healthCheckAt: monday, log: [] };
  // Three weeks done as planned, then nothing.
  const stop = addDays(monday, 21);
  for (const s of base.weeks.flatMap((w) => w.sessions)) if (s.date < stop && s.kind !== 'strength') s.done = { runId: 1, distanceM: s.km * 1000, durationS: s.minutes * 60, at: s.date };
  const lastRun = Math.max(...base.weeks.flatMap((w) => w.sessions).filter((s) => s.done).map((s) => s.date));
  const lastFullKm = base.weeks.find((w) => w.index === 3)!.targetKm;

  for (const gap of [10, 18, 30]) {
    const today = addDays(lastRun, gap);
    const tag = `${c.id}, ${gap} days`;
    // Where the runner stands that day, from the runs they actually did, as the app reads it.
    const history = base.weeks.flatMap((w) => w.sessions).filter((s) => s.done).map((s) => ({ startedAt: s.date + 8 * 3600000, distanceM: s.done!.distanceM, durationS: s.done!.durationS }));
    const now = profileFrom(history, today);
    const { options, recommended } = comebackOptions(base, today, lastRun);
    const keys = options.map((o) => o.key);
    check(`${tag}: default`, recommended === (gap >= 14 ? 'ease' : 'pickup'), recommended);
    check(`${tag}: the default is on offer`, keys.includes(recommended), keys.join(','));
    check(`${tag}: pick up only under four weeks`, keys.includes('pickup') === gap < 28, keys.join(','));
    check(`${tag}: restart and pause always there`, keys.includes('restart') && keys.includes('pause'));

    for (const paused of [false, true]) {
      const plan: Plan = paused ? { ...JSON.parse(JSON.stringify(base)), status: 'paused' } : base;
      // What the sheet shows: only choices that keep the nine rules from this week on.
      const shown = checkedOptions(plan, today, lastRun, now);
      const tp = `${tag}${paused ? ', paused' : ''}`;
      const held = keys.filter((k) => !shown.options.some((o) => o.key === k));
      if (held.length) withheld.push(`${tp}: ${held.join(', ')}`);
      // Under four weeks there is always a way back into the plan; after that, pause with a pointer to Come back is fair.
      const onlyPause = !shown.options.some((o) => o.key !== 'pause');
      check(`${tp}: a way back besides pausing`, !onlyPause || gap >= 28, shown.options.map((o) => o.key).join(','));
      check(`${tp}: only pause says why`, onlyPause === (shown.note != null));
      check(`${tp}: pause always offered`, shown.options.some((o) => o.key === 'pause'));
      check(`${tp}: the pick is on offer`, shown.options.some((o) => o.key === shown.recommended));
      for (const o of shown.options) {
        const t = `${tp}, ${o.key}`;
        const p = o.plan;
        const again = applyComeback(plan, o.key, today, now);
        check(`${t}: same plan when used`, again.ok && JSON.stringify(again.plan) === JSON.stringify(p));
        if (o.key === 'pause') {
          check(`${t}: paused`, p.status === 'paused');
          check(`${t}: weeks untouched`, JSON.stringify(p.weeks) === JSON.stringify(plan.weeks));
          continue;
        }
        check(`${t}: active again`, p.status === 'active');
        const runs = p.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength');
        check(`${t}: nothing overdue`, runs.every((s) => s.date >= today || s.done || s.skipped), runs.filter((s) => s.date < today && !s.done && !s.skipped).length + ' left');
        const v = validatePlan(p, spec);
        const firstNew = p.weeks.find((w) => w.start >= mondayOf(today));
        const after = v.filter((x) => x.week == null || (firstNew && x.week >= firstNew.index));
        check(`${t}: keeps the nine rules`, after.length === 0 && keepsRules(p, spec, today), after.slice(0, 3).map((x) => `rule ${x.rule} week ${x.week}: ${x.message}`).join(' | '));
        // Never more than before the break: this week at or under the last full week, the next one a normal step at most.
        const thisWeek = p.weeks.find((w) => w.start === mondayOf(today));
        const next = p.weeks.find((w) => w.start === addDays(mondayOf(today), 7));
        const slack = lastFullKm * 0.02 + 0.05; // rounding to 100 m per session
        if (!spec.timeBased && thisWeek && thisWeek.kind !== 'race') check(`${t}: this week no more than before`, thisWeek.targetKm <= lastFullKm + slack, `${thisWeek.targetKm} > ${lastFullKm}`);
        if (!spec.timeBased && next && next.kind !== 'race') check(`${t}: next week no more than a step`, next.targetKm <= lastFullKm * 1.1 + slack, `${next.targetKm} > ${lastFullKm}`);
        if (o.key === 'ease' && next && !spec.timeBased && next.kind !== 'race') check(`${t}: ease is lighter`, next.targetKm <= lastFullKm * 0.8, `${next.targetKm} vs ${lastFullKm}`);
        if (o.key === 'restart') {
          check(`${t}: back to week 1`, p.weeks[0].index === 1 && p.setup.startDate === today);
          check(`${t}: nothing done carried over`, runs.every((s) => !s.done));
        }
        check(`${t}: written down`, p.log.some((e) => e.kind === 'rebuilt'));
      }
    }
  }
}

if (withheld.length) {
  console.log('Held back because the engine could not lay them out within the rules:');
  for (const w of withheld) console.log(`  · ${w}`);
}
console.log(failures ? `\n${failures} of ${checked} checks failed` : `\n${checked} checks, all good`);
if (failures) process.exit(1);
