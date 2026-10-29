// Every plan, every day count, a spread of runners, with and without a race
// date, through the nine rules. Also the VDOT table and a printed sample.
//   npm run test:plans            all plans, summary
//   npm run test:plans -- half-improve   print one plan week by week
import { PLANS, checkGate, daysFit, type PlanSpec, type RunnerProfile } from '../src/training/catalogue.ts';
import { addDays, dayStart, WEEKDAY_SHORT } from '../src/training/dates.ts';
import { generate } from '../src/training/generate.ts';
import { formatRaceTime, formatSPerKm, pacesFor, vdotFromRace } from '../src/training/paces.ts';
import { validatePlan } from '../src/training/rules.ts';
import type { PlanSetup, Week } from '../src/training/types.ts';
import { applyEnergy, applyHoliday, applyIllness, applyPain, missedState, rebuild } from '../src/training/adapt.ts';
import { planToIcs } from '../src/training/ics.ts';

const only = process.argv[2];
let failures = 0;
let generated = 0;

function fail(msg: string) {
  failures++;
  console.log('  ✗ ' + msg);
}

// ---- VDOT against Daniels' published table (VDOT 50) ----
{
  const v = vdotFromRace(5, 19 * 60 + 57);
  if (Math.abs(v - 50) > 0.3) fail(`VDOT for 19:57 5K = ${v.toFixed(2)}, expected ≈ 50`);
  const p = pacesFor(50);
  const expect: Array<[string, number, number]> = [['threshold', p.threshold, 255], ['interval', p.interval, 235], ['marathon', p.marathon, 271]];
  for (const [name, got, want] of expect) if (Math.abs(got - want) > 4) fail(`VDOT 50 ${name} pace ${formatSPerKm(got)}, table says ${formatSPerKm(want)}`);
  if (Math.abs(p.predicted.marathon - (3 * 3600 + 10 * 60 + 49)) > 120) fail(`VDOT 50 marathon prediction ${formatRaceTime(p.predicted.marathon)}, table says 3:10:49`);
  if (Math.abs(p.predicted['10k'] - (41 * 60 + 21)) > 40) fail(`VDOT 50 10K prediction ${formatRaceTime(p.predicted['10k'])}, table says 41:21`);
  console.log(`VDOT 50: E ${formatSPerKm(p.easy[0])}–${formatSPerKm(p.easy[1])} M ${formatSPerKm(p.marathon)} T ${formatSPerKm(p.threshold)} I ${formatSPerKm(p.interval)} R ${formatSPerKm(p.reps)} · marathon ${formatRaceTime(p.predicted.marathon)}`);
}

// ---- Runners: at the gate, well above it, and with thin history ----
function runnersFor(spec: PlanSpec, days = spec.daysOptions[0]): Array<[string, RunnerProfile]> {
  const g = spec.gate;
  const base = Math.max(g.weeklyKm ?? spec.startKm, days * 4.5); // nobody sensible runs five days on ten km a week (daysFit says so)
  const atGate: RunnerProfile = { weeklyKm: base, longestKm30: g.longestKm ?? Math.max(base * 0.35, 2), runsPerWeek: g.runsPerWeek ?? spec.daysOptions[0], easyPaceSPerKm: 390 };
  const above: RunnerProfile = { weeklyKm: base * 1.5, longestKm30: (g.longestKm ?? 5) * 1.4, runsPerWeek: spec.daysOptions[spec.daysOptions.length - 1], easyPaceSPerKm: 330 };
  const slow: RunnerProfile = { weeklyKm: base, longestKm30: g.longestKm ?? 3, runsPerWeek: 3, easyPaceSPerKm: 480 };
  const none: RunnerProfile = { weeklyKm: 0, longestKm30: 0, runsPerWeek: 0, easyPaceSPerKm: 390 };
  return [['at gate', atGate], ['above', above], ['slow', slow], ['no history', none]];
}

const DAY_SETS: Record<number, number[][]> = {
  2: [[2, 6], [3, 0]],
  3: [[2, 4, 0], [1, 3, 6]],
  4: [[2, 3, 5, 0], [1, 3, 5, 6]],
  5: [[1, 2, 4, 5, 0], [2, 3, 4, 6, 0]],
  6: [[1, 2, 3, 4, 6, 0], [1, 2, 3, 5, 6, 0]],
};

