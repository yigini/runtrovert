/**
 * Run aids, the pure part: when a pace or heart-rate alert is due, when an
 * interval voice cue is due, what it says, and the sums a treadmill run needs.
 * No React Native here, so npm run test:aids can check every rule.
 *
 * The glue (src/runCues.ts) feeds these from the tracking tick.
 */

// ---- Settings shapes ----------------------------------------------------------

/** When the voice speaks: at each km or mile (as before), each half, or every 5 or 10 minutes. */
export type VoiceEvery = 'split' | 'half' | 'min5' | 'min10';

/** What the voice says. 'pace' is the pace of the stretch just run (the km, the half, the 5 minutes). */
export type VoiceField = 'distance' | 'pace' | 'avg' | 'time' | 'heart';

export const VOICE_FIELDS: VoiceField[] = ['distance', 'pace', 'avg', 'time', 'heart'];

/** The sentence every build before this one said: "3 kilometres. 5 40 per kilometre. 17 05 total." */
export const DEFAULT_VOICE_SAYS: VoiceField[] = ['distance', 'pace', 'time'];

/** Seconds per km, always kilometres underneath; the screen shows the runner's unit. fastS < slowS. */
export interface PaceAlert {
  on: boolean;
  fastS: number;
  slowS: number;
}

export interface HeartAlert {
  on: boolean;
  low: number;
  high: number;
}

export const DEFAULT_PACE_ALERT: PaceAlert = { on: false, fastS: 300, slowS: 390 }; // 5:00–6:30 /km
export const DEFAULT_HEART_ALERT: HeartAlert = { on: false, low: 120, high: 160 };

export const PACE_LIMITS = { min: 150, max: 900, step: 5 }; // 2:30–15:00 per km
export const HEART_LIMITS = { min: 60, max: 210, step: 5 };

/** Keep a pace range sane: inside the limits, and at least 10 s wide. */
export function cleanPace(a: PaceAlert): PaceAlert {
  const clamp = (v: number) => Math.min(PACE_LIMITS.max, Math.max(PACE_LIMITS.min, Math.round(v)));
  let fastS = clamp(a.fastS);
  let slowS = clamp(a.slowS);
  if (slowS - fastS < 10) {
    if (fastS + 10 <= PACE_LIMITS.max) slowS = fastS + 10;
    else fastS = slowS - 10;
  }
  return { on: !!a.on, fastS, slowS };
}

export function cleanHeart(a: HeartAlert): HeartAlert {
  const clamp = (v: number) => Math.min(HEART_LIMITS.max, Math.max(HEART_LIMITS.min, Math.round(v)));
  let low = clamp(a.low);
  let high = clamp(a.high);
  if (high - low < 10) {
    if (low + 10 <= HEART_LIMITS.max) high = low + 10;
    else low = high - 10;
  }
  return { on: !!a.on, low, high };
}

/** The fields in the order they are spoken, whatever order they were ticked in. Empty means the default. */
export function spokenFields(says: VoiceField[] | null | undefined): VoiceField[] {
  const picked = VOICE_FIELDS.filter((f) => says?.includes(f));
  return picked.length ? picked : DEFAULT_VOICE_SAYS;
}

export function isDefaultVoice(every: VoiceEvery, says: VoiceField[]): boolean {
  const f = spokenFields(says);
  return every === 'split' && f.length === DEFAULT_VOICE_SAYS.length && f.every((x, i) => x === DEFAULT_VOICE_SAYS[i]);
}

// ---- Alerts ------------------------------------------------------------------

export type Side = 'below' | 'above';

/** Out of range for this long before a word: a hill or a crossing is not a reason to talk. */
export const ALERT_HOLD_MS = 20_000;
/** Still out of range: say it again at most this often. */
export const ALERT_REPEAT_MS = 120_000;
/** No pace alerts in the first minutes: everyone starts a bit off. */
export const ALERT_WARMUP_S = 90;

