// How a plan gives way: missed runs, low energy, pain, illness, holidays.
// Nothing here ever adds load. Every change is written into the session's
// note so the week view can say what happened and why, and anything that
// changes the weeks ahead goes back through the generator, so an adapted
// plan is held to the same nine rules as a new one.

import { planById, type PlanSpec, type RunnerProfile } from './catalogue';
import { addDays, daysBetween, mondayOf, weekdayOf } from './dates';
import { START_LADDER, generate } from './generate';
import * as T from './sessions';
import { paceSetFor, toSession, type PaceSet } from './sessions';
import type { Feel, Plan, Session, Week } from './types';
import { shouldFeelEasy } from './review';
import { ui } from '../i18n/ui';

export type MissedKind = 'none' | 'repeat' | 'stepback' | 'comeback';

export interface MissedState {
  kind: MissedKind;
  gapDays: number;
  since: number | null; // the last run we know of
}

const DAY = 86400000;

function specOf(plan: Plan): PlanSpec {
  const spec = planById(plan.setup.planId);
  if (!spec) throw new Error(ui().adapt.unknownPlanX(plan.setup.planId));
  return spec;
}

function pacesOf(plan: Plan): PaceSet {
  return paceSetFor(plan.runner, plan.paces, specOf(plan).goal);
}

function clone(plan: Plan): Plan {
  return JSON.parse(JSON.stringify(plan)) as Plan;
}

function runSessions(plan: Plan): Session[] {
  return plan.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength');
}

function sessionOnDate(plan: Plan, date: number): Session | undefined {
  return runSessions(plan).find((s) => s.date === date);
}

function weekOf(plan: Plan, date: number): Week | undefined {
  return plan.weeks.find((w) => date >= w.start && date < addDays(w.start, 7));
}

function retotal(w: Week) {
  w.targetKm = Math.round(w.sessions.filter((s) => s.kind !== 'race' && !s.skipped).reduce((a, s) => a + s.km, 0) * 10) / 10;
}

function holidayDays(plan: Plan, from: number, to: number): number {
  let n = 0;
  for (const e of plan.log) {
    if (e.kind !== 'holiday') continue;
    const a = Math.max(e.from, from);
    const b = Math.min(e.to, to);
    if (b >= a) n += daysBetween(a, b) + 1;
  }
  return n;
}

/**
 * How long since the last run, and what that means. `lastRunAt` is the newest
 * run in history (plan or not); days away are not counted as missed.
 */
export function missedState(plan: Plan, today: number, lastRunAt: number | null = null): MissedState {
  const done = runSessions(plan).filter((s) => s.done).map((s) => s.done!.at);
  const since = Math.max(plan.setup.startDate, ...done, lastRunAt ?? 0);
  const gapDays = Math.max(0, daysBetween(since, today) - holidayDays(plan, since, today));
  const kind: MissedKind = gapDays >= 28 ? 'comeback' : gapDays >= 14 ? 'stepback' : gapDays >= 7 ? 'repeat' : 'none';
  return { kind, gapDays, since: since > 0 ? since : null };
}

/** The last week before `day` in which most of the runs were done, and what it came to. */
function lastCompletedWeekKm(plan: Plan, day: number): number | null {
  const weeks = plan.weeks.filter((w) => addDays(w.start, 7) <= day);
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const runs = w.sessions.filter((s) => s.kind !== 'strength');
    const done = runs.filter((s) => s.done);
    if (runs.length && done.length >= Math.ceil(runs.length * 0.6)) {
      return Math.round(done.reduce((a, s) => a + s.done!.distanceM / 1000, 0) * 10) / 10;
    }
  }
  return null;
}

/** The volume the plan was running at before `day`: the last non-light full week before it. */
function volumeBefore(plan: Plan, day: number, spec: PlanSpec): number {
  const monday = mondayOf(day);
  const before = plan.weeks.filter((w) => w.start < monday && w.kind !== 'light' && w.kind !== 'taper' && w.kind !== 'race' && !w.partial);
  const w = before[before.length - 1];
  return w ? w.targetKm : plan.runner.weeklyKm > 0 ? plan.runner.weeklyKm : spec.startKm;
}

/**
 * Keep everything before `firstDay` as it is (this week's earlier days
 * included) and lay the rest out again from `startKm`. The generator applies
 * the same caps and rules as it did on day one.
 */
