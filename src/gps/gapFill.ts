/**
 * Pedometer gap fill, without the sensors (so it runs in plain Node tests).
 *
 * While GPS is healthy, stride length is calibrated as gpsDistance / steps.
 * When GPS goes quiet for more than GAP_S, steps × stride are credited instead.
 *
 * The catch is the way back. Left alone, the GPS filter would measure from the
 * last point before the gap to the first one after it, and that straight line
 * covers the ground the steps just did: the gap counted twice. So the first
 * fill opens a gap: the caller resets the filter (no bridging line), and the
 * first accepted fix after it closes the gap, crediting only the part of the
 * straight line the steps didn't already cover. Over a gap the run gets
 * max(steps estimate, straight line), never their sum.
 */
import { haversineM } from './kalman';

export const GAP_S = 8; // GPS silent this long → fill from steps
export const DEFAULT_STRIDE_M = 0.95;
const CALIBRATE_AFTER_STEPS = 200;

export interface GapFix {
  lat: number;
  lon: number;
  ts: number;
  stepM: number; // what the filter credited for this fix
}

export class GapFill {
  private stepsTotal = 0; // as reported by the step watch since it started
  private stepsAtLastGps = 0;
  private lastGpsTs = 0;
  private strideM = DEFAULT_STRIDE_M;
  private calibDist = 0;
  private calibSteps = 0;
  private anchor: { lat: number; lon: number } | null = null; // last credited GPS point
  private openFillM = 0; // filled since GPS went quiet; >0 = a gap is open
  filledM = 0; // distance credited from steps over the run

  /** A fresh step watch counts from zero again. */
  restartSteps() {
    this.stepsTotal = 0;
    this.stepsAtLastGps = 0;
  }

  /** Running step total from the pedometer watch. */
  setSteps(total: number) {
    this.stepsTotal = total;
  }

  get gapOpen(): boolean {
    return this.openFillM > 0;
  }

  /**
   * Every fix the GPS filter accepted while running. Returns the metres the
   * run should credit for it: the filter's step normally, and on the first fix
   * after a filled gap only what the steps left uncovered.
   */
  onFix(fix: GapFix): number {
    if (this.openFillM > 0) {
      const line = this.anchor ? haversineM(this.anchor.lat, this.anchor.lon, fix.lat, fix.lon) : 0;
      const credit = Math.max(0, line - this.openFillM);
      this.openFillM = 0;
      this.mark(fix);
      return credit;
    }
    if (fix.stepM > 0) {
      // A straight line under a curve never feeds calibration, so only
      // ordinary steps do.
      const steps = this.stepsTotal - this.stepsAtLastGps;
      if (steps > 0) {
        this.calibDist += fix.stepM;
        this.calibSteps += steps;
        if (this.calibSteps > CALIBRATE_AFTER_STEPS) {
          const s = this.calibDist / this.calibSteps;
          if (s > 0.5 && s < 1.6) this.strideM = s;
        }
      }
      this.mark(fix);
    } else if (!this.anchor) {
      this.anchor = { lat: fix.lat, lon: fix.lon };
      if (!this.lastGpsTs) this.lastGpsTs = fix.ts;
    }
    return fix.stepM;
  }

  private mark(fix: GapFix) {
    this.anchor = { lat: fix.lat, lon: fix.lon };
    this.stepsAtLastGps = this.stepsTotal;
    this.lastGpsTs = fix.ts;
  }

  /** True when GPS has been quiet long enough to fill from steps. */
  due(now: number): boolean {
    return this.lastGpsTs > 0 && (now - this.lastGpsTs) / 1000 >= GAP_S;
  }

  /** Steps the watch counted since the last GPS step or fill. */
  get pendingSteps(): number {
    return this.stepsTotal - this.stepsAtLastGps;
  }

  /** Where the current gap window starts (for a step-count query on iOS). */
  get windowStart(): number {
    return this.lastGpsTs;
  }

  /**
   * Credit `steps` for the window ending at `now`. Returns metres to add.
   * The first fill opens a gap: the caller must then reset its GPS filter so
   * the fix that ends the gap isn't measured from before it.
   */
  fill(now: number, steps: number): number {
    if (steps <= 0) return 0;
    const m = steps * this.strideM;
    this.filledM += m;
    this.openFillM += m;
    this.stepsAtLastGps = this.stepsTotal;
    this.lastGpsTs = now; // so each window is credited once
    return m;
  }

  /** Paused or resumed: the next fix starts afresh, nothing is bridged, and steps taken meanwhile don't count. */
  breakTrack(now: number) {
    this.anchor = null;
    this.openFillM = 0;
    this.lastGpsTs = now;
    this.stepsAtLastGps = this.stepsTotal;
  }

  reset() {
    this.restartSteps();
    this.lastGpsTs = 0;
    this.calibDist = 0;
    this.calibSteps = 0;
    this.anchor = null;
    this.openFillM = 0;
    this.filledM = 0;
  }

  get stride() {
    return this.strideM;
  }
}
