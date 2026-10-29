// npm run test:rebuilds — every plan in the catalogue, rebuilt after a break the
// four ways the Adjust my plan sheet offers, must keep the nine rules from the
// day of the rebuild on. Runners are those each plan's entry check lets in, at
// several sizes, day counts, start weekdays, weeks done and gaps.
import { PLANS, checkGate, type RunnerProfile } from '../src/training/catalogue.ts';
import { applyComeback, comebackOptions, keepsRules } from '../src/training/comeback.ts';
import { addDays, dayStart, mondayOf } from '../src/training/dates.ts';
import { generate } from '../src/training/generate.ts';
import { profileFrom } from '../src/training/profile.ts';
import { validatePlan } from '../src/training/rules.ts';
import type { Plan, PlanSetup } from '../src/training/types.ts';

const DAYS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 6], 4: [2, 4, 6, 0], 5: [1, 2, 4, 6, 0], 6: [1, 2, 3, 4, 6, 0] };
let checked = 0;
let failures = 0;
const unavailable: Record<string, number> = {};

for (const spec of PLANS)
  for (const days of spec.daysOptions)
    for (const weekly of [12, 25, 45])
      for (const doneWeeks of [2, 3, 6])
        for (const startOff of [0, 3]) {
          const runner: RunnerProfile = { weeklyKm: weekly, longestKm30: Math.round(weekly * 0.35), runsPerWeek: days, easyPaceSPerKm: 390 };
          if (!checkGate(spec, runner).ok) continue;
          const monday = dayStart(new Date(2026, 10, 2 + startOff, 12).getTime());
          const runDays = DAYS[days];
          const raceDate = spec.raceKm != null ? addDays(mondayOf(monday), spec.weeks * 7 - 1) : null;
          const setup: PlanSetup = { planId: spec.id, startDate: monday, raceDate, runDays, longRunDay: runDays.includes(0) ? 0 : runDays[runDays.length - 1], daysPerWeek: days, extraRecovery: weekly === 25, race: null };
          const made = generate({ spec, setup, runner, paces: null });
          if (!made.ok) {
            failures++;
            console.log(`  ✗ ${spec.id} ${days}d ${weekly} km: does not generate (${made.message})`);
            continue;
          }
          const base: Plan = { id: 1, setup, name: spec.name, weeks: made.weeks, runner: { ...runner, longestKm30: runner.longestKm30 || made.assumedLongestKm }, paces: null, status: 'active', createdAt: monday, healthCheckAt: monday, log: [] };
          // Some weeks done as planned, then nothing.
          const stop = addDays(mondayOf(monday), doneWeeks * 7);
          for (const s of base.weeks.flatMap((w) => w.sessions)) if (s.date < stop && s.kind !== 'strength') s.done = { runId: 1, distanceM: s.km * 1000, durationS: s.minutes * 60, at: s.date };
          const done = base.weeks.flatMap((w) => w.sessions).filter((s) => s.done);
          if (!done.length) continue;
          const lastRun = Math.max(...done.map((s) => s.date));
          const history = done.map((s) => ({ startedAt: s.date + 8 * 3600000, distanceM: s.done!.distanceM, durationS: s.done!.durationS }));
          for (const gap of [8, 10, 13, 18, 24, 30, 40]) {
            const today = addDays(lastRun, gap);
            const now = profileFrom(history, today);
            for (const o of comebackOptions(base, today, lastRun).options) {
              if (o.key === 'pause') continue;
              checked++;
              const r = applyComeback(base, o.key, today, now);
              // Too close to the race to start again, or the race has passed: not a rule break, just not on offer.
              if (!r.ok) {
                unavailable[o.key] = (unavailable[o.key] ?? 0) + 1;
                continue;
              }
              if (!keepsRules(r.plan, spec, today)) {
                failures++;
                const first = r.plan.weeks.find((w) => w.start >= mondayOf(today))?.index ?? 0;
                const v = validatePlan(r.plan, spec).filter((x) => x.week == null || x.week >= first);
                console.log(`  ✗ ${spec.id} ${days}d ${weekly} km, ${doneWeeks} weeks done, ${gap} days off, ${o.key}: ${v.slice(0, 2).map((x) => `rule ${x.rule} week ${x.week}: ${x.message}`).join(' | ')}`);
              }
            }
          }
        }

console.log(`Not on offer (race too close, or passed): ${Object.entries(unavailable).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
console.log(failures ? `\n${failures} of ${checked} rebuilds broke a rule` : `\n${checked} rebuilds, all within the nine rules`);
if (failures) process.exit(1);