function regenerateFrom(plan: Plan, spec: PlanSpec, firstDay: number, startKm: number, runner: RunnerProfile, gentleWeeks: number, reason: string, today: number = firstDay, ladderStep = 0): { ok: true; plan: Plan } | { ok: false; message: string } {
  const p = clone(plan);
  const monday = mondayOf(firstDay);
  const frozen = p.weeks.filter((w) => w.start < monday);
  const current = p.weeks.find((w) => w.start === monday);
  // Runs that were due before today and never happened are misses, not plans.
  for (const s of runSessions(p)) if (!s.done && s.date < today && !s.skipped) s.skipped = true;
  const firstWeekIndex = (frozen[frozen.length - 1]?.index ?? 0) + 1;
  const remaining = p.setup.raceDate != null ? undefined : Math.max(plan.weeks.length - frozen.length, 1);
  if (p.setup.raceDate != null && firstDay > p.setup.raceDate) return { ok: false, message: ui().adapt.theRaceHasPassed };
  // What the 30 days before the new start hold: runs done (at the distance run) and easy days still to come.
  const history = runSessions(p)
    .filter((s) => !s.skipped && s.kind !== 'race' && s.date < firstDay && daysBetween(s.date, firstDay) <= 30)
    .map((s) => ({ date: s.date, km: s.done ? Math.min(s.km, s.done.distanceM / 1000) : s.km }))
    .filter((h) => h.km > 0);
  const res = generate({
    spec,
    setup: p.setup,
    runner,
    paces: p.paces,
    firstWeekIndex,
    firstDay,
    startKm: spec.timeBased ? undefined : Math.max(startKm, p.setup.daysPerWeek * 2.5),
    longestKm: history.length === 0 && runner.longestKm30 > 0 ? runner.longestKm30 : undefined,
    history,
    weeks: remaining,
    gentleWeeks: firstWeekIndex - 1 + gentleWeeks,
    // The last two full build weeks that stay, so the first new ones grow from them and not past them.
    // Time-based plans count them in minutes of running, as the validator does.
    prevBases: frozen
      .filter((w) => !w.partial && (w.kind === 'build' || w.kind === 'base' || w.kind === 'peak'))
      .slice(-2)
      .map((w) => (spec.timeBased ? w.sessions.filter((s) => s.kind !== 'strength' && s.kind !== 'race').reduce((a, s) => a + s.minutes, 0) : w.targetKm)),
    historyMin: spec.timeBased ? runSessions(p).filter((s) => !s.skipped && s.date < firstDay && daysBetween(s.date, firstDay) <= 30).map((s) => ({ date: s.date, min: runningMinutes(s) })) : undefined,
    ladderFrom: spec.id === 'start' ? ladderRung(p, firstDay, ladderStep) : undefined,
    firstFullKm: plan.weeks.find((w) => !w.partial && w.kind !== 'race')?.targetKm,
  });
  if (!res.ok) return { ok: false, message: res.message };
  // This week's earlier days stay as they were.
  if (current && res.weeks[0] && res.weeks[0].start === monday) {
    const kept = current.sessions.filter((s) => s.date < firstDay);
    res.weeks[0].sessions = [...kept, ...res.weeks[0].sessions.filter((s) => s.date >= firstDay)].sort((a, b) => a.date - b.date);
    res.weeks[0].partial = true;
    retotal(res.weeks[0]);
  }
  p.weeks = [...frozen, ...res.weeks];
  p.runner = { ...runner, longestKm30: runner.longestKm30 > 0 ? runner.longestKm30 : res.assumedLongestKm };
  p.log.push({ at: firstDay, kind: 'rebuilt', reason });
  return { ok: true, plan: p };
}

/** Minutes of running in a session, walks left out: what the 30-day rule measures on a run/walk ladder. */
function runningMinutes(s: Session): number {
  return s.steps.filter((st) => st.effort !== 'walk').reduce((a, st) => a + (st.durationS ?? 0) / 60, 0);
}

/**
 * Start running, rebuilt: the rung to climb on from. The last rung actually run
 * (or one lower with `step` −1), never higher than the 30-day rule allows from
 * what was run in the last 30 days: 25% more running, or three minutes.
 */
