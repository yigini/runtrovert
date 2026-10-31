/**
 * Courses with a known true length, and GPS error models that look like what
 * an Android phone actually hands an app (the fused location provider), for
 * npm run test:accuracy. Deterministic: the same seed gives the same run.
 *
 * Why not just white noise: a phone's fix error is mostly slow drift (the
 * chip already smooths), so consecutive fixes are wrong in the same direction.
 * White noise alone makes naive distance look 80% too long and rewards a
 * filter that smooths far too hard. Both are tested here.
 */
import type { RawFix } from '../../src/gps/kalman.ts';

export const LAT0 = 45.46;
export const LON0 = 9.19;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
export const T0 = 1_800_000_000_000;

export interface Pt {
  x: number; // metres east
  y: number; // metres north
  z: number; // metres up
}

export interface Course {
  name: string;
  lengthM: number;
  gainM: number; // true climb
  at(s: number): Pt; // position s metres along
}

export function toLatLon(p: { x: number; y: number }) {
  return { lat: LAT0 + p.y / M_LAT, lon: LON0 + p.x / M_LON };
}
export function toXY(lat: number, lon: number) {
  return { x: (lon - LON0) * M_LON, y: (lat - LAT0) * M_LAT };
}

/** A polyline course; with `laps` it goes round that many times. */
function polyline(name: string, pts: Array<[number, number]>, opts: { laps?: number; z?: (s: number) => number; gainM?: number } = {}): Course {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const one = cum[cum.length - 1];
  const laps = opts.laps ?? 1;
  return {
    name,
    lengthM: one * laps,
    gainM: opts.gainM ?? 0,
    at(s: number) {
      const total = s;
      let r = Math.min(s, one * laps);
      r = laps > 1 ? r % one : r;
      if (laps > 1 && s >= one * laps) r = one;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < r) i++;
      const f = (r - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return { x: pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), y: pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]), z: opts.z ? opts.z(Math.min(total, one * laps)) : 0 };
    },
  };
}

/** Lane 1 of a standard 400 m track: two 84.39 m straights, bends measured 0.30 m out from a 36.50 m kerb. */
export function track400(laps = 12.5): Course {
  const straight = 84.39;
  const r = 36.5 + 0.3;
  const pts: Array<[number, number]> = [];
  const n = 200;
  pts.push([0, -r]);
  pts.push([straight, -r]);
  for (let i = 1; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push([straight + r * Math.cos(a), r * Math.sin(a)]);
  }
  pts.push([0, r]);
  for (let i = 1; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polyline(`400 m track, ${laps} laps`, pts, { laps });
}

/** Flat and straight 2.5 km out, turn on the spot, 2.5 km back. */
export function outAndBack(): Course {
  return polyline('flat out-and-back 5 km', [
    [0, 0],
    [2500, 0],
    [2500, 0.01],
    [0, 0.01],
  ]);
}

/** City blocks: a staircase of 100 m streets with a 90° corner at every one. */
export function cityBlocks(): Course {
  const pts: Array<[number, number]> = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 50; i++) {
    if (i % 2 === 0) x += 100;
    else y += 100;
    pts.push([x, y]);
  }
  return polyline('city blocks, corner every 100 m', pts);
}

/** A winding park path: bends of about 40 m radius all the way. */
export function windingPark(): Course {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 5000; i++) pts.push([i * 0.7, 40 * Math.sin((i * 0.7) / 40)]);
  return polyline('winding park path', pts); // about 4.25 km of bends
}

/** Hilly out-and-back: three 30 m hills out, the same three back. True climb 180 m. */
export function hilly(): Course {
  const half = 2500;
  const hill = (s: number) => {
    const u = s > half ? 2 * half - s : s; // mirror on the way back
    const k = u % 833.33;
    const up = 30 * Math.sin((Math.PI * Math.min(k, 833.33)) / 833.33);
    return up;
  };
  return polyline('hilly out-and-back 5 km, 6 × 30 m hills', [
    [0, 0],
    [half, 0],
    [half, 0.01],
    [0, 0.01],
  ], { z: hill, gainM: 180 });
}

// ---- Noise ------------------------------------------------------------------

export function rng(seed: number) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return { rnd, gauss };
}

