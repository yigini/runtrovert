/**
 * Heart rate from a watch, kept with the run on this phone. Pure.
 * Average is over time, not over samples, so a watch that reads more often
 * while you're still doesn't drag the number down.
 */

export interface HeartSample {
  ts: number; // epoch ms
  bpm: number;
}

export interface HeartSummary {
  avg: number;
  max: number;
  samples: number;
}

/** Longer than this between two readings is a gap (watch off the wrist, out of reach), not a reading. */
const GAP_MS = 30_000;

/** Samples inside the run's own time, sorted, one per timestamp. */
export function cleanHeart(samples: HeartSample[], startedAt: number, endedAt: number | null): HeartSample[] {
  const end = endedAt ?? Number.POSITIVE_INFINITY;
  const seen = new Set<number>();
  return samples
    .filter((s) => s.ts >= startedAt && s.ts <= end && s.bpm >= 25 && s.bpm <= 250)
    .sort((a, b) => a.ts - b.ts)
    .filter((s) => (seen.has(s.ts) ? false : (seen.add(s.ts), true)));
}

/** null when there's too little to say anything (under a minute of readings). */
export function heartSummary(samples: HeartSample[]): HeartSummary | null {
  if (samples.length < 2) return null;
  let weighted = 0;
  let time = 0;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    max = Math.max(max, samples[i].bpm);
    if (i === 0) continue;
    const dt = samples[i].ts - samples[i - 1].ts;
    if (dt <= 0 || dt > GAP_MS) continue;
    weighted += ((samples[i].bpm + samples[i - 1].bpm) / 2) * dt;
    time += dt;
  }
  if (time < 60_000) return null;
  return { avg: Math.round(weighted / time), max, samples: samples.length };
}

export type HeartFrom = 'watch' | 'strap';

/** A strap that spoke this recently wins over the Wear OS watch: chest straps read truer, and two sources would zigzag. */
export const STRAP_WINS_MS = 15_000;

/** Whether a reading from `from` is kept, given when the strap last gave one (0: never). */
export function keepReading(from: HeartFrom, now: number, strapAt: number): boolean {
  return from === 'strap' || now - strapAt > STRAP_WINS_MS;
}

/** The reading nearest `ts`, if one is within 10 s (for writing heart rate onto route points). Samples sorted by ts. */
export function heartAt(samples: HeartSample[], ts: number): number | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  let best = samples[lo];
  if (lo > 0 && Math.abs(samples[lo - 1].ts - ts) < Math.abs(best.ts - ts)) best = samples[lo - 1];
  return Math.abs(best.ts - ts) <= 10_000 ? best.bpm : null;
}
