/**
 * Sensor fusion helpers.
 *
 * Barometer → elevation gain. GPS altitude wanders ±10 m; pressure doesn't.
 * We convert pressure to relative altitude with the barometric formula, smooth
 * it, and count only climbs above a threshold. On iOS the OS hands us
 * relativeAltitude directly.
 *
 * Pedometer → distance during GPS dropouts (tunnels, dense trees, underpass).
 * While GPS is healthy we calibrate stride length = gpsDistance / steps.
 * When GPS goes quiet for more than GAP_S we credit steps × stride instead.
 * expo-sensors only delivers steps in the foreground on Android; on iOS we
 * can query the step count for the gap window afterwards.
 */
import { Barometer, Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

const ELEV_THRESHOLD_M = 2.0;
const ELEV_SMOOTH = 0.25; // EMA factor on altitude

export class ElevationTracker {
  private sub: { remove: () => void } | null = null;
  private available = false;
  private baroAlt: number | null = null; // smoothed relative altitude
  private ref: number | null = null; // reference for threshold counting
  private gpsRef: number | null = null;
  gainM = 0;

  async start() {
    this.stop(); // never two listeners
    try {
      this.available = await Barometer.isAvailableAsync();
      if (!this.available) return;
      Barometer.setUpdateInterval(1000);
      this.sub = Barometer.addListener((m) => {
        const alt = m.relativeAltitude != null ? m.relativeAltitude : pressureToAltitude(m.pressure);
        this.baroAlt = this.baroAlt == null ? alt : this.baroAlt + ELEV_SMOOTH * (alt - this.baroAlt);
        this.step(this.baroAlt);
      });
    } catch {
      this.available = false;
    }
  }

  /** GPS altitude fallback, used only when no barometer. */
  pushGpsAltitude(alt: number | null) {
    if (this.available || alt == null || !isFinite(alt)) return;
    this.gpsRef = this.gpsRef == null ? alt : this.gpsRef + ELEV_SMOOTH * (alt - this.gpsRef);
    this.step(this.gpsRef, 2.5);
  }

  private step(alt: number, threshold = ELEV_THRESHOLD_M) {
    if (this.ref == null) {
      this.ref = alt;
      return;
    }
    const diff = alt - this.ref;
    if (diff >= threshold) {
      this.gainM += diff;
      this.ref = alt;
    } else if (diff <= -threshold) {
      this.ref = alt;
    }
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }

  reset() {
    this.gainM = 0;
    this.baroAlt = null;
    this.ref = null;
    this.gpsRef = null;
  }

  get source(): 'barometer' | 'gps' {
    return this.available ? 'barometer' : 'gps';
  }
}

function pressureToAltitude(hPa: number): number {
  // International barometric formula, relative to sea-level standard pressure.
  return 44330 * (1 - Math.pow(hPa / 1013.25, 1 / 5.255));
}

const GAP_S = 8; // GPS silent this long → fill from steps
const DEFAULT_STRIDE_M = 0.95;

export class StepFusion {
  private sub: { remove: () => void } | null = null;
  private available = false;
  private stepsSinceStart = 0;
  private stepsAtLastGps = 0;
  private lastGpsTs = 0;
  private strideM = DEFAULT_STRIDE_M;
  private calibDist = 0;
  private calibSteps = 0;
  private startedAt = 0;
  filledM = 0; // distance credited from steps

  async start() {
    this.stop(); // never two listeners
    this.startedAt = Date.now();
    // A fresh watch counts from zero again.
    this.stepsSinceStart = 0;
    this.stepsAtLastGps = 0;
    try {
      this.available = await Pedometer.isAvailableAsync();
      if (!this.available) return;
      // Android asks for "physical activity". Without it, no step fill: GPS alone, no error.
      const perm = await Pedometer.getPermissionsAsync();
      if (!perm.granted) {
        this.available = false;
        return;
      }
      this.sub = Pedometer.watchStepCount((r) => {
        this.stepsSinceStart = r.steps;
      });
    } catch {
      this.available = false;
    }
  }

  /** Call for every accepted GPS step so stride length stays calibrated. */
  onGpsStep(stepM: number, ts: number) {
    if (!this.available) return;
    const steps = this.stepsSinceStart - this.stepsAtLastGps;
    if (steps > 0 && stepM > 0) {
      this.calibDist += stepM;
      this.calibSteps += steps;
      if (this.calibSteps > 200) {
        const s = this.calibDist / this.calibSteps;
        if (s > 0.5 && s < 1.6) this.strideM = s;
      }
    }
    this.stepsAtLastGps = this.stepsSinceStart;
    this.lastGpsTs = ts;
  }

  /**
   * Call once a second while running. If GPS has been quiet, credit steps.
   * Returns metres to add (0 most of the time).
   */
  async tick(now: number): Promise<number> {
    if (!this.available || !this.lastGpsTs) return 0;
    if ((now - this.lastGpsTs) / 1000 < GAP_S) return 0;
    let steps = this.stepsSinceStart - this.stepsAtLastGps;
    if (Platform.OS === 'ios' && steps <= 0) {
      try {
        const r = await Pedometer.getStepCountAsync(new Date(this.lastGpsTs), new Date(now));
        steps = r.steps;
      } catch {
        steps = 0;
      }
    }
    if (steps <= 0) return 0;
    const m = steps * this.strideM;
    this.filledM += m;
    this.stepsAtLastGps = this.stepsSinceStart;
    this.lastGpsTs = now; // so we only credit each gap window once
    return m;
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }

  reset() {
    this.stepsSinceStart = 0;
    this.stepsAtLastGps = 0;
    this.lastGpsTs = 0;
    this.calibDist = 0;
    this.calibSteps = 0;
    this.filledM = 0;
  }

  get stride() {
    return this.strideM;
  }
}