function ladderRung(plan: Plan, firstDay: number, step: number): number {
  const recent = runSessions(plan).filter((s) => s.done && s.date < firstDay && daysBetween(s.date, firstDay) <= 30);
  const longest = Math.max(0, ...recent.map(runningMinutes));
  const rungMin = (r: number) => (START_LADDER[r].reps * START_LADDER[r].runS) / 60;
  let allowed = 0;
  for (let r = 0; r < START_LADDER.length; r++) if (rungMin(r) <= Math.max(longest * 1.25, longest + 3)) allowed = r;
  const done = runSessions(plan).filter((s) => s.done && s.date < firstDay).sort((a, b) => b.date - a.date)[0];
  const runS = done?.steps.find((st) => st.effort !== 'walk')?.durationS;
  const last = done ? (done.kind === 'runwalk' ? Math.max(0, START_LADDER.findIndex((r) => r.runS === runS)) : START_LADDER.length - 1) : 0;
  return Math.max(0, Math.min(last + step, allowed));
}

/**
 * After a gap: 'repeat' starts again at the last completed week's volume,
 * 'stepback' at 60% of it. Weeks already behind us are frozen.
 */
export function rebuild(plan: Plan, spec: PlanSpec, today: number, runner: RunnerProfile, kind: 'repeat' | 'stepback' | 'none', reason?: string): { ok: true; plan: Plan } | { ok: false; message: string } {
  const lastKm = lastCompletedWeekKm(plan, mondayOf(today)) ?? volumeBefore(plan, today, spec);
  const startKm = kind === 'stepback' ? lastKm * 0.6 : lastKm;
  const why = reason ?? (kind === 'stepback' ? ui().adapt.twoWeeksOrMoreAway : kind === 'repeat' ? ui().adapt.aWeekOrMoreAway : ui().adapt.rebuiltFromToday);
  return regenerateFrom(plan, spec, today, startKm, runner, kind === 'stepback' ? 2 : 1, why, today, kind === 'stepback' ? -1 : 0);
}

// ---- Low energy -------------------------------------------------------------------

export type EnergyChoice = 'easy' | 'rest' | 'planned';

/** A hard or long session can sit here only if nothing hard or long is next to it. */
function canHoldHard(plan: Plan, date: number, ignoreId: string, kind: 'hard' | 'long'): boolean {
  const before = sessionOnDate(plan, addDays(date, -1));
  const after = sessionOnDate(plan, addDays(date, 1));
  const clash = (s: Session | undefined) => !!s && s.id !== ignoreId && !s.skipped && (s.hard || s.kind === 'long' || s.kind === 'race');
  if (clash(before) || clash(after)) return false;
  if (kind === 'hard' && after && after.kind === 'long') return false;
  return true;
}

/**
 * Before a run: the runner picked a low face. 'easy' turns today into an easy
 * 30 minutes and moves the hard session later in the week if a legal day
 * exists; 'rest' skips it. Three low days in a week make the next week light.
 */
export function applyEnergy(plan: Plan, date: number, mood: number, choice: EnergyChoice): { plan: Plan; moved: Session | null; fatigue: 'ok' | 'lighter' | 'doctor' } {
  const p = clone(plan);
  p.log.push({ at: date, kind: 'energy', mood, choice });
  const paces = pacesOf(p);
  let moved: Session | null = null;
  let gaveWay = false; // a hard or long run was eased or rested: the weeks ahead are read off a smaller window
  const today = sessionOnDate(p, date);
  const week = weekOf(p, date);

  // The week keeps its planned total: it is still the base the next weeks build on.
  if (today && week && choice !== 'planned') {
    if (choice === 'rest') {
      today.skipped = true;
      today.note = ui().adapt.restedLowEnergy;
      gaveWay = today.hard || today.kind === 'long';
    } else if (today.hard || today.kind === 'long') {
      const original = { ...today, steps: today.steps.map((s) => ({ ...s })) };
      const later = week.sessions.filter((s) => s.kind !== 'strength' && s.date > date && !s.hard && s.kind !== 'long' && !s.done && !s.skipped);
      const slot = later.find((s) => canHoldHard(p, s.date, s.id, original.hard ? 'hard' : 'long'));
      const easy = toSession(T.easyRun(30), today.id, today.date, paces);
      Object.assign(today, easy, { note: slot ? ui().adapt.madeEasyLowEnergyX(original.title, dayName(slot.date)) : ui().adapt.madeEasyLowEnergyX2(original.title) });
      if (slot) {
        Object.assign(slot, original, { id: slot.id, date: slot.date, note: ui().adapt.movedHereFromX(dayName(date)) });
        moved = slot;
      }
      gaveWay = !slot;
    }
  }

  const lows = p.log.filter((e) => e.kind === 'energy' && e.mood <= 2 && date - e.at < 7 * DAY && e.at <= date).length;
  const lows14 = p.log.filter((e) => e.kind === 'energy' && e.mood <= 2 && date - e.at < 14 * DAY && e.at <= date).length;
  let fatigue: 'ok' | 'lighter' | 'doctor' = 'ok';
  if (lows14 >= 5) fatigue = 'doctor';
  else if (lows >= 3) fatigue = 'lighter';
  if (fatigue !== 'ok' && week) {
    const next = p.weeks.find((w) => w.start === addDays(week.start, 7));
    if (next && next.kind !== 'race' && next.kind !== 'light') {
      lighten(next, paces, ui().adapt.lighterWeekThreeLowEnergy);
      // The weeks after it carry on from the volume before it, so nothing jumps.
      const r = relayout(p, addDays(next.start, 7), ui().adapt.afterALighterWeekThe, date);
      return { plan: r, moved, fatigue };
    }
  }
  if (gaveWay && week) {
    // Next week's long run is read off what was actually run, not what was planned.
    return { plan: relayout(p, addDays(week.start, 7), ui().adapt.aRunGaveWayThe, date), moved, fatigue };
  }
  return { plan: p, moved, fatigue };
}

