// Turns a plan shape and a runner into dated weeks of sessions. Deterministic:
// the same inputs always give the same plan, so the tests can check every
// plan for every day count against the rules in rules.ts.
//
// Volume: week one is where the runner is. Each build week grows by a fixed
// factor (10% at most, less when there is time to spare) until the plan's peak.
// Every fourth week (third with extra recovery) drops to 77% and carries no hard
// session. The taper cuts volume, not intensity. Long runs never exceed the
// cap, the share of the week, or 110% of the longest run of the last 30 days.

import type { PlanSpec, RunnerProfile } from './catalogue';
import { addDays, daysBetween, mondayOf, offsetInWeek, weekdayOf } from './dates';
import type { Paces } from './paces';
import * as T from './sessions';
import { measure, paceSetFor, toSession, type PaceSet } from './sessions';
import { easyShare, hardWorkOver, minEasyShare } from './rules';
import type { PlanSetup, Session, Week, WeekKind } from './types';

export interface GenerateOptions {
  spec: PlanSpec;
  setup: PlanSetup;
  runner: RunnerProfile;
  paces: Paces | null;
  /** Rebuilds: numbering continues, volume restarts from here. */
  firstWeekIndex?: number;
  firstDay?: number; // nothing is planned before this day (default: setup.startDate)
  startKm?: number;
  longestKm?: number; // the longest run of the last 30 days, if different from the profile
  /** Rebuilds: runs already in the plan (done, or still to come before `firstDay`) within the last 30 days. */
  history?: Array<{ date: number; km: number }>;
  weeks?: number; // how many weeks to lay out (default: to the race, or the plan's length)
  gentleWeeks?: number; // leading weeks with no hard sessions (default 2, counted from week 1)
  /** Rebuilds: the last two full build weeks before this generation (km, oldest first), so the first new weeks grow from them. */
  prevBases?: number[];
  /** Rebuilds of Start running: the rung of the ladder to begin on (0-based), instead of the week number. */
  ladderFrom?: number;
  /** Rebuilds: the first full week of the plan as it was (km). Lighter weeks follow the plan's own scale, not the smaller restart. */
  firstFullKm?: number;
  /** Rebuilds of time-based plans: running minutes of the runs already in the plan within the last 30 days. */
  historyMin?: Array<{ date: number; min: number }>;
}

export type GenerateResult = { ok: true; weeks: Week[]; peakKm: number; assumedLongestKm: number } | { ok: false; error: 'too-short' | 'too-long' | 'days'; message: string };

const LIGHT_FACTOR = 0.77;
const MAX_GROWTH = 1.1;
const TAPER: Record<number, number[]> = { 0: [], 1: [0.6], 1.5: [0.85, 0.55], 2: [0.75, 0.5], 3: [0.8, 0.65, 0.45] };
const MIN_EASY_MIN = 20; // 10 in light and taper weeks, so a small week can still drop
const MIN_WEEK_FLOOR_KM = 2.5; // an easy day is never shorter than this
const STRENGTH_PER_WEEK = 2;

const r1 = (n: number) => Math.round(n * 10) / 10;
const EXCESS_TOL = 0.3; // under the validator's rounding tolerance, so a passed check here passes there
/** The most a run may grow past the longest of the last 30 days: 10%, or half a kilometre when that is more. Nothing in the window, nothing to measure against. */
const jump = (km: number) => (km > 0 ? r1(Math.max(km * 1.1, km + 0.5)) : Infinity);
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function generate(o: GenerateOptions): GenerateResult {
  const { spec, setup, runner } = o;
  const days = setup.daysPerWeek;
  if (!spec.daysOptions.includes(days)) return { ok: false, error: 'days', message: `${spec.name} runs on ${spec.daysOptions.join(', ')} days a week.` };
  if (setup.runDays.length !== days || !setup.runDays.includes(setup.longRunDay)) return { ok: false, error: 'days', message: 'Pick as many run days as the plan has, and a long-run day among them.' };

  const firstDay = o.firstDay ?? setup.startDate;
  const firstWeekIndex = o.firstWeekIndex ?? 1;
  const firstMonday = mondayOf(firstDay);

  let nWeeks: number;
  if (setup.raceDate != null) {
    nWeeks = Math.floor(daysBetween(firstMonday, setup.raceDate) / 7) + 1;
    const total = nWeeks + firstWeekIndex - 1;
    if (total < spec.minWeeks) return { ok: false, error: 'too-short', message: `${spec.name} needs at least ${spec.minWeeks} weeks. A later race, or a shorter distance, would fit.` };
    if (total > 30) return { ok: false, error: 'too-long', message: 'That race is more than 30 weeks away. Start the plan closer to it; Keep running will hold you until then.' };
  } else {
    nWeeks = o.weeks ?? spec.weeks;
  }

  const paces = paceSetFor(runner, o.paces, spec.goal);
  const gentle = o.gentleWeeks ?? 2;

  const assumedLongestKm = assumedLongest(o);
  const weeks: Week[] = spec.timeBased ? timeBasedWeeks(o, nWeeks, firstMonday, firstWeekIndex, paces) : distanceWeeks(o, nWeeks, firstMonday, firstWeekIndex, paces, gentle, assumedLongestKm, firstDay);

  // Nothing before the start, nothing after the race.
  for (const w of weeks) {
    w.sessions = w.sessions.filter((s) => s.date >= firstDay && (setup.raceDate == null || s.date <= setup.raceDate));
    if (w === weeks[0] && firstDay > w.start) w.partial = true;
  }
  addStrength(weeks, setup, firstDay);
  const peakKm = Math.max(...weeks.map((w) => w.targetKm));
  return { ok: true, weeks, peakKm, assumedLongestKm };
}

