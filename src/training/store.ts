// Where the one active plan lives: a JSON value in the settings table, nothing
// else. Everything here is local; a plan never leaves the phone.

import { listRuns, loadValue, saveValue } from '../db';
import type { Run } from '../types';
import { applyPain, type PainLevel } from './adapt';
import { planById, type PlanSpec, type RunnerProfile } from './catalogue';
import { DAY_MS, addDays, dayStart, daysBetween } from './dates';
import { generate } from './generate';
import type { Paces } from './paces';
import { profileFrom } from './profile';
import type { Plan, PlanSetup, Session, Week } from './types';
import { ui } from '../i18n/ui';

const KEY = 'trainingPlan';

export async function loadPlan(): Promise<Plan | null> {
  const p = await loadValue<Plan>(KEY);
  return p && Array.isArray(p.weeks) ? p : null;
}

export async function savePlan(plan: Plan | null): Promise<void> {
  await saveValue(KEY, plan);
}

/** Where the runner stands today, from their own history. */
export async function currentProfile(now = Date.now(), paces?: Paces | null): Promise<RunnerProfile> {
  const runs = await listRuns();
  return profileFrom(runs.map((r) => ({ startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS })), now, paces);
}

export async function historyCount(now = Date.now()): Promise<number> {
  const runs = await listRuns();
  return runs.filter((r) => r.startedAt > now - 28 * DAY_MS && r.distanceM >= 500).length;
}

export async function lastRunAt(): Promise<number | null> {
  const runs = await listRuns();
  return runs[0]?.startedAt ?? null;
}

export function createPlan(spec: PlanSpec, setup: PlanSetup, runner: RunnerProfile, paces: Paces | null, now = Date.now()): { ok: true; plan: Plan } | { ok: false; message: string } {
  const res = generate({ spec, setup, runner, paces });
  if (!res.ok) return { ok: false, message: res.message };
  return {
    ok: true,
    plan: {
      id: now,
      setup,
      name: spec.name,
      weeks: res.weeks,
      runner: { ...runner, longestKm30: runner.longestKm30 > 0 ? runner.longestKm30 : res.assumedLongestKm },
      paces,
      status: 'active',
      createdAt: now,
      healthCheckAt: now,
      log: [],
    },
  };
}

export function planSpec(plan: Plan): PlanSpec {
  const spec = planById(plan.setup.planId);
  if (!spec) throw new Error(ui().planStore.unknownPlanX(plan.setup.planId));
  return spec;
}

export function runSessions(plan: Plan): Session[] {
  return plan.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength');
}

export function sessionOn(plan: Plan, day: number): Session | null {
  return runSessions(plan).find((s) => s.date === day) ?? null;
}

export function sessionById(plan: Plan, id: string): Session | null {
  return plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === id) ?? null;
}

export function todaySession(plan: Plan, now = Date.now()): Session | null {
  return sessionOn(plan, dayStart(now));
}

/** The next run still to do, today included. */
export function nextSession(plan: Plan, now = Date.now()): Session | null {
  const today = dayStart(now);
  return runSessions(plan).find((s) => s.date >= today && !s.done && !s.skipped) ?? null;
}

export function weekOf(plan: Plan, day: number): Week | null {
  return plan.weeks.find((w) => day >= w.start && day < addDays(w.start, 7)) ?? null;
}

export function currentWeek(plan: Plan, now = Date.now()): Week {
  const today = dayStart(now);
  return weekOf(plan, today) ?? (today < plan.weeks[0].start ? plan.weeks[0] : plan.weeks[plan.weeks.length - 1]);
}

export function weekProgress(w: Week): { done: number; total: number; kmDone: number; kmTarget: number } {
  const runs = w.sessions.filter((s) => s.kind !== 'strength' && !s.skipped);
  const done = runs.filter((s) => s.done);
  return { done: done.length, total: runs.length, kmDone: r1(done.reduce((a, s) => a + s.done!.distanceM / 1000, 0)), kmTarget: w.targetKm };
}

export function planProgress(plan: Plan): { done: number; total: number; kmDone: number; kmTotal: number } {
  const runs = runSessions(plan).filter((s) => !s.skipped);
  const done = runs.filter((s) => s.done);
  return { done: done.length, total: runs.length, kmDone: r1(done.reduce((a, s) => a + s.done!.distanceM / 1000, 0)), kmTotal: r1(runs.reduce((a, s) => a + s.km, 0)) };
}

export function planEnd(plan: Plan): number {
  const last = plan.weeks[plan.weeks.length - 1];
  return plan.setup.raceDate ?? addDays(last.start, 6);
}

