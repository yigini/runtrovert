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