/** The longest run of the last 30 days: from history, else what the gate implies, else modest. */
export function assumedLongest(o: GenerateOptions): number {
  if (o.longestKm != null && o.longestKm > 0) return o.longestKm;
  if (o.runner.longestKm30 > 0) return o.runner.longestKm30;
  if (o.spec.gate.longestKm != null) return o.spec.gate.longestKm;
  const start = o.startKm ?? (o.runner.weeklyKm > 0 ? o.runner.weeklyKm : o.spec.startKm);
  return Math.max(Math.round(start * 0.35 * 10) / 10, 3);
}

// ---- Distance plans ----------------------------------------------------------------

function distanceWeeks(o: GenerateOptions, nWeeks: number, firstMonday: number, firstWeekIndex: number, paces: PaceSet, gentle: number, assumedLongest: number, firstDay: number): Week[] {
  const { spec, setup, runner } = o;
  const days = setup.daysPerWeek;
  const peak = spec.peakKm[days];
  const lightEvery = setup.extraRecovery ? 3 : 4;
  const taperFactors = spec.raceKm != null ? TAPER[spec.taperWeeks] ?? [] : [];
  // A rebuild close to the race can leave a single week: it is the race week.
  const taperN = Math.min(taperFactors.length, nWeeks <= 1 ? nWeeks : nWeeks - 1);
  const buildN = nWeeks - taperN;

  const floor = days * MIN_WEEK_FLOOR_KM;
  const startKm = o.startKm ?? (runner.weeklyKm > 0 ? Math.min(Math.max(runner.weeklyKm, floor), peak) : spec.startKm);

  // Which build weeks are light. Never week 1 of the whole plan, never the week before the taper.
  const absIndex = (i: number) => firstWeekIndex + i; // i is 0-based within this generation
  let firstFullActual: number | undefined; // the plan's scale, as the validator reads it: its first full week
  const isLight = (i: number) => {
    const w = absIndex(i);
    if (w === 1 || i >= buildN || days <= 2) return false; // two runs a week is its own recovery
    if ((o.firstFullKm ?? firstFullActual ?? startKm) < 15) return false; // under 15 km a week, floors would decide the week, not the cut
    if (w % lightEvery !== 0) return false;
    return taperN === 0 ? true : i < buildN - 1;
  };
  const growWeeks = Math.max(countBy(buildN, (i) => !isLight(i)) - 1, 1);
  const growth = startKm > 0 ? Math.min(MAX_GROWTH, Math.max(1, Math.pow(peak / startKm, 1 / growWeeks))) : 1;
  const growthCap = spec.tier === 'keep' ? Math.min(growth, 1.05) : growth;

  const weeks: Week[] = [];
  let prevBuild = startKm;
  let prevLong = 0;
  let peakActual = buildN === 0 ? startKm : 0;
  // Full build weeks so far, as the validator reads them for the +10% / +30% check.
  const bases: number[] = [...(o.prevBases ?? [])];
  // Every run laid out so far, dated, so the 10% cap is read off a real 30-day window.
  // In the plan's first two weeks the profile's longest run stands in, exactly as the validator reads it.
  const longHistory: Array<{ date: number; km: number }> = [...(o.history ?? [])];
  const longestInWindow = (date: number) => {
    let max = daysBetween(setup.startDate, date) < 14 ? assumedLongest : 0;
    for (const h of longHistory) if (h.date < date && daysBetween(h.date, date) <= 30) max = Math.max(max, h.km);
    return max;
  };

  for (let i = 0; i < nWeeks; i++) {
    const index = absIndex(i);
    const start = addDays(firstMonday, 7 * i);
    let kind: WeekKind;
    let target: number;
    if (i >= buildN) {
      // A shortened taper keeps its last, smallest weeks, so race week stays the smallest.
      const f = taperFactors[taperFactors.length - taperN + (i - buildN)];
      kind = i === nWeeks - 1 ? 'race' : 'taper';
      target = r1(peakActual * f);
    } else if (isLight(i)) {
      kind = 'light';
      target = r1(prevBuild * LIGHT_FACTOR);
    } else {
      target = i === 0 ? startKm : Math.min(peak, r1(prevBuild * growthCap));
      kind = target >= peak - 0.5 ? 'peak' : growthCap < 1.02 ? 'base' : 'build';
    }

    const buildPos = buildN > 1 ? i / (buildN - 1) : 1; // 0 → 1 across the build
    const partial = i === 0 && firstDay > start;
    const growing = kind === 'build' || kind === 'base' || kind === 'peak';
    // Floors, strides and a first quality session can push a small week past its growth limit.
    // Then the week is laid out again on a smaller target, and as a last resort without the hard session.
    const b1 = bases[bases.length - 1];
    const b2 = bases[bases.length - 2];
    const limit = growing && !partial && b1 != null ? Math.min(b1 * MAX_GROWTH, b2 != null ? b2 * 1.3 : Infinity) : Infinity;
    const ctx: WeekCtx = { spec, setup, paces, index, start, kind, target, buildPos, gentle: index <= gentle, longCap: longestInWindow, prevLong, taperIndex: i - buildN, taperN };
    // Days before the start are dropped here, so they never count as runs in anyone's 30-day window.
    const lay = () => keepHardWorkLimits(keepSingleRunRule(buildWeekSessions(ctx).filter((s) => s.date >= firstDay), longestInWindow, spec, paces), longestInWindow, spec, paces);
    let sessions = lay();
    const total = (list: Session[]) => r1(list.filter((s) => s.kind !== 'race').reduce((a, s) => a + s.km, 0));
    for (let attempt = 0; attempt < 6 && total(sessions) > limit + EXCESS_TOL; attempt++) {
      if (attempt >= 3) ctx.gentle = true;
      ctx.target = r1(Math.max(ctx.target - (total(sessions) - limit) - 0.2, 1));
      sessions = lay();
    }
    // A week cut down to its limit keeps its hard session at full size, so it can tip under the easy share: then the week goes without it.
    const runsOf = (list: Session[]) => list.filter((s) => s.kind !== 'strength' && s.kind !== 'race');
    if (growing && !ctx.gentle && (easyShare(runsOf(sessions), paces) ?? 1) < minEasyShare(spec)) {
      ctx.gentle = true;
      sessions = lay();
    }
    const actualKm = total(sessions);
    const long = sessions.find((s) => s.kind === 'long');
    if (long) prevLong = long.km;
    for (const s of sessions) if (s.kind !== 'strength' && s.kind !== 'race' && s.km > 0) longHistory.push({ date: s.date, km: s.km });
    weeks.push({ index, start, kind, targetKm: actualKm, sessions });
    if (growing) {
      // A week begun mid-way grows on from what it was meant to be, not from its few remaining days.
      prevBuild = partial ? Math.max(actualKm, ctx.target) : actualKm;
      if (!partial || peakActual === 0) peakActual = Math.max(peakActual, actualKm); // the validator reads the peak off full weeks
      if (!partial) bases.push(actualKm);
    }
    if (!partial && firstFullActual == null && kind !== 'race') firstFullActual = actualKm;
  }
  return weeks;
}

