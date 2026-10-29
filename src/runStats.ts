// Everything the stats page shows about one run, worked out on the phone from
// the stored GPS fixes. No network: sunrise and sunset come from the saved
// forecast when there is one, otherwise from the sun's position maths below.
// Pure, so `npm run test:stats` can check it under plain Node.

import { track, type TimedPoint } from './progress';
import { ui } from './i18n/ui';

export interface StatPoint extends TimedPoint {
  alt: number | null;
}

export interface StatRun {
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  durationS: number; // active seconds
  elevationGainM: number;
}

export interface Sun {
  sunrise: number | null;
  sunset: number | null;
}

export interface SeriesPoint {
  d: number; // metres from the start
  v: number; // pace in s/km, or altitude in metres
}

export interface Halves {
  firstS: number;
  secondS: number;
}

export interface DayLight {
  sunrise: number;
  sunset: number;
  start: number;
  end: number;
  darkS: number; // active seconds after sunset or before sunrise
  line: string; // "Finished 14 min before sunset."
}

export interface RunStats {
  pace: SeriesPoint[]; // smoothed, s/km
  elevation: SeriesPoint[]; // smoothed, metres
  avgPace: number | null; // s/km
  fastest: { d: number; pace: number } | null; // fastest 200 m stretch, mid-point
  highM: number | null;
  lowM: number | null;
  halves: Halves | null;
  steadiness: { spread: number; word: string } | null; // spread in s/km
  steps: number | null;
  floors: number | null;
  corners: number | null;
  furthestM: number | null;
  loopM: number | null; // how far from the start it ended, when it was a loop
  stoppedS: number | null; // standing at lights, tying laces
  light: DayLight | null;
}

const MIN_CHART_M = 400; // shorter than this, charts are mostly noise
const STEP_M = 25;
const PACE_WINDOW_M = 300;
const ALT_WINDOW_M = 120;
const SLOWEST = 20 * 60; // s/km: slower than this is standing, not running
const FASTEST = 160; // s/km: past world-record pace, so GPS noise
const MAX_POINTS = 140;

function dist(a: TimedPoint, b: TimedPoint): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** y at x on a polyline given by sorted xs; clamps at the ends. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return span > 0 ? ys[lo] + ((x - xs[lo]) / span) * (ys[hi] - ys[lo]) : ys[lo];
}

/** Keep at most `max` points, evenly picked, always keeping the last. */
function thin(s: SeriesPoint[], max = MAX_POINTS): SeriesPoint[] {
  if (s.length <= max) return s;
  const out: SeriesPoint[] = [];
  const stride = (s.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(s[Math.round(i * stride)]);
  return out;
}

/** Times as a function of distance, made strictly increasing in distance for interpolation. */
function distanceTime(points: TimedPoint[]): { d: number[]; t: number[] } {
  const { d, t } = track(points);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (xs.length && d[i] <= xs[xs.length - 1]) {
      ys[ys.length - 1] = t[i]; // standing still: time moves on, distance doesn't
      continue;
    }
    xs.push(d[i]);
    ys.push(t[i]);
  }
  return { d: xs, t: ys };
}

export function paceSeries(d: number[], t: number[]): SeriesPoint[] {
  const total = d[d.length - 1] ?? 0;
  if (total < MIN_CHART_M) return [];
  const half = Math.min(PACE_WINDOW_M, total / 3) / 2;
  const out: SeriesPoint[] = [];
  for (let x = 0; x <= total; x += STEP_M) {
    const a = Math.max(0, x - half);
    const b = Math.min(total, x + half);
    if (b - a < half) continue;
    const pace = ((interp(d, t, b) - interp(d, t, a)) / (b - a)) * 1000;
    if (!isFinite(pace)) continue;
    out.push({ d: x, v: Math.min(SLOWEST, Math.max(FASTEST, pace)) });
  }
  return thin(out);
}

export function elevationSeries(points: StatPoint[], d: number[]): SeriesPoint[] {
  const total = d[d.length - 1] ?? 0;
  if (total < MIN_CHART_M) return [];
  const { d: all } = track(points);
  const xs: number[] = [];
  const ys: number[] = [];
  points.forEach((p, i) => {
    if (p.alt == null || !isFinite(p.alt)) return;
    if (xs.length && all[i] <= xs[xs.length - 1]) return;
    xs.push(all[i]);
    ys.push(p.alt);
  });
  if (xs.length < 5) return [];
  const half = ALT_WINDOW_M / 2;
  const out: SeriesPoint[] = [];
  for (let x = 0; x <= total; x += STEP_M) {
    let sum = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      sum += interp(xs, ys, x + (k * half) / 2);
      n++;
    }
    out.push({ d: x, v: sum / n });
  }
  return thin(out);
}