/** Lay the weeks from `firstDay` out again at the volume they were at. Quietly keeps the plan when that is not possible. */
function relayout(p: Plan, firstDay: number, reason: string, today: number, startKm?: number, gentleWeeks = 0, runner?: RunnerProfile): Plan {
  if (!p.weeks.some((w) => w.start >= mondayOf(firstDay) && w.kind !== 'race')) return p;
  const spec = specOf(p);
  const r = regenerateFrom(p, spec, firstDay, startKm ?? volumeBefore(p, firstDay, spec), runner ?? p.runner, gentleWeeks, reason, today);
  return r.ok ? r.plan : p;
}

/** A fifth less of everything, nothing hard. Rounded down so the cut is a real one. */
function lighten(week: Week, paces: PaceSet, note: string) {
  week.kind = 'light';
  for (const s of week.sessions) {
    if (s.kind === 'strength' || s.done || s.skipped || s.kind === 'race') continue;
    if (s.hard) Object.assign(s, toSession(T.easyRun(Math.max(15, Math.floor((s.minutes * 0.7) / 5) * 5)), s.id, s.date, paces), { note });
    else if (s.kind === 'long') Object.assign(s, toSession(T.longRun(Math.max(Math.floor(s.km * 0.7 * 10) / 10, 2), 0, '', 'none'), s.id, s.date, paces), { note });
    else Object.assign(s, toSession(T.easyRun(Math.max(15, Math.floor((s.minutes * 0.7) / 5) * 5)), s.id, s.date, paces), { note });
  }
  retotal(week);
}

// ---- How it felt ------------------------------------------------------------------

/** The hard session that gave way, as it was before. */
export interface Eased {
  title: string;
  date: number;
}

/**
 * After a session: "How did it feel?". An easy session that felt hard, or a
 * hard one with no words left, is a sign of fatigue before it is a sign of
 * anything else (Foster 1998; Halson 2014). The next hard session within three
 * days becomes easy running, and two such answers in a week make the next week
 * lighter (unless this week is already a light one). A plan never gets harder
 * from an answer.
 */
