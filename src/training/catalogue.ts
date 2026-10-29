import { live, type Strings, ui } from '../i18n/ui';
import { decimal } from '../i18n/lang';
// The fourteen plans. Each row is a shape (weeks, days, caps, taper) that the
// generator fills from the runner's own starting point. No React Native
// imports: `npm run test:plans` checks everything here under plain Node.
//
// Tiers:
//   finish   get to the line comfortably, first time at the distance
//   improve  done it, want a faster time
//   race     competitive: six months of steady running behind you
//   start / keep / comeback  no race at all

export type Goal = 'none' | '5k' | '10k' | 'half' | 'marathon';
export type Tier = 'start' | 'keep' | 'comeback' | 'finish' | 'improve' | 'race';

export interface Gate {
  weeklyKm?: number; // average over the last 4 weeks
  longestKm?: number; // longest single run in the last 30 days
  runsPerWeek?: number;
  text: string; // the human version, shown in the catalogue
}

export interface PlanSpec {
  id: string;
  goal: Goal;
  tier: Tier;
  name: string;
  blurb: string;
  weeks: number; // the plan's natural length
  minWeeks: number; // trimmed no further when the race is closer than that
  daysOptions: number[]; // runs per week you can pick
  gate: Gate;
  startKm: number; // weekly km the plan assumes when history is thin
  peakKm: Record<number, number>; // peak weekly km by days per week (a cap, not a target)
  longCapKm: number | null; // the long run never passes this (null: time-based plan)
  longCapMin: number; // ...nor this many minutes
  longShare: number; // long run as a share of the week, at most
  qualityDays: number; // hard sessions per week once the plan is under way
  taperWeeks: number; // 0, 1, 2 or 3 (10 days is 1.5)
  raceKm: number | null;
  timeBased: boolean; // start / comeback: minutes, not kilometres
}

const HALF = 21.0975;
const MARATHON = 42.195;

type SpecData = Omit<PlanSpec, 'name' | 'blurb' | 'gate'> & { gate: Omit<PlanSpec['gate'], 'text'> };

