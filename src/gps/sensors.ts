/**
 * Sensor fusion helpers.
 *
 * Barometer → elevation gain. GPS altitude wanders ±10 m; pressure doesn't.
 * We convert pressure to relative altitude with the barometric formula and
 * hand it to ClimbCounter (climb.ts: smoothing, threshold, jump guard). On
 * iOS the OS hands us relativeAltitude directly.
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
import { BARO_RULE, ClimbCounter, GPS_RULE } from './climb';
import { GapFill } from './gapFill';
import { stepDelta } from '../runAids';

export class ElevationTracker {
  private sub: { remove: () => void } | null = null;
  private available = false;
  private baro = new ClimbCounter(BARO_RULE);
  private gps = new ClimbCounter(GPS_RULE);
  private restored = 0; // climb carried over from before a restart

  async start() {
    this.stop(); // never two listeners
    try {
      this.available = await Barometer.isAvailableAsync();
      if (!this.available) return;
      Barometer.setUpdateInterval(1000);
      this.sub = Barometer.addListener((m) => {
        const alt = m.relativeAltitude != null ? m.relativeAltitude : pressureToAltitude(m.pressure);
        this.baro.push(alt, Date.now());
      });
    } catch {
      this.available = false;
    }
  }

  /** GPS altitude fallback, used only when no barometer. */
  pushGpsAltitude(alt: number | null, ts: number) {
    if (this.available || alt == null || !isFinite(alt)) return;
    this.gps.push(alt, ts);
  }

  get gainM(): number {
    return this.restored + this.baro.gainM + this.gps.gainM;
  }

  /** Recovery: the climb so far, from the snapshot. */
  set gainM(m: number) {
    this.restored = m - this.baro.gainM - this.gps.gainM;
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }

  reset() {
    this.baro.reset();
    this.gps.reset();
    this.restored = 0;
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

  get calibrated() {
    return this.gap.calibrated;
  }
}

/**
 * Treadmill runs: the step watch alone, no GPS. take() hands over the steps
 * counted since it was last called; the tracker credits them while running
 * and drops them while paused. A watch that restarts from zero (Android, after
 * the app comes back) is caught by stepDelta.
 */
export class IndoorSteps {
  private sub: { remove: () => void } | null = null;
  private reported = 0;
  private last = 0;
  available = false;

  async start() {
    this.stop();
    this.reported = 0;
    this.last = 0;
    try {
      this.available = await Pedometer.isAvailableAsync();
      if (!this.available) return;
      const perm = await Pedometer.getPermissionsAsync();
      if (!perm.granted) {
        this.available = false;
        return;
      }
      this.sub = Pedometer.watchStepCount((r) => {
        this.reported = r.steps;
      });
    } catch {
      this.available = false;
    }
  }

  take(): number {
    const d = stepDelta(this.last, this.reported);
    this.last = d.last;
    return d.add;
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }
}