/**
 * One range, one value at a time. Says 'below' or 'above' once the value has
 * been out of range for ALERT_HOLD_MS, then stays quiet for ALERT_REPEAT_MS.
 * Coming back inside says nothing and starts the wait again.
 */
export class RangeWatch {
  private side: Side | null = null;
  private outSince = 0;
  private lastFired = -Infinity;

  private holdMs: number;
  private repeatMs: number;

  constructor(holdMs = ALERT_HOLD_MS, repeatMs = ALERT_REPEAT_MS) {
    this.holdMs = holdMs;
    this.repeatMs = repeatMs;
  }

  reset() {
    this.side = null;
    this.outSince = 0;
  }

  /** Back to a fresh run: the quiet period is forgotten too. */
  clear() {
    this.reset();
    this.lastFired = -Infinity;
  }

  push(value: number | null, ts: number, low: number, high: number): Side | null {
    if (value == null || !isFinite(value)) {
      this.reset();
      return null;
    }
    const side: Side | null = value < low ? 'below' : value > high ? 'above' : null;
    if (!side) {
      this.reset();
      return null;
    }
    if (side !== this.side) {
      this.side = side;
      this.outSince = ts;
      return null;
    }
    if (ts - this.outSince < this.holdMs) return null;
    if (ts - this.lastFired < this.repeatMs) return null;
    this.lastFired = ts;
    return side;
  }
}

/**
 * The pace of the last stretch, from the run's own distance and clock, not
 * the GPS speed (which jumps about). Samples are kept for WINDOW_MS; the
 * pace needs at least MIN_M and MIN_S of running inside it.
 */
export class PaceWindow {
  static WINDOW_MS = 40_000;
  static MIN_M = 40;
  static MIN_S = 15;
  private samples: Array<{ ts: number; d: number; t: number }> = [];

  reset() {
    this.samples = [];
  }

  push(ts: number, distanceM: number, durationS: number) {
    this.samples.push({ ts, d: distanceM, t: durationS });
    while (this.samples.length && ts - this.samples[0].ts > PaceWindow.WINDOW_MS) this.samples.shift();
  }

  /** Seconds per km over the window, or null while there is too little to tell. */
  secPerKm(): number | null {
    if (this.samples.length < 2) return null;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dm = b.d - a.d;
    const dt = b.t - a.t;
    if (dm < PaceWindow.MIN_M || dt < PaceWindow.MIN_S) return null;
    return (dt / dm) * 1000;
  }
}

// ---- Interval voice cues -----------------------------------------------------------

export interface CueMark {
  distanceM: number;
  durationS: number;
}

/**
 * Is a timed or half-unit cue due? Returns the new mark when it is, else null.
 * 'split' is spoken from the split itself, so it never comes due here.
 * A mark only moves forward by whole intervals, so a slow tick never skips one
 * and a long stop never makes a burst of them (one cue, then the next interval).
 */
export function intervalDue(every: VoiceEvery, mark: CueMark, distanceM: number, durationS: number, unitM: number): CueMark | null {
  if (every === 'split') return null;
  if (every === 'half') {
    const step = unitM / 2;
    if (distanceM - mark.distanceM < step) return null;
    const n = Math.floor((distanceM - mark.distanceM) / step);
    return { distanceM: mark.distanceM + n * step, durationS };
  }
  const step = every === 'min5' ? 300 : 600;
  if (durationS - mark.durationS < step) return null;
  const n = Math.floor((durationS - mark.durationS) / step);
  return { distanceM, durationS: mark.durationS + n * step };
}

/** Pace of a stretch in seconds per unit, or null when it is too short to mean anything. */
export function stretchPace(fromM: number, fromS: number, toM: number, toS: number, unitM: number): number | null {
  const dm = toM - fromM;
  const dt = toS - fromS;
  if (dm < 20 || dt <= 0) return null;
  return (dt / dm) * unitM;
}