const SPECS: Array<SpecData> = [
  // ---- No race --------------------------------------------------------------
  {
    id: 'start',
    goal: 'none',
    tier: 'start',
    weeks: 9,
    minWeeks: 9,
    daysOptions: [3],
    gate: {},
    startKm: 0,
    peakKm: { 3: 15 },
    longCapKm: null,
    longCapMin: 30,
    longShare: 1,
    qualityDays: 0,
    taperWeeks: 0,
    raceKm: null,
    timeBased: true,
  },
  {
    id: 'keep',
    goal: 'none',
    tier: 'keep',
    weeks: 4,
    minWeeks: 4,
    daysOptions: [2, 3, 4, 5],
    gate: { runsPerWeek: 1 },
    startKm: 10,
    peakKm: { 2: 20, 3: 30, 4: 40, 5: 50 },
    longCapKm: 16,
    longCapMin: 100,
    longShare: 0.5,
    qualityDays: 0,
    taperWeeks: 0,
    raceKm: null,
    timeBased: false,
  },
  {
    id: 'comeback',
    goal: 'none',
    tier: 'comeback',
    weeks: 6,
    minWeeks: 6,
    daysOptions: [3],
    gate: {},
    startKm: 0,
    peakKm: { 3: 30 },
    longCapKm: null,
    longCapMin: 60,
    longShare: 1,
    qualityDays: 0,
    taperWeeks: 0,
    raceKm: null,
    timeBased: true,
  },

  // ---- 5K --------------------------------------------------------------------
  {
    id: '5k-finish',
    goal: '5k',
    tier: 'finish',
    weeks: 8,
    minWeeks: 6,
    daysOptions: [3],
    gate: { longestKm: 2 },
    startKm: 10,
    peakKm: { 3: 22 },
    longCapKm: 7,
    longCapMin: 40,
    longShare: 0.5,
    qualityDays: 0,
    taperWeeks: 1,
    raceKm: 5,
    timeBased: false,
  },
  {
    id: '5k-improve',
    goal: '5k',
    tier: 'improve',
    weeks: 8,
    minWeeks: 6,
    daysOptions: [4, 5],
    gate: { weeklyKm: 15, longestKm: 5 },
    startKm: 15,
    peakKm: { 4: 35, 5: 42 },
    longCapKm: 11,
    longCapMin: 60,
    longShare: 0.45,
    qualityDays: 1,
    taperWeeks: 1,
    raceKm: 5,
    timeBased: false,
  },

  // ---- 10K -------------------------------------------------------------------
  {
    id: '10k-finish',
    goal: '10k',
    tier: 'finish',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [3, 4],
    gate: { longestKm: 4 },
    startKm: 15,
    peakKm: { 3: 28, 4: 34 },
    longCapKm: 11,
    longCapMin: 70,
    longShare: 0.5,
    qualityDays: 0,
    taperWeeks: 1.5,
    raceKm: 10,
    timeBased: false,
  },
  {
    id: '10k-improve',
    goal: '10k',
    tier: 'improve',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [4, 5],
    gate: { weeklyKm: 20, longestKm: 8 },
    startKm: 20,
    peakKm: { 4: 42, 5: 50 },
    longCapKm: 14,
    longCapMin: 90,
    longShare: 0.45,
    qualityDays: 1,
    taperWeeks: 1.5,
    raceKm: 10,
    timeBased: false,
  },
  {
    id: '10k-race',
    goal: '10k',
    tier: 'race',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [5, 6],
    gate: { weeklyKm: 35, longestKm: 10, runsPerWeek: 4 },
    startKm: 35,
    peakKm: { 5: 60, 6: 70 },
    longCapKm: 16,
    longCapMin: 100,
    longShare: 0.3,
    qualityDays: 2,
    taperWeeks: 1.5,
    raceKm: 10,
    timeBased: false,
  },

  // ---- Half marathon ----------------------------------------------------------
  {
    id: 'half-finish',
    goal: 'half',
    tier: 'finish',
    weeks: 12,
    minWeeks: 10,
    daysOptions: [3, 4],
    gate: { weeklyKm: 15, longestKm: 7 },
    startKm: 18,
    peakKm: { 3: 36, 4: 42 },
    longCapKm: 18,
    longCapMin: 150,
    longShare: 0.5,
    qualityDays: 0,
    taperWeeks: 2,
    raceKm: HALF,
    timeBased: false,
  },
  {
    id: 'half-improve',
    goal: 'half',
    tier: 'improve',
    weeks: 12,
    minWeeks: 10,
    daysOptions: [4, 5],
    gate: { weeklyKm: 25, longestKm: 12 },
    startKm: 25,
    peakKm: { 4: 48, 5: 56 },
    longCapKm: 19,
    longCapMin: 150,
    longShare: 0.45,
    qualityDays: 1,
    taperWeeks: 2,
    raceKm: HALF,
    timeBased: false,
  },
  {
    id: 'half-race',
    goal: 'half',
    tier: 'race',
    weeks: 14,
    minWeeks: 10,
    daysOptions: [5, 6],
    gate: { weeklyKm: 40, longestKm: 14, runsPerWeek: 4 },
    startKm: 40,
    peakKm: { 5: 70, 6: 85 },
    longCapKm: 22,
    longCapMin: 150,
    longShare: 0.35,
    qualityDays: 2,
    taperWeeks: 2,
    raceKm: HALF,
    timeBased: false,
  },

  // ---- Marathon ------------------------------------------------------------------
  {
    id: 'marathon-finish',
    goal: 'marathon',
    tier: 'finish',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [4],
    gate: { weeklyKm: 25, longestKm: 13 },
    startKm: 28,
    peakKm: { 4: 64 },
    longCapKm: 32,
    longCapMin: 180,
    longShare: 0.5,
    qualityDays: 0,
    taperWeeks: 3,
    raceKm: MARATHON,
    timeBased: false,
  },
  {
    id: 'marathon-improve',
    goal: 'marathon',
    tier: 'improve',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [5],
    gate: { weeklyKm: 40, longestKm: 18 },
    startKm: 40,
    peakKm: { 5: 80 },
    longCapKm: 32,
    longCapMin: 180,
    longShare: 0.42,
    qualityDays: 1,
    taperWeeks: 3,
    raceKm: MARATHON,
    timeBased: false,
  },
  {
    id: 'marathon-race',
    goal: 'marathon',
    tier: 'race',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [5, 6],
    gate: { weeklyKm: 55, longestKm: 20, runsPerWeek: 5 },
    startKm: 55,
    peakKm: { 5: 100, 6: 115 },
    longCapKm: 35,
    longCapMin: 180,
    longShare: 0.35,
    qualityDays: 2,
    taperWeeks: 3,
    raceKm: MARATHON,
    timeBased: false,
  },
];

