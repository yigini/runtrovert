import type { ImportedRun } from './io/types';

/**
 * The phone's half of the phone <-> watch contract (docs/WATCHES.md; the watch's
 * half is wear/app/src/main/java/app/runtrovert/wear/Protocol.kt). Pure, so it
 * runs under plain Node in test:heart.
 */

export const PATHS = {
  live: '/runtrovert/live',
  split: '/runtrovert/split',
  cmd: '/runtrovert/cmd',
  hello: '/runtrovert/hello',
  hr: '/runtrovert/hr',
  run: '/runtrovert/run', // watch → phone: a run recorded on the watch alone, in pieces
  runAck: '/runtrovert/runack', // phone → watch: kept (or can't be read), the watch may let it go
} as const;

/** idle, recording, paused, or halted: stopped, the finish screen asking keep or discard. */
export type WatchStatus = 'idle' | 'running' | 'paused' | 'autopaused' | 'halted';
export type WatchCommand = 'start' | 'pause' | 'resume' | 'stop';

export interface LiveForWatch {
  status: WatchStatus;
  distanceM: number;
  durationS: number;
  unitsKm: boolean;
}

/** needsOpen: a Start came while the app was in the background; the watch opens it on the phone. */
export function liveJson(l: LiveForWatch, needsOpen = false): string {
  const o: Record<string, unknown> = { status: l.status, distanceM: Math.round(l.distanceM * 10) / 10, durationS: Math.round(l.durationS * 10) / 10, unitsKm: l.unitsKm };
  if (needsOpen) o.needsOpen = true;
  return JSON.stringify(o);
}

export function splitJson(index: number, durationS: number, distanceM: number, totalS: number, unitsKm: boolean): string {
  return JSON.stringify({ index, durationS, distanceM, totalS, unitsKm });
}

export function parseCommand(data: string): WatchCommand | null {
  try {
    const c = JSON.parse(data)?.cmd;
    return c === 'start' || c === 'pause' || c === 'resume' || c === 'stop' ? c : null;
  } catch {
    return null;
  }
}

export function parseHello(data: string): boolean | null {
  try {
    const o = JSON.parse(data)?.open;
    return typeof o === 'boolean' ? o : null;
  } catch {
    return null;
  }
}

/** Heart-rate samples from the watch, [epoch ms, bpm]. Anything odd is dropped. */
export function parseHeart(data: string): Array<[number, number]> {
  try {
    const s = JSON.parse(data)?.s;
    if (!Array.isArray(s)) return [];
    return s.filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 25 && p[1] <= 250).map((p) => [Math.round(p[0]), Math.round(p[1])]);
  } catch {
    return [];
  }
}

/** How long the watch counts as looking after its last "I'm open" (it repeats every 30 s). */
export const OPEN_FOR_MS = 45_000;

/**
 * Whether a live update goes to the watch now. With the watch app open, once a
 * second; with it closed, only when the state changes (it wakes the watch).
 */
export function shouldSend(now: number, last: { at: number; status: WatchStatus } | null, status: WatchStatus, watchOpenUntil: number): boolean {
  if (!last || last.status !== status) return true;
  if (now < watchOpenUntil) return now - last.at >= 1000;
  return false;
}

// ---- Runs recorded on the watch alone (phase 3) -------------------------------

/** One piece of a watch run: the JSON is cut into pieces that fit in a message. */
export interface RunChunk {
  id: string;
  part: number; // 0-based
  of: number;
  d: string;
}

export function parseRunChunk(data: string): RunChunk | null {
  try {
    const o = JSON.parse(data);
    if (typeof o?.id !== 'string' || !o.id || typeof o.d !== 'string') return null;
    if (!Number.isInteger(o.part) || !Number.isInteger(o.of) || o.of < 1 || o.of > 500 || o.part < 0 || o.part >= o.of) return null;
    return { id: o.id, part: o.part, of: o.of, d: o.d };
  } catch {
    return null;
  }
}

/** Pieces that have arrived, by run id. A run that stops arriving is dropped after ten minutes; the watch sends it again. */
export type ChunkStore = Map<string, { of: number; parts: Array<string | undefined>; at: number }>;

/** Adds a piece; the whole JSON once every piece is in, otherwise null. */
export function addRunChunk(store: ChunkStore, c: RunChunk, now: number): string | null {
  for (const [id, v] of store) if (now - v.at > 10 * 60_000) store.delete(id);
  let entry = store.get(c.id);
  if (!entry || entry.of !== c.of) {
    entry = { of: c.of, parts: new Array(c.of).fill(undefined), at: now };
    store.set(c.id, entry);
  }
  entry.parts[c.part] = c.d;
  entry.at = now;
  if (entry.parts.some((p) => p === undefined)) return null;
  store.delete(c.id);
  return entry.parts.join('');
}

export function runAckJson(id: string, ok: boolean): string {
  return JSON.stringify({ id, ok });
}

/**
 * A watch run as an imported run. The watch sends
 * { v: 1, id, startedAt, endedAt, movingS, distanceM, climbM|null,
 *   pauses: [[from, to]], p: [[ts, lat, lon, alt|null]], hr: [[ts, bpm]] }.
 * The track is cut at each pause, so the gap isn't counted as running.
 */
export function watchRunToImported(json: string): ImportedRun | null {
  let o: any;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || o.v !== 1 || typeof o.id !== 'string' || !Number.isFinite(o.startedAt) || !Number.isFinite(o.endedAt) || o.endedAt <= o.startedAt) return null;
  const pauses: Array<[number, number]> = (Array.isArray(o.pauses) ? o.pauses : []).filter((p: unknown) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > p[0]);
  const points = (Array.isArray(o.p) ? o.p : [])
    .filter((p: unknown) => Array.isArray(p) && Number.isFinite(p[0]) && Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 180 && !(p[1] === 0 && p[2] === 0))
    .map((p: number[]) => ({ ts: p[0], lat: p[1], lon: p[2], alt: Number.isFinite(p[3]) ? p[3] : null }))
    .sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
  const segments: ImportedRun['segments'] = [];
  let seg: ImportedRun['segments'][number] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && pauses.some(([a, b]) => points[i - 1].ts < b && points[i].ts > a)) {
      if (seg.length) segments.push(seg);
      seg = [];
    }
    seg.push(points[i]);
  }
  if (seg.length) segments.push(seg);
  const heart = (Array.isArray(o.hr) ? o.hr : [])
    .filter((h: unknown) => Array.isArray(h) && Number.isFinite(h[0]) && Number.isFinite(h[1]) && h[1] >= 25 && h[1] <= 250)
    .map((h: number[]) => ({ ts: Math.round(h[0]), bpm: Math.round(h[1]) }))
    .sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
  return {
    segments,
    startedAt: o.startedAt,
    endedAt: o.endedAt,
    distanceM: Number.isFinite(o.distanceM) && o.distanceM > 0 ? o.distanceM : null,
    movingS: Number.isFinite(o.movingS) && o.movingS > 0 ? o.movingS : null,
    elevationGainM: Number.isFinite(o.climbM) && o.climbM >= 0 ? o.climbM : null,
    sport: 'running',
    name: null,
    externalId: `watch:${o.id}`,
    heart,
  };
}