interface WeekCtx {
  spec: PlanSpec;
  setup: PlanSetup;
  paces: PaceSet;
  index: number;
  start: number;
  kind: WeekKind;
  target: number;
  buildPos: number;
  gentle: boolean;
  longCap: (date: number) => number;
  prevLong: number;
  taperIndex: number;
  taperN: number;
}

function buildWeekSessions(c: WeekCtx): Session[] {
  const { spec, setup, paces } = c;
  const runDays = [...setup.runDays].sort((a, b) => offsetInWeek(a) - offsetInWeek(b));
  const dateOf = (weekday: number) => addDays(c.start, offsetInWeek(weekday));
  const idOf = (weekday: number) => `w${c.index}d${offsetInWeek(weekday)}`;
  const raceWeek = c.kind === 'race' && setup.raceDate != null;
  const raceDay = setup.raceDate != null ? weekdayOf(setup.raceDate) : null;
  const sessions: Session[] = [];

  // ---- Race week: short, sharp, rested. ----
  if (raceWeek && raceDay != null && setup.raceDate != null) {
    const before = runDays.filter((d) => dateOf(d) < setup.raceDate!);
    const sharp = spec.tier !== 'finish' ? before.find((d) => daysBetween(dateOf(d), setup.raceDate!) >= 3) : undefined;
    const fixed: Session[] = [];
    const easyDays: number[] = [];
    for (const d of before) {
      const gap = daysBetween(dateOf(d), setup.raceDate);
      if (d === sharp) {
        const rp = spec.goal === 'marathon' ? 15 : spec.goal === 'half' ? 12 : spec.goal === '10k' ? 10 : 8;
        fixed.push(toSession(T.racePaceRun(rp, 'Race effort, to remember it', 'race', c.target < 25 ? 6 : 10), idOf(d), dateOf(d), paces));
      }
      else if (gap === 1) {
        if (spec.tier !== 'finish') fixed.push(toSession(T.shakeout(15, 4), idOf(d), dateOf(d), paces));
      } else easyDays.push(d);
    }
    // The rest of the week's budget goes on the easy days: 15 to 35 minutes, never a jump.
    const left = Math.max(c.target - fixed.reduce((a, s) => a + s.km, 0), 0);
    const stridesKm = measure(T.easyWithStrides(0, 4).steps, paces).km;
    for (const d of easyDays) {
      const capKm = Math.min(left / easyDays.length - stridesKm, jump(c.longCap(dateOf(d))));
      const minutes = Math.max(15, Math.min(35, Math.floor((capKm * paces.easy) / 60 / 5) * 5));
      fixed.push(toSession(T.easyWithStrides(minutes, 4), idOf(d), dateOf(d), paces));
    }
    // A small plan with many run days can still come out over the week's budget: then an easy day
    // or two becomes rest. Race week is about being rested, not about the count of runs.
    const total = () => fixed.reduce((a, s) => a + s.km, 0);
    while (total() > c.target + 0.3) {
      const easiest = fixed.filter((s) => s.kind === 'strides' || s.kind === 'easy').sort((a, b) => a.date - b.date)[0];
      if (!easiest) break;
      fixed.splice(fixed.indexOf(easiest), 1);
    }
    sessions.push(...fixed);
    sessions.push(toSession(T.raceDay(spec), `w${c.index}race`, setup.raceDate, paces));
    return sessions.sort((a, b) => a.date - b.date);
  }

  // ---- Long run ----
  const longDay = setup.longRunDay;
  const longDate = dateOf(longDay);
  const longMinKm = r1(((spec.longCapMin * 60) / paces.easy) * 1);
  let longKm = Math.min(spec.longCapKm ?? Infinity, spec.longShare * c.target, longMinKm, jump(c.longCap(longDate)));
  if (c.kind === 'taper') longKm = Math.min(longKm, c.prevLong * (c.taperIndex === 0 ? 0.8 : 0.65));
  if (c.kind === 'light' && c.prevLong > 0) longKm = Math.min(longKm, c.prevLong * LIGHT_FACTOR);
  longKm = Math.max(r1(longKm), 2);
  const hasRacePace = (spec.tier === 'improve' || spec.tier === 'race') && spec.goal !== '5k' && c.buildPos >= 0.5 && c.kind !== 'light' && c.kind !== 'taper';
  const rpShare = spec.qualityDays >= 2 ? 0.25 : 0.2 + 0.15 * c.buildPos;
  const rpKm = hasRacePace ? Math.min(Math.round(longKm * rpShare), Math.floor(longKm * 0.4), spec.goal === 'marathon' ? 12 : spec.goal === 'half' ? 7 : 3) : 0;
  const raceLabel = spec.goal === 'marathon' ? 'Marathon effort. Short sentences.' : spec.goal === 'half' ? 'Half-marathon effort. A few words.' : 'Steady. Short sentences.';
  const long = toSession(T.longRun(longKm, rpKm, raceLabel, spec.goal), idOf(longDay), longDate, paces);
  sessions.push(long);

  // ---- Quality ----
  const qualityN = c.gentle || c.kind === 'light' ? 0 : c.kind === 'taper' ? Math.min(spec.qualityDays, 1) : spec.qualityDays;
  const qDays = pickQualityDays(runDays, longDay, qualityN);
  const budget = c.target; // km the week is built on; work limits are shares of it
  const scale = c.kind === 'taper' ? 0.6 : 0.6 + 0.4 * c.buildPos;
  const qualitySessions: Session[] = [];
  qDays.forEach((d, slot) => {
    const kind = qualityKind(spec, c, slot);
    const draft = qualityDraft(kind, budget, scale, c.buildPos, paces, spec);
    if (draft) qualitySessions.push(toSession(draft, idOf(d), dateOf(d), paces));
  });
  sessions.push(...qualitySessions);

  // ---- Easy days: what is left, split evenly, never under the floor. ----
  const easyDays = runDays.filter((d) => d !== longDay && !qDays.includes(d));
  const used = sessions.reduce((a, s) => a + s.km, 0);
  const stridesDay = c.index >= 3 ? easyDays[easyDays.length - 1] : undefined;
  const gentleFartlek = spec.tier === 'finish' && c.index >= 5 && c.index % 2 === 1 && c.kind !== 'light' && c.kind !== 'taper' && stridesDay != null;
  const caps = new Map<string, number>();
  if (easyDays.length) {
    const small = c.kind === 'light' || c.kind === 'taper';
    const minEasy = small ? 10 : MIN_EASY_MIN;
    const floorKm = small ? 1.5 : MIN_WEEK_FLOOR_KM;
    for (const d of easyDays) {
      // What is left, split evenly, never under the floor, never a jump past the longest recent run.
      const share = Math.max((c.target - used) / easyDays.length, floorKm);
      const cap = Math.min(longKm, jump(c.longCap(dateOf(d))));
      const each = Math.min(share, cap);
      caps.set(idOf(d), cap);
      const minutes = easyMinutes(each, cap, minEasy, paces);
      let draft;
      if (d === stridesDay && gentleFartlek) {
        draft = T.fartlek(6, 60, 90, true);
        const m = measure(draft.steps, paces);
        if (m.km > each + 1) draft = T.easyWithStrides(minutes, 6);
      } else if (d === stridesDay) {
        draft = T.easyWithStrides(Math.max(10, minutes - 5), 6);
      } else {
        const afterHard = qDays.some((q) => daysBetween(dateOf(q), dateOf(d)) === 1) || daysBetween(longDate, dateOf(d)) === 1;
        draft = afterHard && spec.tier !== 'finish' ? T.recoveryRun(minutes) : T.easyRun(minutes);
      }
      sessions.push(toSession(draft, idOf(d), dateOf(d), paces));
    }
  }
  balance(sessions, c.target, caps, spec.longShare, paces);
  return sessions.sort((a, b) => a.date - b.date);
}

