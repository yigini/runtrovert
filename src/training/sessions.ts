// Session templates. Each builder returns the steps, a one-line summary, the
// planned minutes and kilometres, and the reason the session exists. Efforts
// are described by the talk test first; paces are only attached when the runner
// gave us a recent race.

import type { Goal, PlanSpec, RunnerProfile } from './catalogue';
import type { Paces } from './paces';
import type { Effort, Session, SessionKind, Step } from './types';
import { ui } from '../i18n/ui';

/** Seconds per km for each effort, from a race result or scaled off easy pace. */
export interface PaceSet {
  easy: number;
  steady: number; // about marathon pace
  race: number; // the goal race's pace
  threshold: number;
  interval: number;
  reps: number;
}

export function paceSetFor(runner: RunnerProfile, paces: Paces | null, goal: Goal): PaceSet {
  if (paces) {
    const race =
      goal === '5k' ? paces.predicted['5k'] / 5 :
      goal === '10k' ? paces.predicted['10k'] / 10 :
      goal === 'half' ? paces.predicted.half / 21.0975 :
      goal === 'marathon' ? paces.predicted.marathon / 42.195 :
      paces.marathon;
    return {
      easy: Math.round((paces.easy[0] + paces.easy[1]) / 2),
      steady: paces.marathon,
      race: Math.round(race),
      threshold: paces.threshold,
      interval: paces.interval,
      reps: paces.reps,
    };
  }
  const e = runner.easyPaceSPerKm;
  const race = goal === '5k' ? e * 0.76 : goal === '10k' ? e * 0.8 : goal === 'half' ? e * 0.86 : e * 0.9;
  return { easy: e, steady: Math.round(e * 0.9), race: Math.round(race), threshold: Math.round(e * 0.82), interval: Math.round(e * 0.76), reps: Math.round(e * 0.71) };
}

export function paceFor(effort: Effort, p: PaceSet): number {
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

export const EFFORT_LABEL: Record<Effort, string> = {
  walk: 'Walk',
  easy: 'Easy. Full sentences.',
  steady: 'Steady. Short sentences.',
  race: 'Race effort',
  threshold: 'Comfortably hard. Short sentences only.',
  hard: 'Hard. A few words at most.',
  fast: 'Fast and relaxed',
};

const min = (m: number) => Math.round(m * 60);

function step(kind: Step['kind'], effort: Effort, label: string, durationS?: number, distanceM?: number): Step {
  return { kind, effort, label, durationS, distanceM };
}

/** Minutes and running km of a step list at the given paces. Walking counts as time, never as running distance. */
export function measure(steps: Step[], p: PaceSet): { minutes: number; km: number } {
  let s = 0;
  let km = 0;
  for (const st of steps) {
    const pace = paceFor(st.effort, p);
    const walk = st.effort === 'walk';
    if (st.durationS != null) {
      s += st.durationS;
      if (!walk) km += st.durationS / pace;
    } else if (st.distanceM != null) {
      if (!walk) km += st.distanceM / 1000;
      s += (st.distanceM / 1000) * pace;
    }
  }
  return { minutes: Math.round(s / 60), km: Math.round(km * 10) / 10 };
}

interface Draft {
  kind: SessionKind;
  title: string;
  summary: string;
  why: string;
  steps: Step[];
  hard: boolean;
  optional?: boolean;
}

export function toSession(d: Draft, id: string, date: number, p: PaceSet): Session {
  const m = measure(d.steps, p);
  return {
    id,
    date,
    kind: d.kind,
    title: d.title,
    summary: d.summary,
    why: d.why,
    minutes: m.minutes,
    km: m.km,
    hard: d.hard,
    optional: d.optional ?? false,
    steps: d.steps,
    done: null,
    skipped: false,
    note: null,
  };
}

// ---- Templates ---------------------------------------------------------------

export function easyRun(minutes: number): Draft {
  return {
    kind: 'easy',
    title: ui().sessions.easyXMin(minutes),
    summary: ui().sessions.xMinAtAPace(minutes),
    why: ui().sessions.easyRunningIsWhereMost,
    steps: [step('run', 'easy', ui().sessions.easyFullSentences, min(minutes))],
    hard: false,
  };
}

export function recoveryRun(minutes: number): Draft {
  return {
    kind: 'recovery',
    title: ui().sessions.recoveryXMin(minutes),
    summary: ui().sessions.xMinSlowerThanFeels(minutes),
    why: ui().sessions.bloodFlowWithoutStrainThe,
    steps: [step('run', 'easy', ui().sessions.veryEasySlowerThanFeels, min(minutes))],
    hard: false,
  };
}

export function easyWithStrides(minutes: number, n: number): Draft {
  const steps: Step[] = [step('run', 'easy', ui().sessions.easyFullSentences, min(minutes))];
  for (let i = 0; i < n; i++) {
    steps.push(step('stride', 'fast', ui().sessions.strideQuickAndRelaxedNot, 20));
    steps.push(step('walk', 'walk', ui().sessions.walkItOff, 60));
  }
  return {
    kind: 'strides',
    title: ui().sessions.easyXMinXStrides(minutes, n),
    summary: ui().sessions.xMinEasyThenX(minutes, n),
    why: ui().sessions.stridesTeachTheLegsTo,
    steps,
    hard: false,
  };
}

export function longRun(km: number, racePaceKm: number, raceLabel: string, goal: Goal): Draft {
  const easyKm = Math.max(km - racePaceKm, 0);
  const steps: Step[] = [step('run', 'easy', ui().sessions.easyFullSentences, undefined, Math.round(easyKm * 1000))];
  if (racePaceKm > 0) steps.push(step('run', goal === '10k' ? 'steady' : 'race', raceLabel, undefined, Math.round(racePaceKm * 1000)));
  const rp = racePaceKm > 0 ? ui().sessions.theLastXKmAt(racePaceKm, goal === '10k' ? 'steady' : 'race') : ui().sessions.allEasy;
  return {
    kind: 'long',
    title: ui().sessions.longRunXKm(km),
    summary: `${km} km${rp}.`,
    why: racePaceKm > 0 ? ui().sessions.theLongRunIsThe : ui().sessions.theLongRunIsThe2,
    steps,
    hard: false,
  };
}

export function threshold(reps: number, repMin: number, jogMin: number, p: PaceSet): Draft {
  const steps: Step[] = [step('warm', 'easy', ui().sessions.warmUpEasy, min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'threshold', ui().sessions.comfortablyHardShortSentencesOnly, min(repMin)));
    if (i < reps - 1) steps.push(step('jog', 'easy', ui().sessions.jog, min(jogMin)));
  }
  steps.push(step('cool', 'easy', ui().sessions.coolDownEasy, min(10)));
  const work = reps === 1 ? ui().sessions.xMinComfortablyHard(repMin) : ui().sessions.xXMinComfortablyHard(reps, repMin, jogMin);
  return {
    kind: 'threshold',
    title: reps === 1 ? ui().sessions.thresholdXMin(repMin) : ui().sessions.thresholdXXMin(reps, repMin),
    summary: ui().sessions.n10MinEasyX10(work),
    why: ui().sessions.raisesThePaceYouCan,
    steps,
    hard: true,
  };
}

