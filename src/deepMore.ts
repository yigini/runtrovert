// More of "Show me everything" for one run: what stops and corners cost, where
// the pace turned, your own price for a hill, how quickly your heart follows,
// heart against pace, and how sure the GPS was. Free, like every one-run stat.
// Plus a small per-run summary the months view reads (behind the unlock there).
//
// Pure, no network, no React Native, so `npm run test:deep` checks it under Node.
// Numbers only: the words live in the i18n file and are put together on screen.
//
// One thing to know about the stored points: tracking only stores a fix when you
// moved, so standing still shows up as a time gap with almost no distance, and a
// tunnel shows up as a long gap with real distance. Both are read from that.

import type { HeartSample } from './heart';
import { interp } from './runStats';

export interface MorePoint {
  ts: number;
  lat: number;
  lon: number;
  alt: number | null;
  acc?: number | null;
}

const STOP_MIN_S = 6; // a gap this long at walking speed or less is a stop
const STOP_MAX_MPS = 0.8;
const GAP_S = 15; // longer than this at running speed: the signal went
const JUMP_MPS = 12; // faster than this between two fixes is a GPS jump

function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Value at share q (0–1) of the sorted values, interpolated. */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---- The moving track ------------------------------------------------------------------

export interface Stop {
  atM: number; // metres in
  s: number; // seconds standing
}

export interface Gap {
  fromM: number;
  m: number; // metres crossed without a signal
}

/** Distance and moving time along the run, with the stops and signal gaps taken out of the time. */
export interface Moving {
  d: number[]; // strictly increasing metres
  t: number[]; // moving seconds
  ts: number[]; // clock time (ms) at each d
  /** Metres in at each input point, for anything indexed by point (height, accuracy). */
  at: number[];
  stops: Stop[];
  gaps: Gap[];
  /** Typical seconds between fixes. */
  fixS: number | null;
}

export function moving(points: MorePoint[]): Moving {
  const d = [0];
  const t = [0];
  const ts = [points[0]?.ts ?? 0];
  const at = points.length ? [0] : [];
  const stops: Stop[] = [];
  const gaps: Gap[] = [];
  const dts: number[] = [];
  let D = 0;
  let T = 0;
  let speed = 2.8;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].ts - points[i - 1].ts) / 1000;
    const dd = dist(points[i - 1], points[i]);
    if (dt <= 0 || dd / dt > JUMP_MPS) {
      at.push(D);
      continue;
    }
    if (dt <= GAP_S) dts.push(dt);
    let time = dt;
    if (dt >= STOP_MIN_S && dd / dt < STOP_MAX_MPS) {
      stops.push({ atM: D, s: Math.round(dt) });
      time = dd / Math.max(speed, 1);
    } else if (dt > GAP_S) {
      gaps.push({ fromM: D, m: dd });
      time = dd / Math.max(speed, 1);
    } else if (dd > 0) {
      speed = 0.8 * speed + 0.2 * (dd / dt);
    }
    D += dd;
    T += time;
    at.push(D);
    if (dd <= 0) continue;
    d.push(D);
    t.push(T);
    ts.push(points[i].ts);
  }
  // Two stops a few metres apart are one stop (a light that went green and red again).
  const merged: Stop[] = [];
  for (const s of stops) {
    const last = merged[merged.length - 1];
    if (last && s.atM - last.atM < 20) last.s += s.s;
    else merged.push({ ...s });
  }
  return { d, t, ts, at, stops: merged, gaps, fixS: median(dts) };
}

const total = (m: Moving) => m.d[m.d.length - 1] ?? 0;
const timeAt = (m: Moving, x: number) => interp(m.d, m.t, x);
const paceOver = (m: Moving, a: number, b: number) => ((timeAt(m, b) - timeAt(m, a)) / (b - a)) * 1000;