/**
 * Rule 6 on a small week: a hard session has a smallest sensible size (two
 * intervals, three 400s), and a week cut down to its limits can be too small to
 * hold it. Then the hard sessions become easy runs with strides, which keep the
 * legs quick and count as the taper's intensity.
 */
function keepHardWorkLimits(sessions: Session[], before: (date: number) => number, spec: PlanSpec, paces: PaceSet): Session[] {
  const runs = sessions.filter((s) => s.kind !== 'strength' && s.kind !== 'race');
  const K = r1(runs.reduce((a, s) => a + s.km, 0));
  if (K <= 0 || hardWorkOver(runs, K, paces).length === 0) return sessions;
  const out = sessions.map((s) => (s.hard && s.kind !== 'race' ? Object.assign(toSession(T.easyWithStrides(Math.max(15, Math.round((s.minutes * 0.6) / 5) * 5), 6), s.id, s.date, paces), { note: s.note }) : s));
  return keepSingleRunRule(out, before, spec, paces);
}

/**
 * Rule 2, read the way the validator reads it: day by day, each run against the
 * longest of the 30 days before it, earlier runs of the same week included. A run
 * that comes out too big (a quality session, a race-week sharpener, a long run in
 * a small window) is cut to fit: the long run stays a long run, anything else
 * becomes an easy run. Then the long run is held to its share of what is left.
 */
