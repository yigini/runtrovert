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

export const PLANS: PlanSpec[] = [
  // ---- No race --------------------------------------------------------------
  {
    id: 'start',
    goal: 'none',
    tier: 'start',
    name: 'Start running',
    blurb: 'Nine weeks from a 30-minute walk to 30 minutes of running. Walk breaks shrink; nothing else changes.',
    weeks: 9,
    minWeeks: 9,
    daysOptions: [3],
    gate: { text: 'Can walk for 30 minutes.' },
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
    name: 'Keep running',
    blurb: 'Rolling four-week blocks that hold a steady habit. Three build weeks, one lighter. No race, no clock.',
    weeks: 4,
    minWeeks: 4,
    daysOptions: [2, 3, 4, 5],
    gate: { runsPerWeek: 1, text: 'Already running, however little.' },
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
    name: 'Come back',
    blurb: 'Six weeks back to about 80% of where you were, after four or more weeks off, illness, or a healed injury.',
    weeks: 6,
    minWeeks: 6,
    daysOptions: [3],
    gate: { text: 'Four or more weeks off. If it was an injury, cleared to run by a clinician.' },
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
    name: '5K Finish',
    blurb: 'Eight weeks to run five kilometres without stopping. Strides from week three, nothing harder.',
    weeks: 8,
    minWeeks: 6,
    daysOptions: [3],
    gate: { longestKm: 2, text: 'Can run or run/walk for 20 minutes, or finished Start running.' },
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
    name: '5K Improve',
    blurb: 'Eight weeks with one quality session a week: threshold early, intervals at 5K effort later.',
    weeks: 8,
    minWeeks: 6,
    daysOptions: [4, 5],
    gate: { weeklyKm: 15, longestKm: 5, text: 'Has run a 5K, about 15 km a week.' },
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
    name: '10K Finish',
    blurb: 'Ten weeks from thirty continuous minutes to ten kilometres. The long run does the work.',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [3, 4],
    gate: { longestKm: 4, text: 'Can run 30 minutes without stopping.' },
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
    name: '10K Improve',
    blurb: 'Ten weeks, one quality session a week, race-pace stretches inside the long run from the halfway point.',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [4, 5],
    gate: { weeklyKm: 20, longestKm: 8, text: 'Has run a 10K, about 20 km a week.' },
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
    name: '5K/10K Race',
    blurb: 'Ten weeks, two quality sessions a week: threshold and either intervals or fast repetitions. Competitive.',
    weeks: 10,
    minWeeks: 6,
    daysOptions: [5, 6],
    gate: { weeklyKm: 35, longestKm: 10, runsPerWeek: 4, text: 'Six months of steady running, 35+ km a week.' },
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
    name: 'Half Finish',
    blurb: 'Twelve weeks, mostly easy, long run to 18 km. Strides and a little fartlek, nothing you would call a workout.',
    weeks: 12,
    minWeeks: 10,
    daysOptions: [3, 4],
    gate: { weeklyKm: 15, longestKm: 7, text: '10K done, or 60 minutes continuous. 15 to 20 km a week.' },
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
    name: 'Half Improve',
    blurb: 'Twelve weeks, one quality session a week, long runs that finish at race effort from week nine.',
    weeks: 12,
    minWeeks: 10,
    daysOptions: [4, 5],
    gate: { weeklyKm: 25, longestKm: 12, text: 'Half done, or a long run of 15 km+. 25 km a week.' },
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
    name: 'Half Race',
    blurb: 'Fourteen weeks, two quality sessions a week, long run to 22 km with race-pace blocks. Competitive.',
    weeks: 14,
    minWeeks: 10,
    daysOptions: [5, 6],
    gate: { weeklyKm: 40, longestKm: 14, runsPerWeek: 4, text: 'Six months of steady running, 40+ km a week.' },
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
    name: 'Marathon Finish',
    blurb: 'Eighteen weeks, four days, long run to 32 km or three hours, whichever comes first. Three-week taper.',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [4],
    gate: { weeklyKm: 25, longestKm: 13, text: '25+ km a week for a month, a long run of 13 km+ in the last 30 days. A half done helps.' },
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
    name: 'Marathon Improve',
    blurb: 'Eighteen weeks, five days, one quality session a week, marathon-pace blocks inside the long run.',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [5],
    gate: { weeklyKm: 40, longestKm: 18, text: 'Marathon done, 40+ km a week, a long run of 18 km+.' },
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
    name: 'Marathon Race',
    blurb: 'Eighteen weeks, five or six days, two quality sessions, long run to 35 km. Competitive.',
    weeks: 18,
    minWeeks: 14,
    daysOptions: [5, 6],
    gate: { weeklyKm: 55, longestKm: 20, runsPerWeek: 5, text: 'Six months of steady running, 55+ km a week, marathon done.' },
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

export const GOAL_LABEL: Record<Goal, string> = { none: 'Just running', '5k': '5K', '10k': '10K', half: 'Half marathon', marathon: 'Marathon' };

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
  if (g.weeklyKm != null && r.weeklyKm < g.weeklyKm * 0.8) short.push(`about ${g.weeklyKm} km a week (you: ${Math.round(r.weeklyKm)})`);
  if (g.longestKm != null && r.longestKm30 < g.longestKm * 0.8) short.push(`a recent run of ${g.longestKm} km (you: ${r.longestKm30.toFixed(1)})`);
  if (g.runsPerWeek != null && r.runsPerWeek < g.runsPerWeek - 0.5) short.push(`${g.runsPerWeek} runs a week (you: ${r.runsPerWeek.toFixed(1)})`);
  if (!short.length) return { ok: true };
  return { ok: false, reason: `This plan expects ${short.join(', ')}.`, bridge: bridgeFor(spec) };
}

/** Days a week that make sense for this volume: about 4 km a run at least, unless the plan is time-based. */
export function daysFit(spec: PlanSpec, r: RunnerProfile, days: number): boolean {
  if (spec.timeBased) return true;
  const weekly = r.weeklyKm > 0 ? r.weeklyKm : spec.startKm;
  return weekly >= days * 4 || days === spec.daysOptions[0];
}

function bridgeFor(spec: PlanSpec): string | null {
  if (spec.tier === 'race') return spec.goal === 'marathon' ? 'marathon-improve' : spec.goal === 'half' ? 'half-improve' : '10k-improve';
  if (spec.tier === 'improve') return `${spec.goal}-finish`;
  if (spec.goal === 'marathon') return 'half-finish';
  if (spec.goal === 'half') return '10k-finish';
  if (spec.goal === '10k') return '5k-finish';
  return 'start';
}
