// The nine rules, as checks. A generated plan is only shipped when every one
// passes for every plan, every day count and a spread of starting points
// (`npm run test:plans`). An adapted plan goes back through the same checks.
//
//  1  Mostly easy: easy and walking minutes ≥ 75% of the week (≥ 85% in Finish and no-race plans).
//  2  No single run more than 10% (or half a km, for beginners) longer than the longest of the previous 30 days (race day excepted).
//  3  Weekly volume up by at most 10% a week and 30% over two weeks (recovery weeks don't reset the clock).
//  4  A lighter week at least every fourth week (third with extra recovery), ≤ 80% of the week before, with no hard session.
//  5  Long runs under the cap, under three hours, and under the plan's share of the week.
//  6  Threshold ≤ 10% of the week, intervals ≤ 8% and 10 km, reps ≤ 5% and 8 km; no hard days back to back;
//     nothing hard the day before the long run; nothing hard in weeks 1–2.
//  7  The taper cuts volume (race week ≤ 60% of the peak) and keeps some intensity and the run days.
//  8  Every session says its effort in words, and carries a pace only when the runner gave a race.
//  9  Strength is optional, at most twice a week.

import type { PlanSpec, RunnerProfile } from './catalogue';
import { daysBetween } from './dates';
import { paceSetFor } from './sessions';
import type { Effort, Plan, Session, Week } from './types';

export interface Violation {
  rule: number;
  week: number | null;
  message: string;
}

const EASY: Effort[] = ['easy', 'walk'];
const KM_TOL = 0.6; // rounding to 5-minute sessions and 0.1 km
const MIN_TOL = 5;