function keepSingleRunRule(sessions: Session[], before: (date: number) => number, spec: PlanSpec, paces: PaceSet): Session[] {
  const out = [...sessions].sort((a, b) => a.date - b.date);
  const laid: Array<{ date: number; km: number }> = [];
  for (const [k, s] of out.entries()) {
    if (s.kind === 'strength' || s.km <= 0) continue;
    if (s.kind !== 'race') {
      let max = before(s.date);
      for (const l of laid) if (l.date < s.date) max = Math.max(max, l.km);
      const cap = jump(max);
      if (s.km > cap + 0.05) {
        if (s.kind === 'long') out[k] = toSession(T.longRun(Math.max(Math.floor(cap * 10) / 10, 1), 0, '', spec.goal), s.id, s.date, paces);
        else out[k] = toSession(T.easyRun(Math.max(10, Math.floor((cap * paces.easy) / 60))), s.id, s.date, paces);
        out[k].note = s.note;
      }
    }
    laid.push({ date: out[k].date, km: out[k].km });
  }
  const long = out.find((s) => s.kind === 'long');
  const total = out.filter((s) => s.kind !== 'race' && s.kind !== 'strength').reduce((a, s) => a + s.km, 0);
  if (long && long.km > spec.longShare * total + 0.3) {
    const i = out.indexOf(long);
    out[i] = toSession(T.longRun(Math.max(Math.floor(spec.longShare * total * 10) / 10, 1), 0, '', spec.goal), long.id, long.date, paces);
  }
  return out;
}

/** Minutes for an easy day: to the nearest five, never over its cap, at the floor when the floor fits. */
function easyMinutes(km: number, capKm: number, floorMin: number, paces: PaceSet): number {
  const fits = (m: number) => (m * 60) / paces.easy <= capKm + 0.05;
  let minutes = round5((km * paces.easy) / 60);
  if (!fits(minutes)) minutes -= 5;
  if (minutes < floorMin && fits(floorMin)) minutes = floorMin;
  return Math.max(10, minutes);
}