/** Paces (s/km) of fixed-length pieces of the run, from moving time. */
function pieces(m: Moving, len: number, from = 0): Array<{ d: number; pace: number }> {
  const out: Array<{ d: number; pace: number }> = [];
  for (let x = from; x + len <= total(m); x += len) {
    const pace = paceOver(m, x, x + len);
    if (isFinite(pace) && pace > 150 && pace < 1200) out.push({ d: x + len / 2, pace });
  }
  return out;
}

/** Your usual pace on this run: the median of 100 m pieces. */
export function cruise(m: Moving): number | null {
  return median(pieces(m, 100).map((p) => p.pace));
}

// ---- R1: what stopping cost ---------------------------------------------------------------

export interface StopsCost {
  stops: Array<{ atM: number; standS: number; restartS: number }>;
  standS: number;
  restartS: number;
}

const RESTART_M = 200;
const SLOWING_M = 60;

/** Each stop: the time standing, plus slowing into it and getting back up to speed after. */
export function stopsCost(m: Moving): StopsCost | null {
  const len = total(m);
  const pace = cruise(m);
  if (len < 1000 || pace == null) return null;
  const out: StopsCost['stops'] = [];
  for (const s of m.stops) {
    if (s.atM < 100 || s.atM > len - 100) continue; // the start and the finish aren't stops
    const after = Math.min(RESTART_M, len - s.atM);
    const before = Math.min(SLOWING_M, s.atM);
    const lostAfter = timeAt(m, s.atM + after) - timeAt(m, s.atM) - (after * pace) / 1000;
    const lostBefore = timeAt(m, s.atM) - timeAt(m, s.atM - before) - (before * pace) / 1000;
    const restart = Math.min(45, Math.max(0, lostAfter) + Math.max(0, lostBefore));
    out.push({ atM: Math.round(s.atM), standS: s.s, restartS: Math.round(restart) });
  }
  if (!out.length) return null;
  return {
    stops: out,
    standS: out.reduce((a, s) => a + s.standS, 0),
    restartS: out.reduce((a, s) => a + s.restartS, 0),
  };
}

// ---- R2: what corners cost ----------------------------------------------------------------

export interface Corner {
  atM: number;
  lat: number;
  lon: number;
  turn: number; // degrees
  costS: number;
}

export interface CornersCost {
  corners: Corner[];
  totalS: number;
  /** The route, thinned, for drawing the shape. */
  shape: Array<{ lat: number; lon: number }>;
}

const CORNER_DEG = 60;
const ARM_M = 30;
const CORNER_WINDOW_M = 40;

/** Sharp turns, and the seconds each one cost against the pace either side of it. Needs fixes every second or two. */
export function cornersCost(points: MorePoint[], m: Moving): CornersCost | null {
  const len = total(m);
  if (len < 1000 || m.fixS == null || m.fixS > 2.5) return null;
  // Position every 10 m along the run.
  const lat: number[] = [];
  const lon: number[] = [];
  const atM: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (atM.length && m.at[i] <= atM[atM.length - 1]) continue;
    atM.push(m.at[i]);
    lat.push(points[i].lat);
    lon.push(points[i].lon);
  }
  if (atM.length < 10) return null;
  const STEP = 10;
  const path: Array<{ d: number; lat: number; lon: number }> = [];
  for (let x = 0; x <= len; x += STEP) path.push({ d: x, lat: interp(atM, lat, x), lon: interp(atM, lon, x) });
  const toRad = Math.PI / 180;
  const heading = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
    const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
    return Math.atan2(y, x) / toRad;
  };
  const arm = ARM_M / STEP;
  const turns: number[] = path.map((_, i) => {
    if (i < arm || i + arm >= path.length) return 0;
    let a = Math.abs(heading(path[i], path[i + arm]) - heading(path[i - arm], path[i]));
    if (a > 180) a = 360 - a;
    return a;
  });
  const corners: Corner[] = [];
  for (let i = arm; i + arm < path.length; i++) {
    const a = turns[i];
    if (a < CORNER_DEG) continue;
    // The sharpest point of the turn only.
    let peak = true;
    for (let k = -arm; k <= arm; k++) if (k && turns[i + k] > a) peak = false;
    if (!peak) continue;
    const c = path[i].d;
    if (c < 100 || c > len - 100) continue;
    if (corners.length && c - corners[corners.length - 1].atM < 50) continue;
    if (m.stops.some((s) => Math.abs(s.atM - c) < 80)) continue; // waiting at a corner is a stop, not the corner
    const around = [
      ...pieces(m, 25, Math.max(0, c - 200)).filter((p) => p.d < c - 60),
      ...pieces(m, 25, c + 60).filter((p) => p.d < c + 200),
    ].map((p) => p.pace);
    const local = median(around);
    if (local == null || around.length < 6) continue;
    const span = 2 * CORNER_WINDOW_M;
    const lost = timeAt(m, c + CORNER_WINDOW_M) - timeAt(m, c - CORNER_WINDOW_M) - (span * local) / 1000;
    corners.push({ atM: Math.round(c), lat: path[i].lat, lon: path[i].lon, turn: Math.round(a), costS: round1(Math.max(0, Math.min(15, lost))) });
  }
  if (corners.length < 2) return null;
  const every = Math.max(1, Math.round(path.length / 160));
  const shape = path.filter((_, i) => i % every === 0 || i === path.length - 1).map((p) => ({ lat: p.lat, lon: p.lon }));
  return { corners, totalS: Math.round(corners.reduce((a, c) => a + c.costS, 0)), shape };
}