export interface NoiseModel {
  name: string;
  driftM: number; // slow error, per axis, 1 sigma
  tauS: number; // how slowly it drifts
  whiteM: number; // fix-to-fix jitter, per axis
  accM: [number, number]; // range the chip reports
  jumpRate?: number; // chance per second of a multipath jump
  altDriftM: number;
  altTauS: number;
  altWhiteM: number;
}

export const OPEN_SKY: NoiseModel = { name: 'open sky', driftM: 2.5, tauS: 30, whiteM: 0.4, accM: [3, 6], altDriftM: 5, altTauS: 60, altWhiteM: 1.5 };
export const CITY: NoiseModel = { name: 'city streets', driftM: 6, tauS: 45, whiteM: 1.0, accM: [8, 16], jumpRate: 0.005, altDriftM: 8, altTauS: 40, altWhiteM: 3 };
export const WHITE: NoiseModel = { name: 'white noise 5 m', driftM: 0, tauS: 1, whiteM: 2.5, accM: [3, 7], altDriftM: 0, altTauS: 1, altWhiteM: 4 };

export interface SimOpts {
  speed?: number; // m/s
  everyS?: number; // seconds between fixes
  stop?: [number, number]; // stand still from t to t (s)
  tunnel?: [number, number]; // no fixes from t to t (s)
  seed?: number;
}

export interface Sim {
  fixes: RawFix[];
  truthAlt: number[]; // per second
  baroAlt: number[]; // per second: what a barometer would say
  durationS: number;
}

export function simulate(c: Course, n: NoiseModel, o: SimOpts = {}): Sim {
  const { rnd, gauss } = rng(o.seed ?? 1);
  const speed = o.speed ?? 3.3;
  const every = o.everyS ?? 1;
  const moveS = c.lengthM / speed;
  const stopS = o.stop ? o.stop[1] - o.stop[0] : 0;
  const T = Math.ceil(moveS + stopS);
  const a = Math.exp(-1 / n.tauS);
  const b = Math.sqrt(1 - a * a);
  const aa = Math.exp(-1 / n.altTauS);
  const ab = Math.sqrt(1 - aa * aa);
  let ex = gauss() * n.driftM;
  let ey = gauss() * n.driftM;
  let ez = gauss() * n.altDriftM;
  let jump: { x: number; y: number; left: number } | null = null;
  let moved = 0;
  let baroBias = 0;
  const fixes: RawFix[] = [];
  const truthAlt: number[] = [];
  const baroAlt: number[] = [];
  for (let t = 0; t <= T; t++) {
    const stopped = !!o.stop && t >= o.stop[0] && t < o.stop[1];
    if (!stopped && t > 0) moved = Math.min(c.lengthM, moved + speed);
    const p = c.at(moved);
    ex = a * ex + b * n.driftM * gauss();
    ey = a * ey + b * n.driftM * gauss();
    ez = aa * ez + ab * n.altDriftM * gauss();
    baroBias += 0.0008 * gauss(); // weather and pocket drift, about ±1 m an hour
    truthAlt.push(p.z);
    baroAlt.push(p.z + baroBias + 0.4 * gauss());
    if (n.jumpRate && !jump && rnd() < n.jumpRate) jump = { x: (gauss() > 0 ? 1 : -1) * (30 + 30 * rnd()), y: (gauss() > 0 ? 1 : -1) * (30 + 30 * rnd()), left: 3 + Math.floor(rnd() * 3) };
    let jx = 0;
    let jy = 0;
    if (jump) {
      jx = jump.x;
      jy = jump.y;
      if (--jump.left <= 0) jump = null;
    }
    if (o.tunnel && t >= o.tunnel[0] && t < o.tunnel[1]) continue;
    if (t % every !== 0) continue;
    const acc = n.accM[0] + rnd() * (n.accM[1] - n.accM[0]);
    const { lat, lon } = toLatLon({ x: p.x + ex + jx + n.whiteM * gauss(), y: p.y + ey + jy + n.whiteM * gauss() });
    fixes.push({ lat, lon, acc, alt: 120 + p.z + ez + n.altWhiteM * gauss(), speed: stopped ? Math.abs(0.15 * gauss()) : Math.max(0, speed + 0.25 * gauss()), ts: T0 + t * 1000 });
  }
  return { fixes, truthAlt, baroAlt, durationS: T };
}