/**
 * Five-minute rounding and the floors leave a week a little off its target.
 * Take minutes off the longest easy day, or add them to the shortest (within
 * its cap), then make sure the long run is still within its share of the week.
 */
function balance(sessions: Session[], target: number, caps: Map<string, number>, longShare: number, paces: PaceSet) {
  const total = () => sessions.filter((s) => s.kind !== 'race').reduce((a, s) => a + s.km, 0);
  const easies = () => sessions.filter((s) => s.kind === 'easy' || s.kind === 'recovery');
  const remake = (s: Session, minutes: number) => Object.assign(s, toSession(s.kind === 'recovery' ? T.recoveryRun(minutes) : T.easyRun(minutes), s.id, s.date, paces));
  for (let guard = 0; guard < 16; guard++) {
    const t = total();
    if (t > target + 0.3) {
      const s = easies().filter((x) => x.minutes > 15).sort((a, b) => b.minutes - a.minutes)[0];
      if (!s) break;
      remake(s, s.minutes - 5);
    } else if (t < target - 0.3) {
      const s = easies()
        .filter((x) => measure(T.easyRun(x.minutes + 5).steps, paces).km <= (caps.get(x.id) ?? Infinity) + 0.05)
        .sort((a, b) => a.minutes - b.minutes)[0];
      if (!s) break;
      remake(s, s.minutes + 5);
    } else break;
  }
  const long = sessions.find((s) => s.kind === 'long');
  if (long && long.km > longShare * total() + 0.3) {
    const km = Math.max(r1(longShare * total()), 2);
    const rp = long.steps.filter((st) => st.effort !== 'easy').reduce((a, st) => a + (st.distanceM ?? 0) / 1000, 0);
    const label = long.steps.find((st) => st.effort !== 'easy')?.label ?? '';
    const goal = long.steps.some((st) => st.effort === 'steady') ? '10k' : 'half';
    Object.assign(long, toSession(T.longRun(km, Math.min(rp, Math.round(km * 0.3)), label, goal), long.id, long.date, paces));
  }
}

type QualityKind = 'threshold' | 'intervals' | 'reps' | 'hills' | 'fartlek' | 'racepace';

function qualityKind(spec: PlanSpec, c: WeekCtx, slot: number): QualityKind {
  const phaseB = c.buildPos >= 0.5;
  const n = Math.max(c.index - 3, 0);
  if (c.kind === 'taper') return spec.tier === 'race' && slot === 0 ? 'threshold' : 'racepace';
  if (spec.tier === 'improve') {
    if (!phaseB) return (['fartlek', 'threshold', 'hills', 'threshold'] as QualityKind[])[n % 4];
    return (['threshold', 'intervals'] as QualityKind[])[n % 2];
  }
  // race tier
  if (slot === 0) return 'threshold';
  if (!phaseB) return (['hills', 'intervals'] as QualityKind[])[n % 2];
  if (spec.goal === '5k' || spec.goal === '10k') return (['intervals', 'reps'] as QualityKind[])[n % 2];
  return (['intervals', 'racepace'] as QualityKind[])[n % 2];
}

/** Work sized from the week's km: T ≤ 10%, I ≤ 8% (and 10 km), R ≤ 5% (and 8 km). */
function qualityDraft(kind: QualityKind, weekKm: number, scale: number, pos: number, p: PaceSet, spec: PlanSpec) {
  switch (kind) {
    case 'threshold': {
      const workKm = Math.min(0.1 * weekKm, 8) * scale;
      const workMin = Math.floor((workKm * p.threshold) / 60);
      if (workMin < 8) return T.fartlek(6, 60, 90, false);
      const reps = workMin <= 16 ? 2 : workMin <= 27 ? 3 : 4;
      const repMin = Math.floor(workMin / reps);
      return T.threshold(reps, repMin, Math.max(1, Math.ceil(repMin / 5)), p);
    }
    case 'intervals': {
      const workKm = Math.min(0.08 * weekKm, 10) * scale;
      const workMin = Math.floor((workKm * p.interval) / 60);
      const repMin = pos < 0.5 ? 3 : 4;
      const reps = Math.max(2, Math.floor(workMin / repMin));
      if (reps < 3 && workMin < 6) return T.fartlek(Math.max(4, Math.floor(workMin)), 60, 60, false);
      return T.intervals(reps, repMin);
    }
    case 'reps': {
      const workKm = Math.min(0.05 * weekKm, 8) * scale;
      // Too small a week for three 400s inside the 5% limit: strides do the same job without the load.
      if (1.2 > 0.05 * weekKm + 0.3) return T.easyWithStrides(20, 6);
      const reps = Math.max(3, Math.min(12, Math.floor(workKm / 0.4)));
      return T.repetitions(reps, 400);
    }
    case 'hills': {
      const workKm = Math.min(0.08 * weekKm, 10) * scale;
      const workMin = (workKm * p.interval) / 60;
      const reps = Math.max(4, Math.min(10, Math.floor((workMin * 60) / 45)));
      return T.hills(reps);
    }
    case 'fartlek': {
      const workKm = Math.min(0.08 * weekKm, 10) * scale;
      const workMin = Math.floor((workKm * p.interval) / 60);
      return T.fartlek(Math.max(4, Math.min(10, workMin)), 60, 60, false);
    }
    case 'racepace': {
      const label = spec.goal === 'marathon' ? 'Marathon effort. Short sentences.' : spec.goal === 'half' ? 'Half-marathon effort. A few words.' : '10K effort';
      const minutes = scale < 0.7 ? 12 : Math.round(15 + 20 * pos);
      return T.racePaceRun(Math.min(minutes, spec.goal === 'marathon' ? 40 : 25), label, spec.goal === 'marathon' ? 'steady' : 'race');
    }
  }
}

