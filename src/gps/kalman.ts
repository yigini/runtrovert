/**
 * GPS smoothing for a runner.
 *
 * Three layers, applied in order to every raw fix:
 *  1. Gate: drop fixes with poor reported accuracy or stale timestamps.
 *  2. Outlier rejection: drop fixes that imply impossible speed from the last
 *     accepted raw fix (a 40 m teleport in 1 s). Up to five in a row are
 *     dropped, so a multipath jump lasting a few seconds never counts; after
 *     that the fix is believed (you really are over there, say after a tunnel).
 *  3. Kalman filter with position AND velocity per axis (constant-velocity
 *     model, in metres), weighted by the chip's own accuracy estimate.
 *
 * Why velocity: the phone's fused location is already smoothed, so its fixes
 * are wrong in the same direction for a while rather than jumping about. A
 * position-only filter (what this was until Nov 2026) trails 10–20 m behind
 * the runner and cuts every bend: real Garmin tracks replayed through it came
 * out 4–10% short, a 400 m track 4–9% short, city blocks up to 13%. A
 * filter that knows your velocity keeps up on straights and bends.
 *
 * Distance is credited from an anchor: only once the filtered position is a
 * jitter floor away from the last credited point (scaled by accuracy), so
 * standing still at a crossing does not add 60 m of wobble. Bends lose almost
 * nothing to this: a 5 m chord on a 37 m track bend is 0.1% short.
 *
 * npm run test:accuracy checks all of it on known courses and real tracks.
 */

export interface RawFix {
  lat: number;
  lon: number;
  acc: number | null; // metres, horizontal
  alt: number | null;
  speed: number | null; // m/s from the chip, -1 or null when unknown
  ts: number; // epoch ms
}

export interface FilteredFix {
  lat: number;
  lon: number;
  acc: number;
  alt: number | null;
  speed: number; // m/s, our estimate
  ts: number;
  stepM: number; // distance credited for this fix (0 when treated as jitter)
}

export interface FilterOptions {
  maxAccuracyM: number; // reject worse than this
  maxSpeedMps: number; // reject faster than this (runner: ~7.5; elite sprint ~10)
  maxRejectsInARow: number; // after this many impossible fixes, believe the next one
  accelNoise: number; // m²/s³: how sharply we believe a runner changes velocity
  accToSigma: number; // Android accuracy is a 68% radius; per-axis sigma = acc / this
  jitterFloorM: number; // never credit steps smaller than this
  jitterAccFactor: number; // ...or smaller than acc * this
  speedCap: number; // a step may not exceed the chip's own speed × time × this (0 = off)
}

export const DEFAULT_FILTER: FilterOptions = {
  maxAccuracyM: 40,
  maxSpeedMps: 7.5,
  maxRejectsInARow: 5,
  // Tuned with npm run test:accuracy across a 400 m track, out-and-back,
  // city blocks and a winding path, open sky / city / white-noise error, 1 s
  // and 3 s fixes, plus two real Garmin runs. Re-check there before changing.
  accelNoise: 1,
  accToSigma: 1.5,
  jitterFloorM: 5,
  jitterAccFactor: 0.5,
  speedCap: 1.25,
};

/** Velocity is forgotten after a silence this long: you may have turned. */
const VELOCITY_STALE_S = 20;
/** Below this chip speed we take you to be standing. */
const STILL_MPS = 0.5;
const STILL_VAR = 0.3 * 0.3;

const R = 6371000;
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const M_PER_DEG_LAT = 111320;

/** One axis: position and velocity, with their 2×2 covariance. */
class Axis {
  p = 0;
  v = 0;
  p00 = 0;
  p01 = 0;
  p11 = 0;

  init(z: number, r: number) {
    this.p = z;
    this.v = 0;
    this.p00 = r;
    this.p01 = 0;
    this.p11 = 9; // ±3 m/s: we have no idea yet
  }

  forgetVelocity() {
    this.v = 0;
    this.p01 = 0;
    this.p11 = 9;
  }

  predict(dt: number, q: number) {
    this.p += this.v * dt;
    const p00 = this.p00 + dt * 2 * this.p01 + dt * dt * this.p11 + (q * dt ** 3) / 3;
    const p01 = this.p01 + dt * this.p11 + (q * dt * dt) / 2;
    const p11 = this.p11 + q * dt;
    this.p00 = p00;
    this.p01 = p01;
    this.p11 = p11;
  }

  /** A measurement of velocity alone: used for "standing still" from the chip. */
  updateVelocity(z: number, r: number) {
    const s = this.p11 + r;
    const k0 = this.p01 / s;
    const k1 = this.p11 / s;
    const inn = z - this.v;
    this.p += k0 * inn;
    this.v += k1 * inn;
    const p00 = this.p00 - k0 * this.p01;
    const p01 = (1 - k1) * this.p01;
    const p11 = (1 - k1) * this.p11;
    this.p00 = p00;
    this.p01 = p01;
    this.p11 = p11;
  }

  update(z: number, r: number) {
    const s = this.p00 + r;
    const k0 = this.p00 / s;
    const k1 = this.p01 / s;
    const inn = z - this.p;
    this.p += k0 * inn;
    this.v += k1 * inn;
    const p00 = (1 - k0) * this.p00;
    const p01 = (1 - k0) * this.p01;
    const p11 = this.p11 - k1 * this.p01;
    this.p00 = p00;
    this.p01 = p01;
    this.p11 = p11;
  }
}

