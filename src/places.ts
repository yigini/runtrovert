// Your places: the runner's own memory of routes they like. Pure logic, no
// React, no database, no network: matching a run to a loop happens on the
// phone from the saved fixes alone. `npm run test:places` runs it.
//
// Two things are kept apart on purpose. How busy a place was is the runner's
// own dated note, never a forecast, and never the word "empty" in our voice.
// Safety is not something a route memory can know, so nothing here says it.

import type { Quiet } from './types';
import { live, ui } from './i18n/ui';

export interface RoutePt {
  lat: number;
  lon: number;
}

/** A route reduced to evenly spaced points, small enough to keep beside a run or a place. */
export interface RouteSig {
  v: number;
  /** [lat, lon] every STEP_M metres along the route, 5 decimals (about 1 m). */
  pts: Array<[number, number]>;
  distanceM: number;
}

export const SIG_V = 1;
/** Spacing of the resampled route. */
export const STEP_M = 25;
/** A fix this close to the other route counts as on it: GPS wander plus the other side of the path. */
export const NEAR_M = 40;
/** Share of each route that must lie on the other for the two to be the same loop. */
export const SAME_LOOP = 0.8;
/** Shorter than this and a "route" is mostly GPS noise around a doorstep. */
export const MIN_ROUTE_M = 500;
/** The prompt appears on the third run of the same loop: two earlier ones plus today. */
export const OFFER_AFTER = 2;

// Stored in English; tagLabel() shows them in the runner's language. Their own tags stay as typed.
export const PLACE_TAGS = ['quiet', 'shaded', 'few crossings', 'familiar', 'lit after dark', 'soft ground', 'hilly'] as const;

/** How busy, in the runner's words. 'empty' is shown as "hardly anyone": their note, not our promise. */
export const BUSY_LABEL: Record<Quiet, string> = live(() => ui().places.busy);

export function tagLabel(tag: string): string {
  return (ui().places.tags as Record<string, string>)[tag] ?? tag;
}

// ---- Geometry ------------------------------------------------------------------

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres east/north of a reference latitude. Equirectangular: fine at the size of a run. */
function projector(lat0: number) {
  const kx = (R * Math.PI * Math.cos(rad(lat0))) / 180;
  const ky = (R * Math.PI) / 180;
  return (p: RoutePt | [number, number]): [number, number] => (Array.isArray(p) ? [p[1] * kx, p[0] * ky] : [p.lon * kx, p.lat * ky]);
}

/** The route resampled every STEP_M metres. null when it is too short to remember. */
export function routeSignature(points: RoutePt[], step = STEP_M): RouteSig | null {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) return null;
  const xy = projector(pts[0].lat);
  const out: Array<[number, number]> = [[round5(pts[0].lat), round5(pts[0].lon)]];
  let total = 0;
  let carry = 0; // metres walked since the last kept point
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    let along = step - carry;
    while (along <= seg) {
      const t = along / seg;
      out.push([round5(a.lat + (b.lat - a.lat) * t), round5(a.lon + (b.lon - a.lon) * t)]);
      along += step;
    }
    carry = (carry + seg) % step;
    total += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== round5(last.lat) || tail[1] !== round5(last.lon)) out.push([round5(last.lat), round5(last.lon)]);
  if (total < MIN_ROUTE_M) return null;
  return { v: SIG_V, pts: out, distanceM: Math.round(total) };
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** Share of `a`'s points lying within NEAR_M of some point of `b`. */
function coverage(a: Array<[number, number]>, b: Array<[number, number]>, xy: ReturnType<typeof projector>, near: number): number {
  if (a.length === 0 || b.length === 0) return 0;
  // b's points in a grid of `near`-sized cells: each lookup checks the 3×3 cells around it.
  const grid = new Map<string, Array<[number, number]>>();
  for (const p of b) {
    const [x, y] = xy(p);
    const k = `${Math.floor(x / near)},${Math.floor(y / near)}`;
    const cell = grid.get(k);
    if (cell) cell.push([x, y]);
    else grid.set(k, [[x, y]]);
  }
  const n2 = near * near;
  let hit = 0;
  for (const p of a) {
    const [x, y] = xy(p);
    const cx = Math.floor(x / near);
    const cy = Math.floor(y / near);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        const cell = grid.get(`${cx + dx},${cy + dy}`);
        if (!cell) continue;
        for (const [qx, qy] of cell) {
          if ((qx - x) ** 2 + (qy - y) ** 2 <= n2) {
            found = true;
            break;
          }
        }
      }
    }
    if (found) hit++;
  }
  return hit / a.length;
}