/** Quality days keep a day between each other and the long run, farthest from the long run first. */
export function pickQualityDays(runDays: number[], longDay: number, n: number): number[] {
  const dist = (a: number, b: number) => Math.min((a - b + 7) % 7, (b - a + 7) % 7);
  const candidates = runDays.filter((d) => d !== longDay).sort((a, b) => dist(b, longDay) - dist(a, longDay) || a - b);
  const chosen: number[] = [];
  for (const d of candidates) {
    if (chosen.length >= n) break;
    const adjacentToLong = dist(d, longDay) === 1;
    const adjacentToChosen = chosen.some((c) => dist(c, d) === 1);
    if (!adjacentToLong && !adjacentToChosen) chosen.push(d);
  }
  return chosen.sort((a, b) => offsetInWeek(a) - offsetInWeek(b));
}

// ---- Time-based plans (start, come back) -------------------------------------------

/** Start running: a fixed ladder. Running minutes per session grow ≤ 25% a week, with walks between. */
export const START_LADDER: Array<{ reps: number; runS: number; walkS: number }> = [
  { reps: 9, runS: 60, walkS: 60 },
  { reps: 7, runS: 90, walkS: 90 },
  { reps: 6, runS: 120, walkS: 90 },
  { reps: 5, runS: 180, walkS: 90 },
  { reps: 4, runS: 270, walkS: 90 },
  { reps: 3, runS: 420, walkS: 90 },
  { reps: 2, runS: 720, walkS: 90 },
  { reps: 2, runS: 810, walkS: 90 },
];