// Names, lines and who-it-suits come from the interface text, in the runner's language.
export const PLANS: PlanSpec[] = live(() =>
  SPECS.map((d) => {
    const t = ui().plans[d.id as Exclude<keyof Strings['plans'], 'goal'>];
    return { ...d, name: t.name, blurb: t.blurb, gate: { ...d.gate, text: t.who } };
  }),
);

export const GOAL_LABEL: Record<Goal, string> = live(() => ui().plans.goal);

export function planById(id: string): PlanSpec | undefined {
  return PLANS.find((p) => p.id === id);
}

export function plansFor(goal: Goal): PlanSpec[] {
  return PLANS.filter((p) => p.goal === goal);
}

/** Where the runner stands, read from history. Zeros when there is none. */
export interface RunnerProfile {
  weeklyKm: number; // average of the last 4 weeks
  longestKm30: number; // longest run in the last 30 days
  runsPerWeek: number; // average over the last 4 weeks
  easyPaceSPerKm: number; // what "easy" costs in time, for turning minutes into km
}

export type GateResult = { ok: true } | { ok: false; reason: string; bridge: string | null };

/** The gate, as a real check. Below it we say so and point at a bridge plan. */
export function checkGate(spec: PlanSpec, r: RunnerProfile): GateResult {
  const g = spec.gate;
  const short: string[] = [];
  if (g.weeklyKm != null && r.weeklyKm < g.weeklyKm * 0.8) short.push(ui().catalogue.aboutXKmAWeek(g.weeklyKm, Math.round(r.weeklyKm)));
  if (g.longestKm != null && r.longestKm30 < g.longestKm * 0.8) short.push(ui().catalogue.aRecentRunOfX(g.longestKm, decimal(r.longestKm30.toFixed(1))));
  if (g.runsPerWeek != null && r.runsPerWeek < g.runsPerWeek - 0.5) short.push(ui().catalogue.xRunsAWeekYou(g.runsPerWeek, decimal(r.runsPerWeek.toFixed(1))));
  if (!short.length) return { ok: true };
  return { ok: false, reason: ui().catalogue.thisPlanExpectsX(short.join(', ')), bridge: bridgeFor(spec) };
}

/** Days a week that make sense for this volume: about 4 km a run at least, unless the plan is time-based. */
export function daysFit(spec: PlanSpec, r: RunnerProfile, days: number): boolean {
  if (spec.timeBased) return true;
  const weekly = r.weeklyKm > 0 ? r.weeklyKm : spec.startKm;
  return weekly >= days * 4 || days === spec.daysOptions[0];
}

function bridgeFor(spec: PlanSpec): string | null {
  if (spec.tier === 'race') return spec.goal === 'marathon' ? 'marathon-improve' : spec.goal === 'half' ? 'half-improve' : '10k-improve';
  if (spec.tier === 'improve') return ui().catalogue.xFinish(spec.goal);
  if (spec.goal === 'marathon') return 'half-finish';
  if (spec.goal === 'half') return '10k-finish';
  if (spec.goal === '10k') return '5k-finish';
  return 'start';
}