export class GpsFilter {
  private x = new Axis(); // metres east of origin
  private y = new Axis(); // metres north of origin
  private origin: { lat: number; lon: number; mLon: number } | null = null;
  private lastTs = 0;
  private lastAccepted: FilteredFix | null = null;
  private lastRaw: RawFix | null = null; // last raw fix that passed the gate (for outlier checks)
  private rejectedInARow = 0;
  private opts: FilterOptions;

  constructor(opts: Partial<FilterOptions> = {}) {
    this.opts = { ...DEFAULT_FILTER, ...opts };
  }

  reset() {
    this.origin = null;
    this.lastTs = 0;
    this.lastAccepted = null;
    this.lastRaw = null;
    this.rejectedInARow = 0;
  }

  private toLatLon(): { lat: number; lon: number } {
    const o = this.origin!;
    return { lat: o.lat + this.y.p / M_PER_DEG_LAT, lon: o.lon + this.x.p / o.mLon };
  }

  /** Where the filter thinks we are, if anywhere. */
  get current(): { lat: number; lon: number; acc: number } | null {
    if (!this.origin) return null;
    return { ...this.toLatLon(), acc: Math.sqrt((this.x.p00 + this.y.p00) / 2) * this.opts.accToSigma };
  }

  /**
   * Feed one raw fix. Returns the filtered fix to record, or null if the fix
   * was dropped.
   */
  push(raw: RawFix): FilteredFix | null {
    const acc = raw.acc == null || raw.acc <= 0 ? this.opts.maxAccuracyM : raw.acc;
    if (acc > this.opts.maxAccuracyM) return null;
    if (raw.ts <= this.lastTs) return null; // out of order / duplicate

    // --- outlier rejection: raw against the previous raw, so the filter's lag
    // never makes an honest fix look like a teleport ---
    if (this.lastRaw) {
      const dt = (raw.ts - this.lastRaw.ts) / 1000;
      const d = haversineM(this.lastRaw.lat, this.lastRaw.lon, raw.lat, raw.lon);
      const prevAcc = this.lastRaw.acc == null || this.lastRaw.acc <= 0 ? this.opts.maxAccuracyM : this.lastRaw.acc;
      const slack = prevAcc + acc; // both points' uncertainty
      const impliedSpeed = Math.max(0, d - slack) / Math.max(dt, 0.5);
      if (impliedSpeed > this.opts.maxSpeedMps && this.rejectedInARow < this.opts.maxRejectsInARow) {
        this.rejectedInARow++;
        return null;
      }
    }
    this.rejectedInARow = 0;
    this.lastRaw = raw;

    // --- Kalman update, in metres around the first fix ---
    const sigma = acc / this.opts.accToSigma;
    const r = sigma * sigma;
    if (!this.origin) {
      this.origin = { lat: raw.lat, lon: raw.lon, mLon: M_PER_DEG_LAT * Math.cos((raw.lat * Math.PI) / 180) };
      this.x.init(0, r);
      this.y.init(0, r);
    } else {
      const zx = (raw.lon - this.origin.lon) * this.origin.mLon;
      const zy = (raw.lat - this.origin.lat) * M_PER_DEG_LAT;
      const dt = (raw.ts - this.lastTs) / 1000;
      if (dt > VELOCITY_STALE_S) {
        this.x.forgetVelocity();
        this.y.forgetVelocity();
      }
      this.x.predict(dt, this.opts.accelNoise);
      this.y.predict(dt, this.opts.accelNoise);
      this.x.update(zx, r);
      this.y.update(zy, r);
      // The chip says you're standing still (its Doppler speed is good at
      // this): hold the velocity at zero so the position doesn't drift off.
      if (raw.speed != null && raw.speed >= 0 && raw.speed < STILL_MPS) {
        this.x.updateVelocity(0, STILL_VAR);
        this.y.updateVelocity(0, STILL_VAR);
      }
    }
    this.lastTs = raw.ts;

    const { lat, lon } = this.toLatLon();
    const filteredAcc = Math.sqrt((this.x.p00 + this.y.p00) / 2) * this.opts.accToSigma;
    let stepM = 0;
    let speed = raw.speed != null && raw.speed >= 0 ? raw.speed : Math.hypot(this.x.v, this.y.v);

    if (this.lastAccepted) {
      const d = haversineM(this.lastAccepted.lat, this.lastAccepted.lon, lat, lon);
      const floor = Math.max(this.opts.jitterFloorM, this.opts.jitterAccFactor * acc);
      if (d >= floor) stepM = d;
      // The chip's speed comes from the Doppler shift of the satellite signals,
      // not from positions, so position noise doesn't touch it. A step longer
      // than that speed allows is wobble: credit only what the speed allows.
      const dtA = (raw.ts - this.lastAccepted.ts) / 1000;
      if (stepM > 0 && this.opts.speedCap > 0 && raw.speed != null && raw.speed >= 0.5 && dtA > 0) {
        stepM = Math.min(stepM, raw.speed * dtA * this.opts.speedCap + 1);
      }
      // If the chip says we're basically still, don't credit the wobble: GPS
      // drifts a few metres while you stand. Only a clear move counts (and a
      // phone that wrongly reports 0 speed still gets the distance, in one
      // step, once the move is clear).
      if (raw.speed != null && raw.speed >= 0 && raw.speed < STILL_MPS && d < Math.max(2 * acc, 10)) stepM = 0;
    }

    const out: FilteredFix = { lat, lon, acc: filteredAcc, alt: raw.alt, speed, ts: raw.ts, stepM };
    // Only advance the "last accepted" anchor when we actually moved; otherwise
    // jitter would creep the anchor and under-count the next real step.
    if (stepM > 0 || !this.lastAccepted) this.lastAccepted = out;
    return out;
  }
}