const today = dayStart(Date.UTC(2026, 10, 2, 12)); // a Monday in November 2026, local
const thursday = addDays(today, 3);

function setupFor(spec: PlanSpec, days: number, runDays: number[], start: number, raceWeeks: number | null, extra = false): PlanSetup {
  const longRunDay = runDays.includes(0) ? 0 : runDays[runDays.length - 1];
  const raceDate = raceWeeks == null ? null : addDays(start, raceWeeks * 7 - 1 - ((new Date(start).getDay() + 6) % 7)); // a Sunday
  return { planId: spec.id, startDate: start, raceDate, runDays, longRunDay, daysPerWeek: days, extraRecovery: extra, race: null };
}

function printPlan(weeks: Week[]) {
  for (const w of weeks) {
    console.log(`  week ${w.index} (${w.kind}) ${w.targetKm} km`);
    for (const s of w.sessions) {
      const d = new Date(s.date);
      console.log(`    ${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2)} ${s.hard ? '!' : ' '} ${s.title.padEnd(28)} ${String(s.km).padStart(5)} km ${String(s.minutes).padStart(4)} min  ${s.summary}`);
    }
  }
}

for (const spec of PLANS) {
  if (only && spec.id !== only) continue;
  let specFails = 0;
  for (const days of spec.daysOptions) {
    for (const runDays of DAY_SETS[days]) {
      for (const [label, runner] of runnersFor(spec, days)) {
        if (!daysFit(spec, runner, days)) continue; // the app steers away from five days on fifteen km
        const raceOptions: Array<number | null> = spec.raceKm == null ? [null] : [spec.weeks, spec.minWeeks, spec.weeks + 4];
        for (const raceWeeks of raceOptions) {
          for (const start of [today, thursday]) {
            for (const extra of [false, true]) {
              const setup = setupFor(spec, days, runDays, start, raceWeeks, extra);
              const res = generate({ spec, setup, runner, paces: null });
              if (!res.ok) {
                fail(`${spec.id} ${days}d [${runDays}] ${label} race@${raceWeeks} extra=${extra}: ${res.message}`);
                specFails++;
                continue;
              }
              generated++;
              const v = validatePlan({ weeks: res.weeks, setup, runner: { ...runner, longestKm30: res.assumedLongestKm }, paces: null }, spec);
              if (v.length) {
                specFails++;
                fail(`${spec.id} ${days}d [${runDays}] ${label} race@${raceWeeks} ${start === thursday ? 'Thu start' : 'Mon start'} extra=${extra}: ${v.length} violation(s)`);
                for (const x of v.slice(0, 6)) console.log(`      rule ${x.rule} week ${x.week}: ${x.message}`);
                if (only) printPlan(res.weeks);
              }
            }
          }
        }
      }
    }
  }
  console.log(`${specFails ? '✗' : '✓'} ${spec.name}`);
  if (only) {
    const runner = runnersFor(spec)[0][1];
    const setup = setupFor(spec, spec.daysOptions[0], DAY_SETS[spec.daysOptions[0]][0], today, spec.raceKm == null ? null : spec.weeks);
    const res = generate({ spec, setup, runner, paces: null });
    if (res.ok) printPlan(res.weeks);
    console.log(checkGate(spec, runner));
  }
}

/** A copy of the plan with every run up to and including `date` done as planned. */
function doneUntil<P extends { weeks: Week[] }>(plan: P, date: number): P {
  const p = JSON.parse(JSON.stringify(plan)) as P;
  for (const s of p.weeks.flatMap((w) => w.sessions)) if (s.date <= date && s.kind !== 'strength' && !s.skipped) s.done = { runId: 2, distanceM: s.km * 1000, durationS: s.minutes * 60, at: s.date };
  return p;
}