/**
 * How much two routes are the same path, 0 to 1: the smaller of the two
 * coverages, so a 5 km loop is not "the same" as the 12 km run that passes
 * through it. Direction and starting point don't matter: a loop run the other
 * way round, or started from the far side, is still that loop.
 */
export function similarity(a: RouteSig, b: RouteSig, near = NEAR_M): number {
  if (a.pts.length === 0 || b.pts.length === 0) return 0;
  // Quick outs: very different lengths, or boxes that don't touch.
  const ratio = Math.min(a.distanceM, b.distanceM) / Math.max(a.distanceM, b.distanceM, 1);
  if (ratio < SAME_LOOP * 0.85) return 0;
  const ba = box(a);
  const bb = box(b);
  const padLat = near / 111000;
  const padLon = padLat / Math.max(0.1, Math.cos(rad(ba.minLat)));
  if (ba.maxLat + padLat < bb.minLat || bb.maxLat + padLat < ba.minLat || ba.maxLon + padLon < bb.minLon || bb.maxLon + padLon < ba.minLon) return 0;
  const xy = projector((ba.minLat + ba.maxLat) / 2);
  return Math.min(coverage(a.pts, b.pts, xy, near), coverage(b.pts, a.pts, xy, near));
}

export function sameLoop(a: RouteSig, b: RouteSig): boolean {
  return similarity(a, b) >= SAME_LOOP;
}

function box(s: RouteSig) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [la, lo] of s.pts) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** A shorter copy for keeping in settings (the loops the runner said "Not now" to). */
export function thin(s: RouteSig, every = 2): RouteSig {
  const pts = s.pts.filter((_, i) => i % every === 0 || i === s.pts.length - 1);
  return { ...s, pts };
}

// ---- Matching a finished run ---------------------------------------------------

export interface PlaceRef {
  id: number;
  sig: RouteSig;
}

/** The saved place this route is, if any: the closest match above the line. */
export function findPlace(sig: RouteSig, places: PlaceRef[]): number | null {
  let best: { id: number; s: number } | null = null;
  for (const p of places) {
    const s = similarity(sig, p.sig);
    if (s >= SAME_LOOP && (!best || s > best.s)) best = { id: p.id, s };
  }
  return best?.id ?? null;
}

/** Earlier runs on the same loop, newest first as given. */
export function earlierOnLoop(sig: RouteSig, past: Array<{ runId: number; sig: RouteSig }>): number[] {
  return past.filter((p) => sameLoop(sig, p.sig)).map((p) => p.runId);
}

export type PlaceOffer =
  | { kind: 'place'; placeId: number } // already one of your places: today's note goes in its log
  | { kind: 'offer'; earlier: number[] } // third run (or more) of a loop: offer to keep it
  | { kind: 'none' };

/**
 * What the finish screen says about where you ran. The offer comes on the
 * third run of the same loop, and never again for a loop you said "Not now" to.
 */
export function placeOffer(sig: RouteSig | null, past: Array<{ runId: number; sig: RouteSig }>, places: PlaceRef[], dismissed: RouteSig[]): PlaceOffer {
  if (!sig) return { kind: 'none' };
  const placeId = findPlace(sig, places);
  if (placeId != null) return { kind: 'place', placeId };
  if (dismissed.some((d) => sameLoop(sig, d))) return { kind: 'none' };
  const earlier = earlierOnLoop(sig, past);
  return earlier.length >= OFFER_AFTER ? { kind: 'offer', earlier } : { kind: 'none' };
}