// ---- Treadmill ---------------------------------------------------------------

/** Where learned strides are kept (db settings table): { outdoor, treadmill } in metres. */
export const STRIDE_KEY = 'stride';
/** Treadmill runs, by id: { steps, strideM }. In the settings table, so a backup carries it. */
export const INDOOR_KEY = 'indoorRuns';

/** Used before any run has calibrated a stride, outdoors or on a treadmill. */
export const TREADMILL_DEFAULT_STRIDE_M = 0.95;

/** The stride a treadmill run uses: one learned on a treadmill, else the outdoor one GPS measured, else the default. */
export function treadmillStride(learned: { treadmill?: number | null; outdoor?: number | null } | null): number {
  const ok = (s: number | null | undefined) => typeof s === 'number' && s > 0.4 && s < 2;
  if (ok(learned?.treadmill)) return learned!.treadmill!;
  if (ok(learned?.outdoor)) return learned!.outdoor!;
  return TREADMILL_DEFAULT_STRIDE_M;
}

/**
 * The runner typed what the treadmill said: the stride that would have given
 * it. null when there were too few steps to learn from or the answer is far
 * outside a human stride (a typo, a walk in the wrong unit).
 */
export function learnStride(steps: number, trueDistanceM: number): number | null {
  if (steps < 300 || trueDistanceM <= 0) return null;
  const s = trueDistanceM / steps;
  return s > 0.4 && s < 2 ? Math.round(s * 1000) / 1000 : null;
}

/**
 * New steps from a step watch that may restart from zero (Android hands a new
 * count after the app comes back). Returns the steps to credit and the new last value.
 */
export function stepDelta(last: number, now: number): { add: number; last: number } {
  if (now < last) return { add: Math.max(0, now), last: now };
  return { add: now - last, last: now };
}

export interface KmSplitRow {
  index: number;
  distanceM: number;
  durationS: number;
  atDistanceM: number;
  atDurationS: number;
}

/**
 * The treadmill said a different distance than the steps did. The km splits
 * were closed on the step distance; redraw them on the true one. The run's
 * clock at each old split is known, so true distance is taken as growing in
 * the same shape (scaled), and new splits close where it crosses each unit.
 * Rounded to whole metres and tenths of a second.
 */
export function rescaleSplits(splits: KmSplitRow[], stepDistanceM: number, trueDistanceM: number, totalDurationS: number, unitM: number): KmSplitRow[] {
  if (trueDistanceM <= 0 || totalDurationS <= 0) return [];
  // No steps at all (no step counter): an even pace is all there is to go on.
  const k = stepDistanceM > 0 ? trueDistanceM / stepDistanceM : 0;
  // Known points of (clock, true distance), in order.
  const pts: Array<[number, number]> = [[0, 0]];
  if (k > 0) for (const s of [...splits].sort((a, b) => a.atDurationS - b.atDurationS)) if (s.atDurationS < totalDurationS) pts.push([s.atDurationS, s.atDistanceM * k]);
  pts.push([totalDurationS, trueDistanceM]);
  const out: KmSplitRow[] = [];
  let prevT = 0;
  for (let n = 1; n * unitM <= trueDistanceM + 1e-6; n++) {
    const target = n * unitM;
    let t = totalDurationS;
    for (let i = 1; i < pts.length; i++) {
      const [t0, d0] = pts[i - 1];
      const [t1, d1] = pts[i];
      if (d1 >= target) {
        t = d1 === d0 ? t1 : t0 + ((target - d0) / (d1 - d0)) * (t1 - t0);
        break;
      }
    }
    t = Math.round(t * 10) / 10;
    out.push({ index: n, distanceM: unitM, durationS: Math.round((t - prevT) * 10) / 10, atDistanceM: Math.round(target), atDurationS: t });
    prevT = t;
  }
  return out;
}