// ---- R3: where the pace turned -------------------------------------------------------------

export type Turn =
  | { kind: 'faded'; atM: number; holdPace: number; endPace: number; series: Array<{ d: number; pace: number }> }
  | { kind: 'held'; pace: number; series: Array<{ d: number; pace: number }> };

const TURN_PIECE_M = 250;
const TURN_MIN_M = 5000;

/**
 * Pace held level, then (maybe) a steady slide: the one point where the trend
 * changes, from a two-part fit. The first 500 m are left out, since most runs
 * start slow. A slide under 10 s/km by the end isn't called a fade.
 */
export function paceTurn(m: Moving): Turn | null {
  if (total(m) < TURN_MIN_M) return null;
  const series = pieces(m, TURN_PIECE_M, 500);
  if (series.length < 12) return null;
  const xs = series.map((p) => p.d);
  const ys = series.map((p) => p.pace);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const sse = (a: number[], f: (i: number) => number, off = 0) => a.reduce((s, v, i) => s + (v - f(i + off)) ** 2, 0);
  const flat = mean(ys);
  const sse0 = sse(ys, () => flat);
  let best: { i: number; a: number; slope: number; err: number } | null = null;
  for (let i = 4; i <= ys.length - 4; i++) {
    const a = mean(ys.slice(0, i));
    const xb = xs[i];
    let num = 0;
    let den = 0;
    for (let k = i; k < ys.length; k++) {
      num += (xs[k] - xb) * (ys[k] - a);
      den += (xs[k] - xb) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const err = sse(ys.slice(0, i), () => a) + sse(ys.slice(i), (k) => a + slope * (xs[k] - xb), i);
    if (!best || err < best.err) best = { i, a, slope, err };
  }
  const xEnd = xs[xs.length - 1];
  if (best) {
    const fade = best.slope * (xEnd - xs[best.i]);
    if (fade >= 10 && best.err <= sse0 * 0.75) {
      return { kind: 'faded', atM: Math.round(xs[best.i] - TURN_PIECE_M / 2), holdPace: best.a, endPace: best.a + fade, series };
    }
  }
  return { kind: 'held', pace: median(ys)!, series };
}

/** How far the pace held, for the months view: where it turned, or the whole run if it never did. */
export function heldM(m: Moving): number | null {
  const t = paceTurn(m);
  if (!t) return null;
  return t.kind === 'faded' ? t.atM : Math.round(total(m));
}

// ---- R4: your hill price -------------------------------------------------------------------

export interface HillPrice {
  /** Seconds per km slower for each 1% uphill. */
  upS: number | null;
  /** Seconds per km quicker for each 1% downhill. */
  downS: number | null;
  flatPace: number;
  /** Each 100 m: gradient in percent and pace against flat in s/km. */
  dots: Array<{ g: number; dp: number }>;
}

const HILL_PIECE_M = 100;
const HILL_EDGE = 1.5; // % — gentler than this counts as flat for the fit

/** Your own cost per 1% of hill on this run: a line through the uphill pieces and one through the downhill ones. */
export function hillPrice(points: MorePoint[], m: Moving, climbM: number): HillPrice | null {
  if (climbM < 30 || total(m) < 2000) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  points.forEach((p, i) => {
    if (p.alt == null || !isFinite(p.alt)) return;
    if (xs.length && m.at[i] <= xs[xs.length - 1]) return;
    xs.push(m.at[i]);
    ys.push(p.alt);
  });
  if (xs.length < 20) return null;
  // Heights smoothed over 120 m, as the elevation chart does.
  const alt = (x: number) => [-60, -30, 0, 30, 60].reduce((s, k) => s + interp(xs, ys, x + k), 0) / 5;
  const raw: Array<{ g: number; pace: number }> = [];
  for (let x = 0; x + HILL_PIECE_M <= total(m); x += HILL_PIECE_M) {
    if (m.stops.some((s) => s.atM >= x - 20 && s.atM <= x + HILL_PIECE_M + 20)) continue;
    const g = ((alt(x + HILL_PIECE_M) - alt(x)) / HILL_PIECE_M) * 100;
    const pace = paceOver(m, x, x + HILL_PIECE_M);
    if (!isFinite(pace) || pace < 150 || pace > 1200 || Math.abs(g) > 20) continue;
    raw.push({ g, pace });
  }
  const flats = raw.filter((r) => Math.abs(r.g) < 1).map((r) => r.pace);
  const flatPace = median(flats.length >= 5 ? flats : raw.map((r) => r.pace));
  if (flatPace == null) return null;
  const dots = raw.map((r) => ({ g: round1(r.g), dp: Math.round(Math.max(-200, Math.min(300, r.pace - flatPace))) }));
  const fit = (side: Array<{ g: number; dp: number }>) => {
    if (side.length < 5) return null;
    const num = side.reduce((s, r) => s + r.g * r.dp, 0);
    const den = side.reduce((s, r) => s + r.g * r.g, 0);
    return den > 0 ? num / den : null;
  };
  const up = fit(dots.filter((r) => r.g >= HILL_EDGE));
  const down = fit(dots.filter((r) => r.g <= -HILL_EDGE));
  const upS = up != null && up > 0 ? round1(up) : null;
  const downS = down != null && down > 0 ? round1(down) : null;
  if (upS == null && downS == null) return null;
  return { upS, downS, flatPace, dots: dots.length > 240 ? dots.filter((_, i) => i % Math.ceil(dots.length / 240) === 0) : dots };
}

// ---- R5: heart catch-up ----------------------------------------------------------------------

export interface HeartLag {
  lagS: number;
  r: number;
  /** How closely heart followed pace at each delay, 0–60 s. */
  curve: Array<{ lag: number; r: number }>;
}

const LAG_MAX_S = 60;

/** Speed and heart rate, each with its slow trend taken off, matched at delays of 0–60 s. */
export function heartLag(m: Moving, heart: HeartSample[]): HeartLag | null {
  if (heart.length < 30 || m.d.length < 30) return null;
  const t0 = Math.max(m.ts[0], heart[0].ts) + 60_000;
  const t1 = Math.min(m.ts[m.ts.length - 1], heart[heart.length - 1].ts);
  const n = Math.floor((t1 - t0) / 1000);
  if (n < 15 * 60) return null;
  const hTs = heart.map((h) => h.ts);
  const hBpm = heart.map((h) => h.bpm);
  // A gap of more than 30 s in the heart data: the watch was off. Too many and we say nothing.
  let holes = 0;
  for (let i = 1; i < heart.length; i++) if (heart[i].ts - heart[i - 1].ts > 30_000) holes++;
  if (holes > 5) return null;
  const v: number[] = [];
  const h: number[] = [];
  for (let s = 0; s < n; s++) {
    const t = t0 + s * 1000;
    v.push((interp(m.ts, m.d, t + 5000) - interp(m.ts, m.d, t - 5000)) / 10);
    h.push(interp(hTs, hBpm, t));
  }
  const detrend = (a: number[]) => {
    const out: number[] = [];
    const W = 60;
    let sum = 0;
    const pre: number[] = [0];
    for (const x of a) pre.push((sum += x));
    for (let i = 0; i < a.length; i++) {
      const lo = Math.max(0, i - W);
      const hi = Math.min(a.length, i + W + 1);
      out.push(a[i] - (pre[hi] - pre[lo]) / (hi - lo));
    }
    return out;
  };
  const dv = detrend(v);
  const dh = detrend(h);
  const corr = (lag: number) => {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i + lag < dv.length; i++) {
      sxy += dv[i] * dh[i + lag];
      sxx += dv[i] * dv[i];
      syy += dh[i + lag] * dh[i + lag];
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  const curve: HeartLag['curve'] = [];
  let best = { lag: 0, r: -1 };
  for (let lag = 0; lag <= LAG_MAX_S; lag += 2) {
    const r = corr(lag);
    curve.push({ lag, r: Math.round(r * 100) / 100 });
    if (r > best.r) best = { lag, r };
  }
  // A weak match, or a peak at the edge, says nothing honest.
  if (best.r < 0.3 || best.lag === 0 || best.lag === LAG_MAX_S) return null;
  return { lagS: best.lag, r: Math.round(best.r * 100) / 100, curve };
}

// ---- R6: heart and pace together -------------------------------------------------------------

/** Pace and heart rate for each 250 m, in order: the path the run took through both. */
export function heartPacePath(m: Moving, heart: HeartSample[]): Array<{ pace: number; bpm: number }> | null {
  if (heart.length < 30 || total(m) < 3000) return null;
  const hTs = heart.map((x) => x.ts);
  const hBpm = heart.map((x) => x.bpm);
  const out: Array<{ pace: number; bpm: number }> = [];
  const len = 250;
  for (let x = 0; x + len <= total(m); x += len) {
    const a = interp(m.d, m.ts, x);
    const b = interp(m.d, m.ts, x + len);
    if (a < hTs[0] || b > hTs[hTs.length - 1]) continue;
    const bpm = [0, 0.25, 0.5, 0.75, 1].reduce((s, f) => s + interp(hTs, hBpm, a + (b - a) * f), 0) / 5;
    const pace = paceOver(m, x, x + len);
    if (isFinite(pace) && pace > 150 && pace < 1200) out.push({ pace: Math.round(pace), bpm: Math.round(bpm) });
  }
  return out.length >= 10 ? out : null;
}

// ---- R7: how sure the GPS was ----------------------------------------------------------------

export type Sure = 'good' | 'fair' | 'poor' | 'gap';

export interface GpsSure {
  /** One entry per piece of the run, `pieceM` long. */
  pieces: Sure[];
  pieceM: number;
  /** Share of the distance in each, 0–1. */
  share: Record<Sure, number>;
  gapM: number;
}

/** Within 5 m, 5–10 m, over 10 m, and stretches with no signal that were filled in. */
export function gpsSure(points: MorePoint[], m: Moving): GpsSure | null {
  const len = total(m);
  if (len < 500 || !points.some((p) => p.acc != null)) return null;
  const pieceM = Math.max(100, Math.round(len / 120 / 50) * 50);
  const n = Math.ceil(len / pieceM);
  const sums = Array.from({ length: n }, () => ({ good: 0, fair: 0, poor: 0, gap: 0 }));
  const inGap = (x: number) => m.gaps.some((g) => x >= g.fromM && x <= g.fromM + g.m);
  for (let i = 1; i < points.length; i++) {
    const a = m.at[i - 1];
    const b = m.at[i];
    if (b <= a) continue;
    const acc = points[i].acc;
    const k = Math.min(n - 1, Math.floor(((a + b) / 2) / pieceM));
    const kind: Sure = inGap((a + b) / 2) ? 'gap' : acc == null ? 'fair' : acc <= 5 ? 'good' : acc <= 10 ? 'fair' : 'poor';
    sums[k][kind] += b - a;
  }
  const pieces: Sure[] = sums.map((s) => {
    if (s.gap > (s.good + s.fair + s.poor + s.gap) / 2) return 'gap';
    return s.poor >= s.fair && s.poor >= s.good ? 'poor' : s.fair >= s.good ? 'fair' : 'good';
  });
  const all = sums.reduce((a, s) => ({ good: a.good + s.good, fair: a.fair + s.fair, poor: a.poor + s.poor, gap: a.gap + s.gap }), { good: 0, fair: 0, poor: 0, gap: 0 });
  const sum = all.good + all.fair + all.poor + all.gap || 1;
  return {
    pieces,
    pieceM,
    share: { good: all.good / sum, fair: all.fair / sum, poor: all.poor / sum, gap: all.gap / sum },
    gapM: Math.round(m.gaps.reduce((a, g) => a + g.m, 0)),
  };
}

// ---- All together --------------------------------------------------------------------------

export interface DeepMore {
  stops: StopsCost | null;
  corners: CornersCost | null;
  turn: Turn | null;
  hill: HillPrice | null;
  lag: HeartLag | null;
  heartPath: Array<{ pace: number; bpm: number }> | null;
  gps: GpsSure | null;
}

export function deepMore(points: MorePoint[], heart: HeartSample[], climbM: number): DeepMore {
  if (points.length < 10) return { stops: null, corners: null, turn: null, hill: null, lag: null, heartPath: null, gps: null };
  const m = moving(points);
  return {
    stops: stopsCost(m),
    corners: cornersCost(points, m),
    turn: paceTurn(m),
    hill: hillPrice(points, m, climbM),
    lag: heart.length ? heartLag(m, heart) : null,
    heartPath: heart.length ? heartPacePath(m, heart) : null,
    gps: gpsSure(points, m),
  };
}

// ---- What the months view keeps from each run ----------------------------------------------

export const RUN_SUMMARY_V = 1;

export interface RunSummary {
  v: number;
  /** How far the pace held (R3), on runs of 5 km or more. */
  heldM: number | null;
  /** Your hill price up, s/km per 1% (R4). */
  upS: number | null;
  /** Where it started, rounded to about a kilometre: enough for sunrise, no more. */
  lat: number | null;
  lon: number | null;
  /** The streets, as ~40 m grid cells every 50 m, for "new streets". */
  cells: string[];
}

const CELL_DEG = 1 / 2800; // about 40 m of latitude

export function cellOf(lat: number, lon: number): [number, number] {
  return [Math.round(lat / CELL_DEG), Math.round((lon * Math.cos((lat * Math.PI) / 180)) / CELL_DEG)];
}

export function runSummary(points: MorePoint[], climbM: number): RunSummary {
  const empty: RunSummary = { v: RUN_SUMMARY_V, heldM: null, upS: null, lat: null, lon: null, cells: [] };
  if (points.length < 10) return empty;
  const m = moving(points);
  const cells: string[] = [];
  const atM: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  points.forEach((p, i) => {
    if (atM.length && m.at[i] <= atM[atM.length - 1]) return;
    atM.push(m.at[i]);
    lat.push(p.lat);
    lon.push(p.lon);
  });
  if (atM.length > 1) {
    for (let x = 0; x <= total(m); x += 50) {
      const [a, b] = cellOf(interp(atM, lat, x), interp(atM, lon, x));
      const key = `${a}:${b}`;
      if (cells[cells.length - 1] !== key) cells.push(key);
    }
  }
  const hill = hillPrice(points, m, climbM);
  return {
    v: RUN_SUMMARY_V,
    heldM: heldM(m),
    upS: hill?.upS ?? null,
    lat: Math.round(points[0].lat * 100) / 100,
    lon: Math.round(points[0].lon * 100) / 100,
    cells,
  };
}