export function applyFeel(plan: Plan, date: number, sessionId: string, feel: Feel): { plan: Plan; eased: Eased | null; lighter: boolean } {
  const p = clone(plan);
  const s = p.weeks.flatMap((w) => w.sessions).find((x) => x.id === sessionId);
  const tough = !!s && (shouldFeelEasy(s) ? feel >= 4 : s.hard || s.kind === 'long' ? feel >= 5 : false);
  if (!tough) {
    p.log.push({ at: date, kind: 'feel', feel, sessionId, eased: false });
    return { plan: p, eased: null, lighter: false };
  }
  const paces = pacesOf(p);
  const next = runSessions(p).find((x) => x.date > date && x.date <= addDays(date, 3) && x.hard && !x.done && !x.skipped && x.kind !== 'race');
  const eased: Eased | null = next ? { title: next.title, date: next.date } : null;
  if (next) Object.assign(next, toSession(T.easyRun(Math.min(next.minutes, 30, Math.max(15, Math.floor((next.minutes * 0.8) / 5) * 5))), next.id, next.date, paces), { note: ui().adapt.madeEasyLastFeltHard(next.title) });
  p.log.push({ at: date, kind: 'feel', feel, sessionId, eased: true });

  const toughs = p.log.filter((e) => e.kind === 'feel' && e.eased && date - e.at < 7 * DAY && e.at <= date).length;
  const week = weekOf(p, date);
  // In a week that is already light, the light week is the answer; the next one builds from before it as planned.
  if (toughs >= 2 && week && week.kind !== 'light') {
    const following = p.weeks.find((w) => w.start === addDays(week.start, 7));
    if (following && following.kind !== 'race' && following.kind !== 'light' && following.kind !== 'taper') {
      lighten(following, paces, ui().adapt.lighterWeekTwoHardFeels);
      return { plan: relayout(p, addDays(following.start, 7), ui().adapt.afterALighterWeekThe, date), eased, lighter: true };
    }
  }
  // Like a low-energy day, the week keeps its planned total: it is still the base the next weeks build on.
  return { plan: p, eased, lighter: false };
}

// ---- Pain ---------------------------------------------------------------------

export type PainLevel = 'none' | 'niggle' | 'pain';

/**
 * After a run: "Anything hurt?". Pain that changes how you run, worsens as you
 * go or sits above 3/10 means two days off, then a week of easy running only,
 * and the weeks after start again from the volume before it. Pain again within
 * two weeks: hard sessions pause for four weeks, see a physio.
 */
export function applyPain(plan: Plan, date: number, level: PainLevel, runner?: RunnerProfile): { plan: Plan; advice: string | null; physio: boolean } {
  let p = clone(plan);
  const again = level === 'pain' && p.log.some((e) => e.kind === 'pain' && e.level === 'pain' && date - e.at < 14 * DAY && e.at < date);
  p.log.push({ at: date, kind: 'pain', level });
  if (level === 'none') return { plan: p, advice: null, physio: false };
  if (level === 'niggle') return { plan: p, advice: ui().adapt.notedIfItIsStill, physio: false };
  const spec = specOf(p);
  const paces = pacesOf(p);
  const easyUntil = addDays(date, again ? 30 : 9);
  easeDays(p, addDays(date, 1), addDays(date, 2), 'rest', ui().adapt.restPainTwoDaysOff, paces);
  easeDays(p, addDays(date, 3), easyUntil, 'easy', again ? ui().adapt.easyOnlyPainCameBack : ui().adapt.easyOnlyAWeekAfter, paces);
  const resumed = regenerateFrom(p, spec, addDays(easyUntil, 1), volumeBefore(p, date, spec), runner ?? p.runner, 0, ui().adapt.afterPainTheWeeksAhead, addDays(date, 1));
  if (resumed.ok) p = resumed.plan;
  return {
    plan: p,
    advice: again
      ? ui().adapt.thatIsTheSecondTime
      : ui().adapt.twoDaysOffThenEasy,
    physio: again,
  };
}

/** Ill: nothing until better, then as many easy-only days as you were ill, then the plan starts again from where it was. */
export function applyIllness(plan: Plan, from: number, days: number, runner?: RunnerProfile): { plan: Plan } {
  let p = clone(plan);
  const d = Math.max(1, Math.round(days));
  p.log.push({ at: from, kind: 'ill', days: d });
  const spec = specOf(p);
  const paces = pacesOf(p);
  easeDays(p, from, addDays(from, d - 1), 'rest', ui().adapt.restIllNoRunningWith, paces);
  easeDays(p, addDays(from, d), addDays(from, 2 * d - 1), 'easy', ui().adapt.easyOnlyBackFromIllness, paces);
  const before = volumeBefore(p, from, spec);
  const startKm = d >= 14 ? before * 0.6 : before;
  const resumed = regenerateFrom(p, spec, addDays(from, 2 * d), startKm, runner ?? p.runner, d >= 7 ? 1 : 0, d >= 14 ? ui().adapt.afterTwoWeeksIllStepped : ui().adapt.afterIllnessTheWeeksAhead, from);
  if (resumed.ok) p = resumed.plan;
  return { plan: p };
}