export function intervals(reps: number, repMin: number): Draft {
  const steps: Step[] = [step('warm', 'easy', ui().sessions.warmUpEasy, min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'hard', ui().sessions.hard5kEffortAFew, min(repMin)));
    if (i < reps - 1) steps.push(step('jog', 'easy', ui().sessions.jogAsSlowAsYou, min(repMin)));
  }
  steps.push(step('cool', 'easy', ui().sessions.coolDownEasy, min(10)));
  return {
    kind: 'intervals',
    title: ui().sessions.intervalsXXMin(reps, repMin),
    summary: ui().sessions.n10MinEasyXX(reps, repMin, repMin),
    why: ui().sessions.timeNearYourMaximumEffort,
    steps,
    hard: true,
  };
}

export function repetitions(reps: number, metres: number): Draft {
  const steps: Step[] = [step('warm', 'easy', ui().sessions.warmUpEasy, min(12))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'fast', ui().sessions.fastAndRelaxedMileEffort, undefined, metres));
    if (i < reps - 1) steps.push(step('jog', 'easy', ui().sessions.jogBackFullRecovery, undefined, metres));
  }
  steps.push(step('cool', 'easy', ui().sessions.coolDownEasy, min(10)));
  return {
    kind: 'reps',
    title: ui().sessions.repsXXM(reps, metres),
    summary: ui().sessions.n12MinEasyXX(reps, metres, metres),
    why: ui().sessions.speedAndEconomyFullRecovery,
    steps,
    hard: true,
  };
}

export function hills(reps: number): Draft {
  const steps: Step[] = [step('warm', 'easy', ui().sessions.warmUpEasyToA, min(12))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'hard', ui().sessions.upTheHillHardTall, 45));
    if (i < reps - 1) steps.push(step('walk', 'walk', ui().sessions.walkOrJogBackDown, 90));
  }
  steps.push(step('cool', 'easy', ui().sessions.coolDownEasy, min(10)));
  return {
    kind: 'hills',
    title: ui().sessions.hillsX45S(reps),
    summary: ui().sessions.n12MinEasyX45(reps),
    why: ui().sessions.strengthAndPowerWithoutThe,
    steps,
    hard: true,
  };
}

