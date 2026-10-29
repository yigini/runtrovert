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
 * When GPS goes quiet for more than GAP_S we credit steps × stride instead,
 * and reconcile with GPS when it comes back (see gapFill.ts).
 * expo-sensors only delivers steps in the foreground on Android; on iOS we
 * can query the step count for the gap window afterwards.
 */
import { Barometer, Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';
import { GapFill } from './gapFill';

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

/** The pedometer side of GapFill: feeds it steps, asks iOS for missed ones. */
export class StepFusion {
  private sub: { remove: () => void } | null = null;
  private available = false;
  readonly gap = new GapFill();

  async start() {
    this.stop(); // never two listeners
    // A fresh watch counts from zero again.
    this.gap.restartSteps();
    try {
      this.available = await Pedometer.isAvailableAsync();
      if (!this.available) return;
      // Android asks for "physical activity". Without it, no step fill: GPS alone, no error.
      const perm = await Pedometer.getPermissionsAsync();
      if (!perm.granted) {
        this.available = false;
        return;
      }
      this.sub = Pedometer.watchStepCount((r) => this.gap.setSteps(r.steps));
    } catch {
      this.available = false;
    }
  }

  /**
   * Call once a second while running. If GPS has been quiet, credit steps.
   * Returns metres to add (0 most of the time). When it returns more than 0
   * for a new gap, gap.gapOpen turns true.
   */
  async tick(now: number): Promise<number> {
    if (!this.available || !this.gap.due(now)) return 0;
    let steps = this.gap.pendingSteps;
    if (Platform.OS === 'ios' && steps <= 0) {
      try {
        const r = await Pedometer.getStepCountAsync(new Date(this.gap.windowStart), new Date(now));
        steps = r.steps;
      } catch {
        steps = 0;
      }
    }
    return this.gap.fill(now, steps);
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }

  reset() {
    this.gap.reset();
  }

  get filledM() {
    return this.gap.filledM;
  }

  get stride() {
    return this.gap.stride;
  }
}