/** Fastest stretch of `m` metres, by its mid-point. */
function fastestStretch(d: number[], t: number[], m = 200): { d: number; pace: number } | null {
  const total = d[d.length - 1] ?? 0;
  if (total < Math.max(MIN_CHART_M, m * 2)) return null;
  let best: { d: number; pace: number } | null = null;
  for (let x = 0; x + m <= total; x += STEP_M) {
    const pace = ((interp(d, t, x + m) - interp(d, t, x)) / m) * 1000;
    if (pace < FASTEST) continue;
    if (!best || pace < best.pace) best = { d: x + m / 2, pace };
  }
  return best;
}

function halves(d: number[], t: number[]): Halves | null {
  const total = d[d.length - 1] ?? 0;
  if (total < 1000) return null;
  const mid = interp(d, t, total / 2);
  return { firstS: mid, secondS: t[t.length - 1] - mid };
}

/** How evenly you ran: the typical distance of your pace from its median, in s/km. */
function steadiness(pace: SeriesPoint[], kmSplitPaces: number[]): RunStats['steadiness'] {
  const vals = kmSplitPaces.length >= 3 ? kmSplitPaces : pace.length >= 12 ? pace.map((p) => p.v) : [];
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dev = vals.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const spread = Math.round(dev[Math.floor(dev.length / 2)]);
  const word = spread <= 4 ? ui().runStats.metronome : spread <= 10 ? ui().runStats.steady : spread <= 25 ? ui().runStats.rolling : ui().runStats.freeForm;
  return { spread, word };
}

/** Rough steps: cadence rises with speed, about 150 a minute jogging to 180 running fast. */
export function estimateSteps(distanceM: number, durationS: number): number | null {
  if (distanceM < 200 || durationS < 60) return null;
  const speed = distanceM / durationS;
  const cadence = Math.min(185, Math.max(145, 150 + (speed - 2.5) * 14));
  return Math.round(((durationS / 60) * cadence) / 10) * 10;
}

/** Turns of more than 50° that stick for at least 30 metres. */
function countCorners(points: TimedPoint[]): number | null {
  const pts: TimedPoint[] = [];
  for (const p of points) if (!pts.length || dist(pts[pts.length - 1], p) >= 30) pts.push(p);
  if (pts.length < 6) return null;
  const toRad = Math.PI / 180;
  const heading = (a: TimedPoint, b: TimedPoint) => {
    const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
    const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
    return Math.atan2(y, x) / toRad;
  };
  let n = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    let turn = Math.abs(heading(pts[i], pts[i + 1]) - heading(pts[i - 1], pts[i]));
    if (turn > 180) turn = 360 - turn;
    if (turn >= 50) n++;
  }
  return n;
}

// ---- The sun ------------------------------------------------------------------