export function validatePlan(plan: Pick<Plan, 'weeks' | 'setup' | 'runner' | 'paces'>, spec: PlanSpec): Violation[] {
  const out: Violation[] = [];
  const weeks = plan.weeks;
  const runner = plan.runner;
  const paces = paceSetFor(runner, plan.paces, spec.goal);
  const startDate = plan.setup.startDate;
  const partial = (w: Week) => !!w.partial || (w.start < startDate && w.index === 1);
  const full = weeks.filter((w) => !partial(w) && w.kind !== 'race');
  const runs = (w: Week) => w.sessions.filter((s) => s.kind !== 'strength' && s.kind !== 'rest' && s.kind !== 'race');
  const easyShareMin = spec.tier === 'finish' || spec.goal === 'none' ? 0.85 : 0.75;

  // ---- 1 mostly easy ----
  for (const w of full) {
    let easyS = 0;
    let allS = 0;
    for (const s of runs(w)) {
      for (const st of s.steps) {
        const secs = st.durationS ?? ((st.distanceM ?? 0) / 1000) * paceOf(st.effort, paces);
        allS += secs;
        if (EASY.includes(st.effort)) easyS += secs;
      }
    }
    if (allS > 0 && easyS / allS < easyShareMin - 0.005) out.push({ rule: 1, week: w.index, message: `only ${Math.round((easyS / allS) * 100)}% easy (needs ${easyShareMin * 100}%)` });
  }

  // ---- 2 single-run jump ----
  // Distance plans: km. Run/walk ladders: minutes of running, where 25% steps with walks between are the method.
  const timeBased = spec.timeBased;
  const assumed = runner.longestKm30 > 0 ? runner.longestKm30 : spec.gate.longestKm ?? 0;
  const all = weeks.flatMap((w) => w.sessions).filter((s) => s.km > 0 && s.kind !== 'strength');
  const size = (s: Session) => (timeBased ? s.steps.filter((st) => st.effort !== 'walk').reduce((a, st) => a + (st.durationS ?? 0) / 60, 0) : s.km);
  const assumedSize = timeBased ? (assumed * runner.easyPaceSPerKm) / 60 : assumed;
  const [factor, slack, unit] = timeBased ? [1.25, 1, 'min'] : [1.1, 0.3, 'km'];
  for (const s of all) {
    if (s.kind === 'race') continue;
    let max = daysBetween(startDate, s.date) < 14 ? assumedSize : 0;
    for (const o of all) if (o.date < s.date && !o.skipped && daysBetween(o.date, s.date) <= 30) max = Math.max(max, size(o));
    if (max > 0 && size(s) > Math.max(max * factor, max + (timeBased ? 3 : 0.5)) + slack) out.push({ rule: 2, week: weekOf(weeks, s), message: `${s.title} is ${r1(size(s))} ${unit}, longest of the previous 30 days was ${r1(max)} ${unit}` });
  }

  // ---- 3 weekly growth ----
  const vol = (w: Week) => (timeBased ? runs(w).reduce((a, s) => a + s.minutes, 0) : w.targetKm);
  const tol = timeBased ? MIN_TOL : KM_TOL;
  // Against the last two weeks that were not recovery weeks: a lighter week is not a lower base to jump from.
  for (let i = 1; i < full.length; i++) {
    const w = full[i];
    if (w.kind === 'taper' || w.kind === 'light') continue;
    const bases = full.slice(0, i).filter((x) => x.kind !== 'light' && x.kind !== 'taper');
    const base1 = bases[bases.length - 1];
    const base2 = bases[bases.length - 2];
    if (base1 && vol(w) > vol(base1) * 1.1 + tol) out.push({ rule: 3, week: w.index, message: `${vol(w)} after ${vol(base1)} (week ${base1.index}): more than +10%` });
    if (base2 && vol(w) > vol(base2) * 1.3 + tol) out.push({ rule: 3, week: w.index, message: `${vol(w)} vs ${vol(base2)} (week ${base2.index}): more than +30% over two build weeks` });
  }
  // The first full week against history, when there is some.
  const firstFull = full[0];
  if (firstFull && !timeBased && runner.weeklyKm > 0 && firstFull.kind !== 'light' && vol(firstFull) > runner.weeklyKm * 1.1 + tol && vol(firstFull) > spec.daysOptions[0] * 3 + 1) {
    out.push({ rule: 3, week: firstFull.index, message: `starts at ${vol(firstFull)} km against ${runner.weeklyKm} km a week in history` });
  }

  // ---- 4 light weeks ----
  const lightEvery = plan.setup.extraRecovery ? 3 : 4;
  if (!timeBased && plan.setup.daysPerWeek > 2 && full.length && vol(full[0]) >= 15) {
    // Every week counts towards the gap, a cut-short week included; a lighter week of any kind ends it.
    const build = weeks.filter((w) => w.kind !== 'taper' && w.kind !== 'race');
    let run = 0;
    for (let i = 0; i < build.length; i++) {
      const w = build[i];
      if (w.kind === 'light') {
        run = 0;
        if (partial(w)) continue; // eased for pain or illness, or begun mid-week: lighter by nature
        const prev = full.filter((x) => x.index < w.index).pop();
        if (prev && vol(prev) < 15) continue; // too small a week for a cut to mean anything
        if (prev && vol(w) > vol(prev) * 0.8 + tol) out.push({ rule: 4, week: w.index, message: `light week at ${vol(w)} after ${vol(prev)}: not 20% lighter` });
        if (w.sessions.some((s) => s.hard)) out.push({ rule: 4, week: w.index, message: 'hard session in a light week' });
      } else {
        run++;
        // The weeks right before the taper may run long by one, since the peak sits there.
        const last = i === build.length - 1 || (i === build.length - 2 && weeks.some((x) => x.kind === 'taper'));
        if (run > lightEvery && !last) out.push({ rule: 4, week: w.index, message: `${run} weeks without a lighter one` });
      }
    }
  }

  // ---- 5 long runs ----
  for (const w of full) {
    for (const s of runs(w)) {
      if (s.kind !== 'long') continue;
      if (spec.longCapKm != null && s.km > spec.longCapKm + 0.05) out.push({ rule: 5, week: w.index, message: `long run ${s.km} km over the cap of ${spec.longCapKm}` });
      if (s.minutes > Math.min(spec.longCapMin, 180) + 2) out.push({ rule: 5, week: w.index, message: `long run ${s.minutes} min over ${spec.longCapMin}` });
      if (!timeBased && s.km > spec.longShare * w.targetKm + KM_TOL) out.push({ rule: 5, week: w.index, message: `long run ${s.km} km is more than ${spec.longShare * 100}% of a ${w.targetKm} km week` });
    }
  }

  // ---- 6 hard work ----
  for (const w of weeks) {
    if (partial(w)) continue;
    const K = w.targetKm;
    let tKm = 0;
    let iKm = 0;
    let rKm = 0;
    for (const s of runs(w)) {
      for (const st of s.steps) {
        const km = st.distanceM != null ? st.distanceM / 1000 : (st.durationS ?? 0) / paceOf(st.effort, paces);
        if (st.kind !== 'hard') continue;
        if (st.effort === 'threshold') tKm += km;
        else if (st.effort === 'hard') iKm += km;
        else if (st.effort === 'fast') rKm += km;
      }
    }
    if (w.kind !== 'race' && K > 0) {
      if (tKm > 0.1 * K + 0.3) out.push({ rule: 6, week: w.index, message: `threshold ${r1(tKm)} km in a ${K} km week` });
      if (iKm > 0.08 * K + 0.3 || iKm > 10) out.push({ rule: 6, week: w.index, message: `intervals ${r1(iKm)} km in a ${K} km week` });
      if (rKm > 0.05 * K + 0.3 || rKm > 8) out.push({ rule: 6, week: w.index, message: `reps ${r1(rKm)} km in a ${K} km week` });
    }
    if (w.index <= 2 && w.sessions.some((s) => s.hard && s.kind !== 'race')) out.push({ rule: 6, week: w.index, message: 'hard session in the first two weeks' });
  }
  const dated = weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength').sort((a, b) => a.date - b.date);
  for (let i = 1; i < dated.length; i++) {
    const a = dated[i - 1];
    const b = dated[i];
    if (daysBetween(a.date, b.date) !== 1) continue;
    if (a.hard && b.hard) out.push({ rule: 6, week: weekOf(weeks, b), message: `${a.title} and ${b.title} on consecutive days` });
    if (a.hard && b.kind === 'long') out.push({ rule: 6, week: weekOf(weeks, b), message: `${a.title} the day before the long run` });
  }
  for (const w of full) {
    for (const s of runs(w)) {
      if (s.kind !== 'long') continue;
      const rp = s.steps.filter((st) => st.effort === 'race' || st.effort === 'steady').reduce((a, st) => a + (st.distanceM ?? 0) / 1000, 0);
      if (rp > 0.4 * s.km + 0.1) out.push({ rule: 6, week: w.index, message: `${r1(rp)} km at race pace inside a ${s.km} km long run` });
    }
  }

  // ---- 7 taper ----
  if (spec.raceKm != null && plan.setup.raceDate != null) {
    const peak = Math.max(...weeks.filter((w) => w.kind !== 'taper' && w.kind !== 'race' && !partial(w)).map((w) => w.targetKm), 0);
    const tapers = weeks.filter((w) => w.kind === 'taper');
    const raceWeek = weeks.find((w) => w.kind === 'race');
    let prev = peak;
    for (const w of tapers) {
      if (w.targetKm > prev + KM_TOL) out.push({ rule: 7, week: w.index, message: `taper week at ${w.targetKm} km after ${prev}` });
      prev = w.targetKm;
      if (partial(w)) continue; // cut short by a rebuild, pain or illness: not a full taper week
      if (runs(w).length < plan.setup.daysPerWeek - 1) out.push({ rule: 7, week: w.index, message: 'taper dropped run days' });
      if (spec.tier !== 'finish' && !runs(w).some((s) => s.hard || s.kind === 'racepace' || s.kind === 'strides')) out.push({ rule: 7, week: w.index, message: 'taper lost all intensity' });
    }
    if (raceWeek && peak > 0 && raceWeek.targetKm > 0.6 * peak + KM_TOL) out.push({ rule: 7, week: raceWeek.index, message: `race week at ${raceWeek.targetKm} km, peak ${peak}` });
    const race = raceWeek?.sessions.find((s) => s.kind === 'race');
    if (!race || race.date !== plan.setup.raceDate) out.push({ rule: 7, week: raceWeek?.index ?? null, message: 'no race on race day' });
    if (raceWeek?.sessions.some((s) => s.date > plan.setup.raceDate!)) out.push({ rule: 7, week: raceWeek.index, message: 'sessions after the race' });
  }

  // ---- 8 effort in words ----
  for (const w of weeks) {
    for (const s of w.sessions) {
      if (!s.title || !s.summary || !s.why) out.push({ rule: 8, week: w.index, message: `${s.id} has no words` });
      if (s.kind !== 'strength' && s.kind !== 'rest' && (s.minutes <= 0 || s.steps.length === 0)) out.push({ rule: 8, week: w.index, message: `${s.id} has no steps` });
      for (const st of s.steps) if (!st.label || !st.effort) out.push({ rule: 8, week: w.index, message: `${s.id} has a step without an effort` });
      if (s.date < startDate) out.push({ rule: 8, week: w.index, message: `${s.id} before the start` });
    }
    const byDate = new Map<number, number>();
    for (const s of w.sessions) if (s.kind !== 'strength') byDate.set(s.date, (byDate.get(s.date) ?? 0) + 1);
    for (const [d, n] of byDate) if (n > 1) out.push({ rule: 8, week: w.index, message: `two runs on ${new Date(d).toDateString()}` });
  }

  // ---- 9 strength ----
  for (const w of weeks) {
    const st = w.sessions.filter((s) => s.kind === 'strength');
    if (st.length > 2) out.push({ rule: 9, week: w.index, message: `${st.length} strength sessions` });
    if (st.some((s) => !s.optional)) out.push({ rule: 9, week: w.index, message: 'strength is not optional' });
  }

  return out;
}

