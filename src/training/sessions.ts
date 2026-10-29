// Session templates. Each builder returns the steps, a one-line summary, the
// planned minutes and kilometres, and the reason the session exists. Efforts
// are described by the talk test first; paces are only attached when the runner
// gave us a recent race.

import type { Goal, PlanSpec, RunnerProfile } from './catalogue';
import type { Paces } from './paces';
import type { Effort, Session, SessionKind, Step } from './types';

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
    title: `Easy ${minutes} min`,
    summary: `${minutes} min at a pace where you could chat.`,
    why: 'Easy running is where most of the fitness comes from. It builds the engine without wearing the frame.',
    steps: [step('run', 'easy', 'Easy. Full sentences.', min(minutes))],
    hard: false,
  };
}

export function recoveryRun(minutes: number): Draft {
  return {
    kind: 'recovery',
    title: `Recovery ${minutes} min`,
    summary: `${minutes} min, slower than feels necessary.`,
    why: 'Blood flow without strain, the day after something hard. Slower than easy is correct.',
    steps: [step('run', 'easy', 'Very easy. Slower than feels necessary.', min(minutes))],
    hard: false,
  };
}

export function easyWithStrides(minutes: number, n: number): Draft {
  const steps: Step[] = [step('run', 'easy', 'Easy. Full sentences.', min(minutes))];
  for (let i = 0; i < n; i++) {
    steps.push(step('stride', 'fast', 'Stride: quick and relaxed, not a sprint', 20));
    steps.push(step('walk', 'walk', 'Walk it off', 60));
  }
  return {
    kind: 'strides',
    title: `Easy ${minutes} min + ${n} strides`,
    summary: `${minutes} min easy, then ${n} × 20 s quick and relaxed with a minute's walk between.`,
    why: 'Strides teach the legs to turn over quickly without any real strain. Twenty seconds is too short to hurt.',
    steps,
    hard: false,
  };
}

export function longRun(km: number, racePaceKm: number, raceLabel: string, goal: Goal): Draft {
  const easyKm = Math.max(km - racePaceKm, 0);
  const steps: Step[] = [step('run', 'easy', 'Easy. Full sentences.', undefined, Math.round(easyKm * 1000))];
  if (racePaceKm > 0) steps.push(step('run', goal === '10k' ? 'steady' : 'race', raceLabel, undefined, Math.round(racePaceKm * 1000)));
  const rp = racePaceKm > 0 ? `, the last ${racePaceKm} km at ${goal === '10k' ? 'steady' : 'race'} effort` : ', all easy';
  return {
    kind: 'long',
    title: `Long run ${km} km`,
    summary: `${km} km${rp}.`,
    why: racePaceKm > 0 ? 'The long run is the backbone. Finishing it at race effort teaches the body to hold pace on tired legs.' : 'The long run is the backbone of any distance plan. Time on feet, nothing clever.',
    steps,
    hard: false,
  };
}

export function threshold(reps: number, repMin: number, jogMin: number, p: PaceSet): Draft {
  const steps: Step[] = [step('warm', 'easy', 'Warm up, easy', min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'threshold', 'Comfortably hard. Short sentences only.', min(repMin)));
    if (i < reps - 1) steps.push(step('jog', 'easy', 'Jog', min(jogMin)));
  }
  steps.push(step('cool', 'easy', 'Cool down, easy', min(10)));
  const work = reps === 1 ? `${repMin} min comfortably hard` : `${reps} × ${repMin} min comfortably hard with ${jogMin} min jog`;
  return {
    kind: 'threshold',
    title: reps === 1 ? `Threshold ${repMin} min` : `Threshold ${reps} × ${repMin} min`,
    summary: `10 min easy, ${work}, 10 min easy.`,
    why: 'Raises the pace you can hold for about an hour. Comfortably hard means you could say a sentence, not tell a story.',
    steps,
    hard: true,
  };
}

export function intervals(reps: number, repMin: number): Draft {
  const steps: Step[] = [step('warm', 'easy', 'Warm up, easy', min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'hard', 'Hard. 5K effort, a few words at most.', min(repMin)));
    if (i < reps - 1) steps.push(step('jog', 'easy', 'Jog, as slow as you like', min(repMin)));
  }
  steps.push(step('cool', 'easy', 'Cool down, easy', min(10)));
  return {
    kind: 'intervals',
    title: `Intervals ${reps} × ${repMin} min`,
    summary: `10 min easy, ${reps} × ${repMin} min hard with ${repMin} min jog, 10 min easy.`,
    why: 'Time near your maximum effort, in pieces small enough to repeat. This is what moves a 5K or 10K time.',
    steps,
    hard: true,
  };
}

export function repetitions(reps: number, metres: number): Draft {
  const steps: Step[] = [step('warm', 'easy', 'Warm up, easy', min(12))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'fast', 'Fast and relaxed. Mile effort.', undefined, metres));
    if (i < reps - 1) steps.push(step('jog', 'easy', 'Jog back, full recovery', undefined, metres));
  }
  steps.push(step('cool', 'easy', 'Cool down, easy', min(10)));
  return {
    kind: 'reps',
    title: `Reps ${reps} × ${metres} m`,
    summary: `12 min easy, ${reps} × ${metres} m fast and relaxed with a ${metres} m jog, 10 min easy.`,
    why: 'Speed and economy. Full recovery between reps keeps the form clean; tired reps teach bad habits.',
    steps,
    hard: true,
  };
}