/**
 * Load the plan and keep it current: finish it when it is over, lay out more
 * weeks for the ongoing plan. Saves when something changed.
 */
export async function refreshPlan(now = Date.now()): Promise<Plan | null> {
  const plan = await loadPlan();
  if (!plan || plan.status !== 'active') return plan;
  const spec = planSpec(plan);
  const today = dayStart(now);
  let changed = false;
  if (spec.tier === 'keep') {
    const last = plan.weeks[plan.weeks.length - 1];
    if (today >= last.start && extendKeepPlan(plan, spec)) changed = true;
  } else if (today > planEnd(plan)) {
    plan.status = 'done';
    plan.log.push({ at: today, kind: 'finished' });
    changed = true;
  }
  if (changed) await savePlan(plan);
  return plan;
}

/** The ongoing plan has no end: four more weeks appear as the last one begins. */
function extendKeepPlan(plan: Plan, spec: PlanSpec): boolean {
  const last = plan.weeks[plan.weeks.length - 1];
  const firstDay = addDays(last.start, 7);
  const base = [...plan.weeks].reverse().find((w) => w.kind !== 'light' && !w.partial) ?? last;
  const history = runSessions(plan)
    .filter((s) => !s.skipped && s.date < firstDay && daysBetween(s.date, firstDay) <= 30)
    .map((s) => ({ date: s.date, km: s.done ? Math.min(s.km, s.done.distanceM / 1000) : s.km }));
  const res = generate({ spec, setup: plan.setup, runner: plan.runner, paces: plan.paces, firstWeekIndex: last.index + 1, firstDay, startKm: base.targetKm, history, weeks: 4, gentleWeeks: 0 });
  if (!res.ok) return false;
  plan.weeks.push(...res.weeks);
  return true;
}

/**
 * After a run is saved: the day's session is done, at whatever distance was
 * run. `sessionId` names the session that was started from the plan, when it
 * was not today's. Pain reported after the run eases the days ahead.
 */
export async function onRunSaved(run: Run, pain: PainLevel | null, sessionId: string | null = null): Promise<{ plan: Plan | null; advice: string | null }> {
  let plan = await loadPlan();
  if (!plan || plan.status !== 'active') return { plan, advice: null };
  const day = dayStart(run.startedAt);
  const s = (sessionId && sessionById(plan, sessionId)) || sessionOn(plan, day);
  const meaningful = run.distanceM >= 500 || run.durationS >= 300;
  if (s && !s.done && meaningful) {
    s.done = { runId: run.id, distanceM: run.distanceM, durationS: run.durationS, at: day };
    s.skipped = false;
  }
  let advice: string | null = null;
  if (pain && pain !== 'none') {
    const r = applyPain(plan, day, pain, await currentProfile(run.startedAt, plan.paces));
    plan = r.plan;
    advice = r.advice;
  }
  await savePlan(plan);
  return { plan, advice };
}

/**
 * A run was deleted: the session it completed keeps its tick, but the run's
 * date, distance and time leave the plan with it.
 */
export async function forgetRun(runId: number): Promise<void> {
  const plan = await loadPlan();
  if (!plan || runId <= 0) return;
  let changed = false;
  for (const s of plan.weeks.flatMap((w) => w.sessions)) {
    if (s.done && s.done.runId === runId) {
      s.done = { runId: 0, distanceM: 0, durationS: 0, at: 0 };
      changed = true;
    }
  }
  if (changed) await savePlan(plan);
}

/** Did it without the phone: tick it off at the planned numbers. */
export function markDone(plan: Plan, sessionId: string, now = Date.now()): Plan {
  const p = clone(plan);
  const s = sessionById(p, sessionId);
  if (s && !s.done) {
    s.done = { runId: 0, distanceM: s.km * 1000, durationS: s.minutes * 60, at: dayStart(now) };
    s.skipped = false;
    s.note = s.note ?? ui().planStore.doneWithoutTheApp;
  }
  return p;
}

export function skipSession(plan: Plan, sessionId: string): Plan {
  const p = clone(plan);
  const s = sessionById(p, sessionId);
  if (s && !s.done) {
    s.skipped = true;
    s.note = 'Skipped. Nothing lost.';
  }
  return p;
}

export function setStatus(plan: Plan, status: Plan['status'], now = Date.now()): Plan {
  const p = clone(plan);
  p.status = status;
  const kind = status === 'paused' ? 'paused' : status === 'active' ? 'resumed' : status === 'stopped' ? 'stopped' : 'finished';
  p.log.push({ at: dayStart(now), kind });
  return p;
}

function clone(plan: Plan): Plan {
  return JSON.parse(JSON.stringify(plan)) as Plan;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