export function fartlek(reps: number, onS: number, offS: number, gentle: boolean): Draft {
  const steps: Step[] = [step('warm', 'easy', ui().sessions.warmUpEasy, min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', gentle ? 'steady' : 'hard', gentle ? ui().sessions.pickItUpALittle : ui().sessions.quickAFewWordsAt, onS));
    if (i < reps - 1) steps.push(step('jog', 'easy', ui().sessions.easeOff, offS));
  }
  steps.push(step('cool', 'easy', ui().sessions.coolDownEasy, min(10)));
  const on = onS % 60 === 0 ? `${onS / 60} min` : `${onS} s`;
  const off = offS % 60 === 0 ? `${offS / 60} min` : `${offS} s`;
  return {
    kind: 'fartlek',
    title: `${gentle ? ui().sessions.gentleFartlek : ui().sessions.fartlek} ${reps} × ${on}`,
    summary: ui().sessions.n10MinEasyXX2(reps, on, gentle ? ui().sessions.aLittleQuicker : 'quick', off),
    why: gentle ? ui().sessions.aFirstTasteOfChanging : ui().sessions.changesOfPaceByFeel,
    steps,
    hard: !gentle,
  };
}

export function racePaceRun(minutes: number, label: string, effort: Effort = 'race', warmMin = 10): Draft {
  return {
    kind: 'racepace',
    title: ui().sessions.racePaceXMin(minutes),
    summary: ui().sessions.xMinEasyXMin(warmMin, minutes, label, warmMin),
    why: ui().sessions.rehearsalTheBodyLearnsWhat,
    steps: [step('warm', 'easy', ui().sessions.warmUpEasy, min(warmMin)), step('hard', effort, label, min(minutes)), step('cool', 'easy', ui().sessions.coolDownEasy, min(warmMin))],
    hard: false,
  };
}

export function runWalk(reps: number, runS: number, walkS: number): Draft {
  const steps: Step[] = [step('walk', 'walk', ui().sessions.briskWalkToWarmUp, min(5))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('run', 'easy', ui().sessions.runGentlyFullSentences, runS));
    if (i < reps - 1 || walkS > 0) steps.push(step('walk', 'walk', ui().sessions.walk, walkS));
  }
  steps.push(step('walk', 'walk', ui().sessions.walkToCoolDown, min(5)));
  const fmt = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);
  return {
    kind: 'runwalk',
    title: ui().sessions.runXX(fmt(runS), reps),
    summary: ui().sessions.n5MinWalkThenX(reps, fmt(runS), fmt(walkS)),
    why: ui().sessions.walkBreaksAreTheMethod,
    steps,
    hard: false,
  };
}

export function continuous(minutes: number, title?: string): Draft {
  return {
    kind: 'easy',
    title: title ?? ui().sessions.runXMin(minutes),
    summary: ui().sessions.n5MinWalkXMin(minutes),
    why: ui().sessions.continuousRunningAtAPace,
    steps: [step('walk', 'walk', ui().sessions.briskWalkToWarmUp, min(5)), step('run', 'easy', ui().sessions.runGentlyFullSentences, min(minutes)), step('walk', 'walk', ui().sessions.walkToCoolDown, min(5))],
    hard: false,
  };
}

export function strength(): Draft {
  return {
    kind: 'strength',
    title: ui().sessions.strength20Min,
    summary: ui().sessions.n2Rounds10Squats10,
    why: ui().sessions.twoShortStrengthSessionsA,
    steps: [],
    hard: false,
    optional: true,
  };
}

export function shakeout(minutes: number, strides: number): Draft {
  const d = easyWithStrides(minutes, strides);
  return { ...d, title: ui().sessions.shakeoutXMin(minutes), why: ui().sessions.loosensTheLegsTheDay };
}

export function raceDay(spec: PlanSpec): Draft {
  const km = spec.raceKm ?? 0;
  const label = spec.goal === 'marathon' ? ui().sessions.marathon : spec.goal === 'half' ? ui().sessions.halfMarathon : spec.goal === '10k' ? '10K' : '5K';
  return {
    kind: 'race',
    title: ui().sessions.xRaceDay(label),
    summary: spec.tier === 'finish' ? ui().sessions.startSlowerThanFeelsRight : ui().sessions.evenPaceTheFirstKm,
    why: ui().sessions.thisIsWhatTheWeeks,
    steps: [step('run', 'race', ui().sessions.race, undefined, Math.round(km * 1000))],
    hard: true,
  };
}