/** The line on the finish card. "Third time" only when it is the third. */
export function offerLine(earlier: number): string {
  const n = earlier + 1;
  if (n === 3) return ui().places.thirdTimeOnThisLoop;
  return ui().places.xRunsOnThisLoop(n);
}

/** A name to start from; the runner will usually change it. */
export function suggestName(startedAt: number): string {
  const h = new Date(startedAt).getHours();
  const names = ui().places.loopName;
  return h < 11 ? names.morning : h < 14 ? names.lunchtime : h < 17 ? names.afternoon : h < 22 ? names.evening : names.night;
}

/** Tidy a custom tag: lower case, one space, short. Empty means nothing to add. */
export function cleanTag(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 24);
}

// ---- The log and what it adds up to --------------------------------------------

export interface Visit {
  at: number; // epoch ms
  busy: Quiet | null;
  note: string | null;
}

export interface VisitRun extends Visit {
  distanceM?: number;
  durationS?: number;
}

/** Free: how often, since when, quickest pace (s/km) on runs that covered most of the loop. */
export function placeSummary(visits: VisitRun[], loopM: number): { count: number; since: number | null; last: Visit | null; bestPace: number | null } {
  const sorted = [...visits].sort((a, b) => b.at - a.at);
  let bestPace: number | null = null;
  for (const v of sorted) {
    if (!v.distanceM || !v.durationS || v.distanceM < loopM * 0.8) continue;
    const pace = v.durationS / (v.distanceM / 1000);
    if (bestPace == null || pace < bestPace) bestPace = pace;
  }
  return { count: sorted.length, since: sorted.length ? sorted[sorted.length - 1].at : null, last: sorted[0] ?? null, bestPace };
}

export type DayPart = 'early morning' | 'morning' | 'lunchtime' | 'afternoon' | 'evening' | 'night';

export function dayPart(at: number): DayPart {
  const h = new Date(at).getHours();
  if (h < 5) return 'night';
  if (h < 8) return 'early morning';
  if (h < 11) return 'morning';
  if (h < 14) return 'lunchtime';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}


export interface PatternLine {
  text: string;
  count: number;
  of: number;
}

/** Fewer rated notes than this in a group and we say nothing about it. */
export const PATTERN_MIN = 3;

/**
 * Part of Everything, once: what months of your own notes say about when a
 * place tends to be quiet or busy. Counts, never a score, never a promise:
 * "You noted hardly anyone on 3 of your last 3 Sunday mornings here."
 * Grouped by weekday and time of day where there are enough notes, else
 * weekdays against weekends.
 */