// ---- Adaptation keeps the rules ----
{
  const spec = PLANS.find((p) => p.id === 'half-improve')!;
  const runner = runnersFor(spec)[0][1];
  const setup = setupFor(spec, 4, [2, 3, 5, 0], today, 12);
  const res = generate({ spec, setup, runner, paces: null });
  if (res.ok) {
    const plan = { id: 1, setup, name: spec.name, weeks: res.weeks, runner: { ...runner, longestKm30: res.assumedLongestKm }, paces: null, status: 'active' as const, createdAt: today, healthCheckAt: today, log: [] };
    // Finish the first three weeks, then vanish for 16 days.
    const w3end = addDays(today, 21);
    for (const w of plan.weeks) for (const s of w.sessions) if (s.date < w3end && s.kind !== 'strength') s.done = { runId: 1, distanceM: s.km * 1000, durationS: s.minutes * 60, at: s.date };
    const back = addDays(w3end, 16);
    const state = missedState(plan, back);
    if (state.kind !== 'stepback') fail(`16-day gap gave ${state.kind}, expected stepback`);
    const rebuilt = rebuild(plan, spec, back, { ...runner, weeklyKm: 0, longestKm30: 10 }, state.kind);
    if (!rebuilt.ok) fail(`rebuild failed: ${rebuilt.message}`);
    else {
      const v = validatePlan(rebuilt.plan, spec);
      // Weeks before the gap are frozen history; the rules look at what comes after.
      const after = v.filter((x) => x.week == null || x.week >= rebuilt.plan.weeks.find((w) => w.start >= addDays(back, -7))!.index);
      if (after.length) {
        fail(`rebuilt plan breaks ${after.length} rule(s)`);
        for (const x of after.slice(0, 6)) console.log(`      rule ${x.rule} week ${x.week}: ${x.message}`);
        printPlan(rebuilt.plan.weeks.filter((w) => w.index >= 5));
      }
      const race = rebuilt.plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'race');
      if (!race || race.date !== setup.raceDate) fail('rebuilt plan lost the race');
    }

    // Low energy before a hard day moves it; pain rests two days; illness clears a week.
    const fresh = generate({ spec, setup, runner, paces: null });
    if (fresh.ok) {
      const p2 = { ...plan, weeks: fresh.weeks };
      const hard = p2.weeks.flatMap((w) => w.sessions).find((s) => s.hard)!;
      const e = applyEnergy(p2, hard.date, 2, 'easy');
      const same = e.plan.weeks.flatMap((w) => w.sessions).find((s) => s.date === hard.date && s.kind !== 'strength')!;
      if (same.hard) fail('low energy left the hard session in place');
      const v = validatePlan(e.plan, spec);
      if (v.length) {
        fail(`energy adaptation breaks ${v.length} rule(s)`);
        for (const x of v.slice(0, 4)) console.log(`      rule ${x.rule} week ${x.week}: ${x.message}`);
      }
      // Pain is reported after the run, so the run that hurt is done; everything due before it was done too.
      const pain = applyPain(doneUntil(p2, hard.date), hard.date, 'pain');
      const nextTwo = pain.plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date > hard.date && s.date <= addDays(hard.date, 2) && s.kind !== 'strength');
      if (nextTwo.some((s) => !s.skipped)) fail('pain did not rest the next two days');
      const easyWeek = pain.plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date > addDays(hard.date, 2) && s.date <= addDays(hard.date, 9) && s.kind !== 'strength');
      if (!easyWeek.length || easyWeek.some((s) => s.hard || s.skipped)) fail('pain did not keep a week of easy running');
      const v2 = validatePlan(pain.plan, spec);
      if (v2.length) fail(`pain adaptation breaks ${v2.length} rule(s): ${v2.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      if (!pain.plan.log.some((e) => e.kind === 'rebuilt')) fail('pain did not rebuild the weeks after');
      if (pain.physio) fail('first pain asked for a physio');
      // Pain again within two weeks: hard sessions pause for four weeks.
      const nextHard = pain.plan.weeks.flatMap((w) => w.sessions).find((s) => s.hard && s.date > hard.date)!;
      const again = applyPain(pain.plan, addDays(hard.date, 12), 'pain');
      if (!again.physio) fail('second pain in two weeks did not ask for a physio');
      const paused = again.plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date > addDays(hard.date, 14) && s.date <= addDays(hard.date, 42) && s.hard && !s.skipped);
      if (paused.length) fail(`second pain left ${paused.length} hard session(s) in the next four weeks`);
      const v2b = validatePlan(again.plan, spec);
      if (v2b.length) fail(`second pain breaks ${v2b.length} rule(s): ${v2b.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      if (!nextHard) fail('no hard session after the first pain');
      // Three low-energy days in a week make the next week lighter.
      let tired = p2;
      let fatigue: string = 'ok';
      const runDays = p2.weeks[2].sessions.filter((s) => s.kind !== 'strength').slice(0, 3);
      for (const s of runDays) {
        const r = applyEnergy(doneUntil(tired, addDays(s.date, -1)), s.date, 2, 'easy');
        tired = r.plan;
        fatigue = r.fatigue;
      }
      if (fatigue !== 'lighter') fail(`three low days gave '${fatigue}', expected 'lighter'`);
      if (tired.weeks[3].kind !== 'light' || tired.weeks[3].sessions.some((s) => s.hard)) fail('the week after three low days is not lighter');
      const v2c = validatePlan(tired, spec);
      if (v2c.length) fail(`fatigue adaptation breaks ${v2c.length} rule(s): ${v2c.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      // Resting the long run: next week's long run must not leap past the last one actually run.
      const long = p2.weeks[2].sessions.find((s) => s.kind === 'long')!;
      const rested = applyEnergy(doneUntil(p2, addDays(long.date, -1)), long.date, 1, 'rest');
      const v2d = validatePlan(rested.plan, spec);
      if (v2d.length) fail(`resting the long run breaks ${v2d.length} rule(s): ${v2d.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      const nextLong = rested.plan.weeks[3].sessions.find((s) => s.kind === 'long')!;
      const prevLong = p2.weeks[1].sessions.find((s) => s.kind === 'long')!;
      if (nextLong.km > Math.max(prevLong.km * 1.1, prevLong.km + 0.5) + 0.3) fail(`after a rested long run the next one is ${nextLong.km} km, the last one run was ${prevLong.km} km`);
      // Days away are planned rest, not misses.
      const away = applyHoliday(doneUntil(p2, addDays(today, 9)), addDays(today, 14), addDays(today, 24), addDays(today, 10));
      const awayState = missedState(away.plan, addDays(today, 25), addDays(today, 13));
      if (awayState.kind !== 'none') fail(`a holiday counted as a ${awayState.kind}`);
      if (away.plan.weeks.flatMap((w) => w.sessions).some((s) => s.date >= addDays(today, 14) && s.date <= addDays(today, 24) && s.kind !== 'strength' && !s.skipped)) fail('holiday days still have runs');
      const v2e = validatePlan(away.plan, spec);
      if (v2e.length) fail(`holiday breaks ${v2e.length} rule(s): ${v2e.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      const race4 = away.plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'race');
      if (!race4 || race4.date !== setup.raceDate) fail('holiday rebuild lost the race');
      const awayLong = applyHoliday(doneUntil(p2, addDays(today, 9)), addDays(today, 14), addDays(today, 29), addDays(today, 10));
      const v2f = validatePlan(awayLong.plan, spec);
      if (v2f.length) fail(`long holiday breaks ${v2f.length} rule(s): ${v2f.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      const backWeek = awayLong.plan.weeks.find((w) => w.start >= addDays(today, 30) && !w.partial)!;
      if (backWeek.targetKm > p2.weeks[1].targetKm * 0.75) fail(`after 16 days away the first week back is ${backWeek.targetKm} km, before it was ${p2.weeks[1].targetKm} km`);
      const ill = applyIllness(p2, hard.date, 4);
      const easyOnly = ill.plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date >= addDays(hard.date, 4) && s.date < addDays(hard.date, 8));
      if (easyOnly.some((s) => s.hard)) fail('illness left a hard session in the easy-only days');
      const v3 = validatePlan(ill.plan, spec);
      if (v3.length) fail(`illness adaptation breaks ${v3.length} rule(s): ${v3.map((x) => `r${x.rule} w${x.week} ${x.message}`).join('; ')}`);
      const race3 = ill.plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'race');
      if (!race3 || race3.date !== setup.raceDate) fail('illness rebuild lost the race');
    }

    const ics = planToIcs(plan);
    const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const runsPlanned = plan.weeks.flatMap((w) => w.sessions).filter((s) => !s.skipped).length;
    if (events !== runsPlanned) fail(`ics has ${events} events for ${runsPlanned} sessions`);
    if (!ics.startsWith('BEGIN:VCALENDAR') || !ics.trimEnd().endsWith('END:VCALENDAR')) fail('ics is not a calendar');
  }
}

console.log(`\n${generated} plans generated, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