/** Sunrise and sunset for the day of `ms` at a place, from the NOAA approximation. null in polar day or night. */
export function sunTimes(ms: number, lat: number, lon: number): Sun {
  const toRad = Math.PI / 180;
  const day = new Date(ms);
  const noonUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12);
  const n = Math.round((noonUtc - Date.UTC(2000, 0, 1, 12)) / 86400000) - lon / 360;
  const M = (357.5291 + 0.98560028 * n) % 360;
  const C = 1.9148 * Math.sin(M * toRad) + 0.02 * Math.sin(2 * M * toRad) + 0.0003 * Math.sin(3 * M * toRad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545 + n + 0.0053 * Math.sin(M * toRad) - 0.0069 * Math.sin(2 * lambda * toRad);
  const decl = Math.asin(Math.sin(lambda * toRad) * Math.sin(23.4397 * toRad));
  const cosH = (Math.sin(-0.833 * toRad) - Math.sin(lat * toRad) * Math.sin(decl)) / (Math.cos(lat * toRad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return { sunrise: null, sunset: null };
  const H = Math.acos(cosH) / toRad / 360;
  const jdToMs = (jd: number) => (jd - 2440587.5) * 86400000;
  return { sunrise: Math.round(jdToMs(transit - H)), sunset: Math.round(jdToMs(transit + H)) };
}

function mins(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? ui().runStats.xHXMin(h, r) : `${h} h`;
}

export function sunLine(start: number, end: number, sun: { sunrise: number; sunset: number }): string {
  const { sunrise, sunset } = sun;
  if (start < sunset && end > sunset) return ui().runStats.youRanThroughTheSunset;
  if (start < sunrise && end > sunrise) return ui().runStats.youRanThroughTheSunrise;
  if (end <= sunrise) return ui().runStats.doneXBeforeSunriseThe(mins(sunrise - end));
  if (start >= sunset) return ui().runStats.outXAfterSunsetStreetlights(mins(start - sunset));
  const toSet = sunset - end;
  const fromRise = start - sunrise;
  if (toSet <= 90 * 60000) return ui().runStats.finishedXBeforeSunset(mins(toSet));
  if (fromRise <= 90 * 60000) return ui().runStats.outXAfterSunrise(mins(fromRise));
  return ui().runStats.xOfDaylightLeftWhen(mins(toSet));
}

function dayLight(run: StatRun, points: TimedPoint[], sun: Sun | null): DayLight | null {
  if (!points.length) return null;
  const start = run.startedAt;
  const end = run.endedAt ?? points[points.length - 1].ts;
  let { sunrise, sunset } = sun ?? { sunrise: null, sunset: null };
  // A saved sunrise/sunset only counts if it is for the day of the run.
  const sameDay = (t: number | null) => t != null && new Date(t).toDateString() === new Date(start).toDateString();
  if (!sameDay(sunrise) || !sameDay(sunset)) ({ sunrise, sunset } = sunTimes(start, points[0].lat, points[0].lon));
  if (sunrise == null || sunset == null) return null;
  let darkS = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].ts - points[i - 1].ts) / 1000;
    if (dt <= 0 || dt > 15) continue; // paused
    if (points[i].ts < sunrise || points[i].ts > sunset) darkS += dt;
  }
  return { sunrise, sunset, start, end, darkS: Math.round(darkS), line: sunLine(start, end, { sunrise, sunset }) };
}

// ---- All together -------------------------------------------------------------

export function runStats(run: StatRun, raw: StatPoint[], kmSplitPaces: number[] = [], sun: Sun | null = null): RunStats {
  const points = [...raw].sort((a, b) => a.ts - b.ts);
  const { d, t } = points.length > 1 ? distanceTime(points) : { d: [0], t: [0] };
  const pace = paceSeries(d, t);
  const elevation = points.length > 1 ? elevationSeries(points, d) : [];
  const alts = elevation.map((e) => e.v);
  const avgPace = run.distanceM >= 50 && run.durationS >= 10 ? (run.durationS / run.distanceM) * 1000 : null;
  const first = points[0];
  const last = points[points.length - 1];
  const furthest = first ? Math.max(0, ...points.map((p) => dist(first, p))) : 0;
  const endGap = first && last ? dist(first, last) : null;
  const elapsed = run.endedAt != null ? (run.endedAt - run.startedAt) / 1000 : null;
  const stopped = elapsed != null ? elapsed - run.durationS : null;

  return {
    pace,
    elevation,
    avgPace: avgPace != null && avgPace <= SLOWEST ? avgPace : null,
    fastest: fastestStretch(d, t),
    highM: alts.length ? Math.max(...alts) : null,
    lowM: alts.length ? Math.min(...alts) : null,
    halves: halves(d, t),
    steadiness: steadiness(pace, kmSplitPaces),
    steps: estimateSteps(run.distanceM, run.durationS),
    floors: run.elevationGainM >= 6 ? Math.round(run.elevationGainM / 3) : null,
    corners: run.distanceM >= 500 ? countCorners(points) : null,
    furthestM: run.distanceM >= 500 && furthest >= 100 ? furthest : null,
    loopM: run.distanceM >= 1000 && endGap != null && endGap < 200 && furthest > 300 ? endGap : null,
    stoppedS: stopped != null && stopped >= 30 && stopped < 6 * 3600 ? Math.round(stopped) : null,
    light: dayLight(run, points, sun),
  };
}