export function quietPatterns(visits: Visit[], max = 3): PatternLine[] {
  const rated = visits.filter((v): v is Visit & { busy: Quiet } => v.busy != null).sort((a, b) => b.at - a.at);
  type Slot = { label: string; part: DayPart; weekend: boolean; day: number | null; notes: Array<Visit & { busy: Quiet }> };
  const slots = new Map<string, Slot>();
  const add = (label: string, part: DayPart, weekend: boolean, day: number | null, v: Visit & { busy: Quiet }) => {
    const s = slots.get(label) ?? { label, part, weekend, day, notes: [] };
    s.notes.push(v);
    slots.set(label, s);
  };
  for (const v of rated) {
    const d = new Date(v.at).getDay();
    const part = dayPart(v.at);
    const weekend = d === 0 || d === 6;
    add(`${d} ${part}`, part, weekend, d, v);
    add(`${weekend ? 'weekend' : 'weekday'} ${part}`, part, weekend, null, v);
  }
  type Line = PatternLine & { slot: Slot; quiet: boolean };
  const lines: Line[] = [];
  for (const slot of slots.values()) {
    const recent = slot.notes.slice(0, 6); // the last six notes in that slot: a place's old habits fade
    if (recent.length < PATTERN_MIN) continue;
    const of = recent.length;
    const every = of === slot.notes.length; // "your three" rather than "your last three"
    const when = ui().places.slot(slot.part, slot.day, slot.weekend);
    const quiet = recent.filter((v) => v.busy === 'empty').length;
    const busy = recent.filter((v) => v.busy === 'crowded').length;
    if (quiet / of >= 0.6) lines.push({ slot, quiet: true, count: quiet, of, text: ui().places.quietLine(quiet, of, every, when) });
    else if (busy / of >= 0.6) lines.push({ slot, quiet: false, count: busy, of, text: ui().places.busyLine(busy, of, every, when) });
  }
  // A line about one day ("Sunday mornings") says it better than the weekend line it is part of.
  const kept = lines.filter(
    (l) => l.slot.day != null || !lines.some((o) => o.slot.day != null && o.quiet === l.quiet && o.slot.part === l.slot.part && o.slot.weekend === l.slot.weekend),
  );
  kept.sort((a, b) => b.of - a.of || b.count / b.of - a.count / a.of || Number(b.quiet) - Number(a.quiet));
  return kept.slice(0, max).map(({ text, count, of }) => ({ text, count, of }));
}

// ---- One place for today (home screen) --------------------------------------------

export interface PlacedVisit extends Visit {
  placeId: number;
}

/** How long "Hide" keeps a place off the home screen. */
export const HOME_HIDE_MS = 7 * 24 * 60 * 60 * 1000;

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * The one place to show on the home screen now, if any: the place you've run
 * most often at this time of day, counting this weekday double. One earlier
 * run on this weekday at this time is enough, or two at this time on any
 * day. Not a place you've already run today, and not one you hid
 * (`hidden`: place id → hidden until, epoch ms). A single place from your own
 * runs, never a prediction about it.
 */
export function homePlace(placeIds: number[], visits: PlacedVisit[], now: number, hidden: Record<number, number> = {}): number | null {
  const ids = new Set(placeIds);
  const part = dayPart(now);
  const day = new Date(now).getDay();
  const score = new Map<number, { s: number; last: number }>();
  const ranToday = new Set<number>();
  for (const v of visits) {
    if (!ids.has(v.placeId) || v.at > now) continue;
    if (sameDay(v.at, now)) {
      ranToday.add(v.placeId);
      continue;
    }
    if (dayPart(v.at) !== part) continue;
    const cur = score.get(v.placeId) ?? { s: 0, last: 0 };
    cur.s += new Date(v.at).getDay() === day ? 2 : 1;
    cur.last = Math.max(cur.last, v.at);
    score.set(v.placeId, cur);
  }
  let best: { id: number; s: number; last: number } | null = null;
  for (const [id, { s, last }] of score) {
    if (s < 2 || ranToday.has(id) || (hidden[id] ?? 0) > now) continue;
    if (!best || s > best.s || (s === best.s && last > best.last)) best = { id, s, last };
  }
  return best?.id ?? null;
}

/** The runner's own latest words about a place: the newest visit with a note. */
export function latestNote<V extends Visit>(visits: V[]): V | null {
  let best: V | null = null;
  for (const v of visits) if (v.note && v.note.trim() && (!best || v.at > best.at)) best = v;
  return best;
}

/** The dated log grouped by month, newest first, so seasons show without a chart. */
export function byMonth<V extends Visit>(visits: V[]): Array<{ year: number; month: number; visits: V[] }> {
  const out: Array<{ year: number; month: number; visits: V[] }> = [];
  for (const v of [...visits].sort((a, b) => b.at - a.at)) {
    const d = new Date(v.at);
    const last = out[out.length - 1];
    if (last && last.year === d.getFullYear() && last.month === d.getMonth()) last.visits.push(v);
    else out.push({ year: d.getFullYear(), month: d.getMonth(), visits: [v] });
  }
  return out;
}