function timeBasedWeeks(o: GenerateOptions, nWeeks: number, firstMonday: number, firstWeekIndex: number, paces: PaceSet): Week[] {
  const { spec, setup, runner } = o;
  const runDays = [...setup.runDays].sort((a, b) => offsetInWeek(a) - offsetInWeek(b));
  const weeks: Week[] = [];

  if (spec.id === 'start') {
    // A rebuild climbs on from the rung it is given, and gets the weeks to reach the 30 minutes.
    const from = o.ladderFrom ?? firstWeekIndex - 1;
    const n = o.ladderFrom != null ? Math.max(nWeeks, START_LADDER.length + 1 - from) : nWeeks;
    for (let i = 0; i < n; i++) {
      const index = firstWeekIndex + i;
      const start = addDays(firstMonday, 7 * i);
      const pos = from + i;
      const rung = START_LADDER[Math.min(pos, START_LADDER.length - 1)];
      const sessions = runDays.map((d, k) => {
        const date = addDays(start, offsetInWeek(d));
        const last = pos >= START_LADDER.length;
        const draft = last ? T.continuous(k === runDays.length - 1 ? 30 : 25, k === runDays.length - 1 ? 'Run 30 min. The whole thing.' : undefined) : T.runWalk(rung.reps, rung.runS, rung.walkS);
        return toSession(draft, `w${index}d${offsetInWeek(d)}`, date, paces);
      });
      weeks.push({ index, start, kind: pos >= START_LADDER.length ? 'peak' : 'build', targetKm: r1(sessions.reduce((a, s) => a + s.km, 0)), sessions });
    }
    return weeks;
  }

  // Come back: six weeks from a modest start to about 80% of what you did before, 10% a week at most.
  const beforeMin = o.startKm != null ? (o.startKm * runner.easyPaceSPerKm) / 60 : (Math.max(runner.weeklyKm, 10) * runner.easyPaceSPerKm) / 60;
  const targetMin = Math.max(76, Math.min(0.8 * beforeMin, 240));
  const startMin = Math.min(Math.max(targetMin / Math.pow(1.1, Math.max(nWeeks - 1, 1)), 50), 90);
  const growth = Math.min(1.1, Math.max(1, Math.pow(targetMin / startMin, 1 / Math.max(nWeeks - 1, 1))));
  let weekMin = startMin;
  const firstDay = o.firstDay ?? setup.startDate;
  // Rebuilds: the minutes already run, and the last full weeks, so the weeks ahead grow from them (rules 2 and 3 in minutes).
  const laid: Array<{ date: number; min: number }> = [...(o.historyMin ?? [])];
  const bases: number[] = [...(o.prevBases ?? [])];
  const assumedMin = (assumedLongest(o) * runner.easyPaceSPerKm) / 60;
  const capAt = (date: number, extra: Array<{ date: number; min: number }>) => {
    let max = daysBetween(setup.startDate, date) < 14 ? assumedMin : 0;
    for (const l of [...laid, ...extra]) if (l.date < date && daysBetween(l.date, date) <= 30) max = Math.max(max, l.min);
    return max > 0 ? Math.floor(Math.max(max * 1.25, max + 3)) : Infinity;
  };
  for (let i = 0; i < nWeeks; i++) {
    const index = firstWeekIndex + i;
    const start = addDays(firstMonday, 7 * i);
    const partial = i === 0 && firstDay > start;
    const b1 = bases[bases.length - 1];
    const b2 = bases[bases.length - 2];
    const limit = !partial && b1 != null ? Math.min(b1 * 1.1, b2 != null ? b2 * 1.3 : Infinity) : Infinity;
    const layWeek = (wm: number) => {
      const longMin = Math.round(wm * 0.4);
      const easyMin = Math.round((wm - longMin) / Math.max(runDays.length - 1, 1));
      const out: Array<{ session: Session; min: number }> = [];
      const local: Array<{ date: number; min: number }> = [];
      for (const d of runDays) {
        const date = addDays(start, offsetInWeek(d));
        if (date < firstDay) continue;
        const cap = capAt(date, local);
        const minutes = Math.max(10, Math.min(d === setup.longRunDay ? longMin : easyMin, cap));
        const draft = index <= 2 ? T.continuous(minutes, `Run ${minutes} min, walk breaks welcome`) : T.continuous(minutes);
        if (d === setup.longRunDay) draft.kind = 'long';
        out.push({ session: toSession(draft, `w${index}d${offsetInWeek(d)}`, date, paces), min: minutes });
        local.push({ date, min: minutes });
      }
      return out;
    };
    // The validator counts a week in session minutes, walks included: shrink until it fits.
    let laidOut = layWeek(weekMin);
    for (let k = 0; k < 6; k++) {
      const v = laidOut.reduce((a, x) => a + x.session.minutes, 0);
      if (v <= limit + 0.5) break;
      weekMin = Math.max(weekMin - (v - limit) - 1, 10);
      laidOut = layWeek(weekMin);
    }
    const sessions = laidOut.map((x) => x.session);
    for (const x of laidOut) laid.push({ date: x.session.date, min: x.min });
    const vol = sessions.reduce((a, s) => a + s.minutes, 0);
    if (!partial) bases.push(vol);
    weeks.push({ index, start, kind: i === nWeeks - 1 ? 'peak' : 'build', targetKm: r1(sessions.reduce((a, s) => a + s.km, 0)), sessions });
    weekMin *= growth; // from what the week was cut to, if it was

  }
  return weeks;
}

// ---- Strength, on days off, never the day before the long run --------------------------

function addStrength(weeks: Week[], setup: PlanSetup, firstDay: number) {
  const dayBeforeLong = (setup.longRunDay + 6) % 7;
  for (const w of weeks) {
    if (w.kind === 'race') continue;
    const runDates = new Set(w.sessions.map((s) => s.date));
    const candidates: number[] = [];
    for (let off = 0; off < 7; off++) {
      const date = addDays(w.start, off);
      const wd = weekdayOf(date);
      if (runDates.has(date) || wd === dayBeforeLong) continue;
      candidates.push(date);
    }
    // Prefer a day that follows a run day, so legs are warm and the next day is free.
    const picked = candidates.filter((d) => runDates.has(addDays(d, -1))).concat(candidates.filter((d) => !runDates.has(addDays(d, -1)))).slice(0, STRENGTH_PER_WEEK);
    const first = w.sessions[0]?.date ?? w.start;
    for (const date of picked) {
      if (date < firstDay || (date < first && w.index === 1)) continue;
      const s = toSession(T.strength(), `w${w.index}s${offsetInWeek(weekdayOf(date))}`, date, { easy: 1, steady: 1, race: 1, threshold: 1, interval: 1, reps: 1 });
      w.sessions.push(s);
    }
    w.sessions.sort((a, b) => a.date - b.date || (a.kind === 'strength' ? 1 : -1));
  }
}

function countBy(n: number, f: (i: number) => boolean): number {
  let c = 0;
  for (let i = 0; i < n; i++) if (f(i)) c++;
  return c;
}