/**
 * Away: the days are planned rest, not misses. The weeks after come back at
 * the same volume (two weeks or more away: at 60% of it), laid out again so
 * the first long run back is read off the last one actually run.
 */
export function applyHoliday(plan: Plan, from: number, to: number, today: number = from, runner?: RunnerProfile): { plan: Plan } {
  let p = clone(plan);
  p.log.push({ at: today, kind: 'holiday', from, to });
  for (const s of runSessions(p)) {
    if (s.date >= from && s.date <= to && !s.done) {
      s.skipped = true;
      s.note = ui().adapt.awayNote;
    }
  }
  const days = daysBetween(from, to) + 1;
  const spec = specOf(p);
  const back = addDays(to, 1);
  const before = volumeBefore(p, from, spec);
  p = relayout(p, back, days >= 14 ? ui().adapt.backFromTwoWeeksOr : ui().adapt.backFromABreakThe, today, days >= 14 ? before * 0.6 : before, days >= 14 ? 1 : 0, runner);
  return { plan: p };
}

/** Rest or easy-only across a span of days. A week with three or more such days counts as a recovery week. */
function easeDays(p: Plan, from: number, to: number, mode: 'rest' | 'easy', note: string, paces: PaceSet) {
  const touched = new Map<Week, number>();
  for (const s of runSessions(p)) {
    if (s.date < from || s.date > to || s.done || s.kind === 'race') continue;
    const w = weekOf(p, s.date);
    if (w) touched.set(w, (touched.get(w) ?? 0) + 1);
    if (mode === 'rest') {
      s.skipped = true;
      s.note = note;
    } else if (s.hard) {
      Object.assign(s, toSession(T.easyRun(30), s.id, s.date, paces), { note });
    } else if (s.kind === 'long') {
      Object.assign(s, toSession(T.longRun(Math.max(Math.round(s.km * 0.6), 2), 0, '', 'none'), s.id, s.date, paces), { note });
    }
  }
  for (const [w] of touched) {
    if (w.kind !== 'race' && w.kind !== 'taper') w.kind = 'light';
    w.partial = true; // no longer a full planned week: the rules judge the weeks rebuilt after it
    retotal(w);
  }
}

// ---- Moving a session -----------------------------------------------------------

/** Within its week, onto a day with no run, keeping the spacing rules. */
export function moveSession(plan: Plan, sessionId: string, toDate: number): { ok: true; plan: Plan } | { ok: false; reason: string } {
  const p = clone(plan);
  const s = runSessions(p).find((x) => x.id === sessionId);
  if (!s) return { ok: false, reason: ui().adapt.noSuchSession };
  const week = weekOf(p, s.date);
  if (!week || toDate < week.start || toDate >= addDays(week.start, 7)) return { ok: false, reason: ui().adapt.sessionsMoveWithinTheirWeek };
  if (s.done) return { ok: false, reason: ui().adapt.alreadyDone };
  if (sessionOnDate(p, toDate)) return { ok: false, reason: ui().adapt.thereIsAlreadyARun(dayName(toDate)) };
  if ((s.hard || s.kind === 'long') && !canHoldHard(p, toDate, s.id, s.hard ? 'hard' : 'long')) {
    return { ok: false, reason: ui().adapt.thatWouldPutTwoHard };
  }
  if (!s.hard && s.kind !== 'long') {
    const neighbour = [sessionOnDate(p, addDays(toDate, -1)), sessionOnDate(p, addDays(toDate, 1))];
    const hardAround = neighbour.some((n) => n && !n.skipped && (n.hard || n.kind === 'long'));
    const long = week.sessions.find((x) => x.kind === 'long' && !x.skipped);
    if (hardAround && long && addDays(toDate, 1) === long.date && s.kind !== 'easy' && s.kind !== 'recovery') return { ok: false, reason: ui().adapt.keepTheDayBeforeThe };
  }
  if (p.setup.raceDate != null && toDate >= p.setup.raceDate) return { ok: false, reason: ui().adapt.notAfterTheRace };
  s.date = toDate;
  s.note = ui().adapt.movedToX(dayName(toDate));
  week.sessions.sort((a, b) => a.date - b.date);
  return { ok: true, plan: p };
}

export function dayName(date: number): string {
  return [ui().adapt.sunday, ui().adapt.monday, ui().adapt.tuesday, ui().adapt.wednesday, ui().adapt.thursday, ui().adapt.friday, ui().adapt.saturday][weekdayOf(date)];
}