function paceOf(effort: Effort, p: ReturnType<typeof paceSetFor>): number {
  switch (effort) {
    case 'walk':
      return p.easy * 1.9;
    case 'easy':
      return p.easy;
    case 'steady':
      return p.steady;
    case 'race':
      return p.race;
    case 'threshold':
      return p.threshold;
    case 'hard':
      return p.interval;
    case 'fast':
      return p.reps;
  }
}

function weekOf(weeks: Week[], s: Session): number | null {
  return weeks.find((w) => w.sessions.includes(s))?.index ?? null;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A short, human line per rule for the rules page. */
export const RULES: Array<{ n: number; title: string; text: string; evidence: 'strong' | 'moderate' | 'practice'; source: string }> = [
  { n: 1, title: 'Most running is easy', text: 'At least three quarters of each week is conversational. Finish plans and no-race plans, nearer nine tenths.', evidence: 'strong', source: 'Seiler & Kjerland 2006; Stöggl & Sperlich 2014; Muñoz et al. 2014' },
  { n: 2, title: 'No run more than 10% longer than your longest in 30 days', text: 'The best current evidence on overuse injury looks at single sessions, not weekly totals. Half a kilometre is allowed when that is more than 10%, so beginners can get anywhere. Race day is the one planned exception.', evidence: 'moderate', source: 'Frandsen et al. 2025, Br J Sports Med (5,200 runners)' },
  { n: 3, title: 'Weekly volume grows slowly', text: 'At most 10% a week and 30% over any two weeks. The 10% rule on its own is convention; the two-week ceiling has evidence behind it.', evidence: 'moderate', source: 'Buist et al. 2008; Nielsen et al. 2014' },
  { n: 4, title: 'Every fourth week is lighter', text: 'About 23% less, with nothing hard. Every third week with extra recovery on.', evidence: 'practice', source: "Daniels' Running Formula; Pfitzinger & Douglas, Advanced Marathoning" },
  { n: 5, title: 'Long runs have a ceiling', text: 'Never past three hours, never past the plan cap (32 km for a first marathon), never more than half the week.', evidence: 'practice', source: "Daniels' Running Formula; Higdon novice plans" },
  { n: 6, title: 'Hard work has limits', text: 'Threshold at most 10% of the week, intervals 8%, fast reps 5%. Never two hard days in a row, never a hard day before the long run, nothing hard in weeks one and two.', evidence: 'practice', source: "Daniels' Running Formula, intensity limits per session type" },
  { n: 7, title: 'Taper by cutting volume, not intensity', text: 'The last one to three weeks drop 40–60% of the running while keeping short race-pace work and the usual days.', evidence: 'strong', source: 'Bosquet et al. 2007, meta-analysis of tapering' },
  { n: 8, title: 'Effort first, pace second', text: 'Every session is described by how it should feel and the talk test. Paces appear only if you give a recent race time.', evidence: 'strong', source: 'Persinger et al. 2004 (talk test); Daniels & Gilbert VDOT; Vickers & Vertosick 2016' },
  { n: 9, title: 'Strength twice a week, optional', text: 'Twenty minutes, bodyweight, on days off. The best-supported way to cut injury risk, and never required.', evidence: 'strong', source: 'Lauersen et al. 2014, meta-analysis' },
];
