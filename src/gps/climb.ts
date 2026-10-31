/**
 * Climb counting, without the sensors (so it runs in plain Node tests).
 *
 * Altitude is smoothed over time, then only counted once it has risen a
 * threshold above the last low point (hysteresis), so wobble going up and
 * down by a metre never adds up to a hill.
 *
 * Barometer: pressure barely wobbles (±0.5 m), so a light smoothing and a 2 m
 * threshold read a real hill within about 10% and a flat run as flat.
 *
 * GPS altitude (phones without a barometer): it wanders ±5–10 m and drifts
 * slowly, which looks exactly like small hills. Until Nov 2026 it was treated
 * almost like the barometer and a flat 5 km could show 100–300 m of climb.
 * Now it is smoothed over ~20 s and needs 6 m to count. It still reads
 * real hills about 20% low and can add a few tens of metres on a flat run:
 * GPS height is the weakest number a phone gives. npm run test:accuracy.
 */

export interface ClimbRule {
  tauS: number; // smoothing time constant
  thresholdM: number;
  followLow?: boolean; // the base follows every new low, so a climb counts from the very bottom
  /** Faster than this (m/s, plus 1 m) between two readings is a jump in the sensor, not you: it's ignored. */
  maxRateMps?: number;
}

export const BARO_RULE: ClimbRule = { tauS: 3.5, thresholdM: 2, followLow: true, maxRateMps: 2 };
export const GPS_RULE: ClimbRule = { tauS: 20, thresholdM: 6 };

const MEDIAN_OF = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class ClimbCounter {
  private smooth: number | null = null;
  private lastTs = 0;
  private ref: number | null = null;
  private recent: number[] = []; // last few raw readings, for the median
  private lastRaw: { alt: number; ts: number } | null = null;
  private offset = 0; // sum of sensor jumps taken out
  gainM = 0;
  private rule: ClimbRule;

  constructor(rule: ClimbRule) {
    this.rule = rule;
  }

  /** One altitude reading at `ts` (epoch ms). */
  push(alt: number, ts: number) {
    if (!isFinite(alt)) return;
    if (this.rule.maxRateMps != null && this.lastRaw && ts > this.lastRaw.ts) {
      const dt = (ts - this.lastRaw.ts) / 1000;
      const jump = alt - this.lastRaw.alt;
      if (Math.abs(jump) > this.rule.maxRateMps * dt + 1) this.offset += jump;
    }
    this.lastRaw = { alt, ts };
    alt -= this.offset;
    // A median of the last five first: one wild reading (a pressure gust, a
    // GPS height jump) can't drag the smoothing up and back as a hill.
    this.recent.push(alt);
    if (this.recent.length > MEDIAN_OF) this.recent.shift();
    alt = median(this.recent);
    if (this.smooth == null || ts <= this.lastTs) {
      if (this.smooth == null) this.smooth = alt;
    } else {
      const a = 1 - Math.exp(-(ts - this.lastTs) / 1000 / this.rule.tauS);
      this.smooth += a * (alt - this.smooth);
    }
    this.lastTs = Math.max(this.lastTs, ts);
    const s = this.smooth;
    if (this.ref == null) {
      this.ref = s;
      return;
    }
    const diff = s - this.ref;
    if (diff >= this.rule.thresholdM) {
      this.gainM += diff;
      this.ref = s;
    } else if (diff <= -this.rule.thresholdM || (this.rule.followLow && diff < 0)) {
      this.ref = s;
    }
  }

  reset() {
    this.recent = [];
    this.lastRaw = null;
    this.offset = 0;
    this.smooth = null;
    this.lastTs = 0;
    this.ref = null;
    this.gainM = 0;
  }
}