export function hills(reps: number): Draft {
  const steps: Step[] = [step('warm', 'easy', 'Warm up, easy, to a hill', min(12))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', 'hard', 'Up the hill, hard, tall posture', 45));
    if (i < reps - 1) steps.push(step('walk', 'walk', 'Walk or jog back down', 90));
  }
  steps.push(step('cool', 'easy', 'Cool down, easy', min(10)));
  return {
    kind: 'hills',
    title: `Hills ${reps} × 45 s`,
    summary: `12 min easy, ${reps} × 45 s hard uphill with the walk down as rest, 10 min easy.`,
    why: 'Strength and power without the impact of flat speed work. Hills are intervals in disguise.',
    steps,
    hard: true,
  };
}

export function fartlek(reps: number, onS: number, offS: number, gentle: boolean): Draft {
  const steps: Step[] = [step('warm', 'easy', 'Warm up, easy', min(10))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('hard', gentle ? 'steady' : 'hard', gentle ? 'Pick it up a little. Short sentences.' : 'Quick. A few words at most.', onS));
    if (i < reps - 1) steps.push(step('jog', 'easy', 'Ease off', offS));
  }
  steps.push(step('cool', 'easy', 'Cool down, easy', min(10)));
  const on = onS % 60 === 0 ? `${onS / 60} min` : `${onS} s`;
  const off = offS % 60 === 0 ? `${offS / 60} min` : `${offS} s`;
  return {
    kind: 'fartlek',
    title: `${gentle ? 'Gentle fartlek' : 'Fartlek'} ${reps} × ${on}`,
    summary: `10 min easy, ${reps} × ${on} ${gentle ? 'a little quicker' : 'quick'} with ${off} easy, 10 min easy.`,
    why: gentle ? 'A first taste of changing pace, by feel. Nothing here should hurt.' : 'Changes of pace by feel, with no watch to obey. Hard enough to count, loose enough to enjoy.',
    steps,
    hard: !gentle,
  };
}

export function racePaceRun(minutes: number, label: string, effort: Effort = 'race', warmMin = 10): Draft {
  return {
    kind: 'racepace',
    title: `Race pace ${minutes} min`,
    summary: `${warmMin} min easy, ${minutes} min at ${label}, ${warmMin} min easy.`,
    why: 'Rehearsal. The body learns what the goal pace feels like so race day holds no surprises.',
    steps: [step('warm', 'easy', 'Warm up, easy', min(warmMin)), step('hard', effort, label, min(minutes)), step('cool', 'easy', 'Cool down, easy', min(warmMin))],
    hard: false,
  };
}

export function runWalk(reps: number, runS: number, walkS: number): Draft {
  const steps: Step[] = [step('walk', 'walk', 'Brisk walk to warm up', min(5))];
  for (let i = 0; i < reps; i++) {
    steps.push(step('run', 'easy', 'Run, gently. Full sentences.', runS));
    if (i < reps - 1 || walkS > 0) steps.push(step('walk', 'walk', 'Walk', walkS));
  }
  steps.push(step('walk', 'walk', 'Walk to cool down', min(5)));
  const fmt = (s: number) => (s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);
  return {
    kind: 'runwalk',
    title: `Run ${fmt(runS)} × ${reps}`,
    summary: `5 min walk, then ${reps} × run ${fmt(runS)} / walk ${fmt(walkS)}, 5 min walk.`,
    why: 'Walk breaks are the method, not a failure. The running grows; the walking shrinks.',
    steps,
    hard: false,
  };
}

export function continuous(minutes: number, title?: string): Draft {
  return {
    kind: 'easy',
    title: title ?? `Run ${minutes} min`,
    summary: `5 min walk, ${minutes} min of gentle running, 5 min walk.`,
    why: 'Continuous running, at a pace where you could still talk.',
    steps: [step('walk', 'walk', 'Brisk walk to warm up', min(5)), step('run', 'easy', 'Run, gently. Full sentences.', min(minutes)), step('walk', 'walk', 'Walk to cool down', min(5))],
    hard: false,
  };
}

export function strength(): Draft {
  return {
    kind: 'strength',
    title: 'Strength 20 min',
    summary: '2 rounds: 10 squats, 10 single-leg calf raises each side, 8 reverse lunges each side, 30 s side plank each side, 10 glute bridges, 20 s single-leg balance each side.',
    why: 'Two short strength sessions a week roughly halve the risk of overuse injury in the research. Optional, and never on the day before a long run.',
    steps: [],
    hard: false,
    optional: true,
  };
}

export function shakeout(minutes: number, strides: number): Draft {
  const d = easyWithStrides(minutes, strides);
  return { ...d, title: `Shakeout ${minutes} min`, why: 'Loosens the legs the day before. Short on purpose.' };
}

export function raceDay(spec: PlanSpec): Draft {
  const km = spec.raceKm ?? 0;
  const label = spec.goal === 'marathon' ? 'Marathon' : spec.goal === 'half' ? 'Half marathon' : spec.goal === '10k' ? '10K' : '5K';
  return {
    kind: 'race',
    title: `${label} race day`,
    summary: spec.tier === 'finish' ? 'Start slower than feels right. Walk the water stations if you like. Finish.' : 'Even pace. The first km should feel too easy.',
    why: 'This is what the weeks were for.',
    steps: [step('run', 'race', 'Race', undefined, Math.round(km * 1000))],
    hard: true,
  };
}
