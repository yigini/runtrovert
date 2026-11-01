import type { ImportedRun, SkipReason, TrackPoint } from './types';
import { ui } from '../i18n/ui';

// Turns a parsed activity into the numbers a Runtrovert run stores, and
// decides whether it's one we already have. Pure, so it's tested in Node.

/** A gap longer than this with hardly any movement is a pause, not running time. */
const PAUSE_GAP_S = 20;
const PAUSE_MOVE_M = 25;
/** Ignore height wiggles smaller than this, like the recorder's own GPS fallback. */
const CLIMB_STEP_M = 3;
/** Faster than this on average is a bike, a car or a train. */
const MAX_RUN_MPS = 7.5;

export interface ShapedRun {
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number; // moving time
  elevationGainM: number;
  points: TrackPoint[];
  kmSplits: Array<{ index: number; distanceM: number; durationS: number; atDistanceM: number; atDurationS: number }>;
  externalId: string | null;
}

function metres(a: TrackPoint, b: TrackPoint): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const NOT_RUNS = /cycl|bik|ride|swim|walk|hik|ski|row|kayak|paddl|drive|motor|sail|skat|^(1|2|5|11|17)$/;

export function isRunSport(sport: string | null): boolean {
  return sport == null || !NOT_RUNS.test(sport);
}

interface Walk {
  dist: number;
  moving: number;
  gain: number;
  splits: ShapedRun['kmSplits'];
}

/** Walk the track once: distance, moving time, climb, and a km split each time 1000 m pass. `k` stretches each step. */
function walk(segments: TrackPoint[][], k = 1): Walk {
  let dist = 0;
  let moving = 0;
  let gain = 0;
  const splits: Walk['splits'] = [];
  let lastD = 0;
  let lastT = 0;
  for (const seg of segments) {
    let base: number | null = seg[0].alt;
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1];
      const b = seg[i];
      const raw = metres(a, b);
      const d = raw * k;
      const dt = (b.ts - a.ts) / 1000;
      if (dt <= 0) continue;
      if (!(dt > PAUSE_GAP_S && raw < PAUSE_MOVE_M)) {
        // Cross each kilometre on the way, sharing the step's time out.
        while (d > 0 && dist + d >= (splits.length + 1) * 1000) {
          const atD = (splits.length + 1) * 1000;
          const atT = moving + (dt * (atD - dist)) / d;
          splits.push({ index: splits.length + 1, distanceM: atD - lastD, durationS: atT - lastT, atDistanceM: atD, atDurationS: atT });
          lastD = atD;
          lastT = atT;
        }
        dist += d;
        moving += dt;
      }
      if (b.alt != null) {
        if (base == null) base = b.alt;
        else if (b.alt - base >= CLIMB_STEP_M) {
          gain += b.alt - base;
          base = b.alt;
        } else if (b.alt < base) base = b.alt;
      }
    }
  }
  return { dist, moving, gain, splits };
}

/** The run, or why it can't be one. */
export function shapeRun(r: ImportedRun): ShapedRun | SkipReason {
  if (!isRunSport(r.sport)) return 'not-a-run';
  const segments = r.segments.filter((s) => s.length > 0);
  const points = segments.flat();
  const w = walk(segments);
  const startedAt = r.startedAt ?? points[0]?.ts ?? null;
  const endedAt = r.endedAt ?? points[points.length - 1]?.ts ?? null;
  if (startedAt == null || endedAt == null) return 'no-times';
  // The watch's own totals win: it measured with more than the points it kept.
  const fileDist = r.distanceM != null && r.distanceM > 0 ? r.distanceM : null;
  const distanceM = fileDist ?? w.dist;
  const durationS = Math.round(r.movingS != null && r.movingS > 0 ? r.movingS : w.moving);
  const elevationGainM = Math.round(r.elevationGainM ?? w.gain);
  if (distanceM < 200 || durationS < 60) return 'too-short';
  if (distanceM / durationS > MAX_RUN_MPS) return 'too-fast';
  // When the watch's distance differs from the track's, stretch the splits to match it.
  const splits = fileDist != null && w.dist > 0 && Math.abs(fileDist / w.dist - 1) > 0.001 ? walk(segments, fileDist / w.dist).splits : w.splits;
  return { startedAt, endedAt, distanceM, durationS, elevationGainM, points, kmSplits: splits, externalId: r.externalId };
}

export interface KnownRun {
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  externalId?: string | null;
}

/**
 * Is this the same run as one we already have? The same id, or two runs whose
 * times overlap by more than half of the shorter one (the phone and a watch
 * both recorded it), or that start within three minutes with a similar distance.
 */
export function sameRun(a: KnownRun, b: KnownRun): boolean {
  if (a.externalId && b.externalId && a.externalId === b.externalId) return true;
  const aEnd = a.endedAt ?? a.startedAt;
  const bEnd = b.endedAt ?? b.startedAt;
  const overlap = Math.min(aEnd, bEnd) - Math.max(a.startedAt, b.startedAt);
  const shorter = Math.min(aEnd - a.startedAt, bEnd - b.startedAt);
  if (shorter > 0 && overlap > shorter / 2) return true;
  const near = Math.abs(a.startedAt - b.startedAt) < 3 * 60000;
  const similar = Math.abs(a.distanceM - b.distanceM) <= Math.max(150, 0.05 * Math.max(a.distanceM, b.distanceM));
  return near && similar;
}

/** Which reader a picked file needs, from its name and first bytes. 'zip' is a whole export; 'gzip' is one file squeezed (Strava's .fit.gz). */
export function sniff(name: string, head: Uint8Array): 'gpx' | 'fit' | 'tcx' | 'zip' | 'gzip' | null {
  const n = name.toLowerCase();
  if (head.length >= 12 && head[8] === 0x2e && head[9] === 0x46 && head[10] === 0x49 && head[11] === 0x54) return 'fit';
  if (head[0] === 0x1f && head[1] === 0x8b) return 'gzip';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (n.endsWith('.gz')) return 'gzip';
  if (n.endsWith('.zip')) return 'zip';
  if (n.endsWith('.fit')) return 'fit';
  const text = String.fromCharCode(...head.subarray(0, 512));
  if (n.endsWith('.tcx') || /<(?:[\w-]+:)?TrainingCenterDatabase\b/.test(text)) return 'tcx';
  if (n.endsWith('.gpx') || /<(?:[\w-]+:)?gpx\b/.test(text) || /^\s*(?:\uFEFF)?<\?xml/.test(text)) return 'gpx';
  return null;
}

/** A file name that sorts by date and says nothing else: 2026-10-12-0731-run.gpx */
export function runFileName(startedAt: number, ext: 'gpx' | 'fit'): string {
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-run.${ext}`;
}

export interface ImportTally {
  added: number;
  duplicate: number;
  notRun: number;
  unreadable: number;
  zipped: number;
  other: number;
}

export const EMPTY_TALLY: ImportTally = { added: 0, duplicate: 0, notRun: 0, unreadable: 0, zipped: 0, other: 0 };

export function tallySkips(skips: SkipReason[], into: ImportTally): ImportTally {
  for (const s of skips) {
    if (s === 'duplicate') into.duplicate++;
    else if (s === 'not-a-run' || s === 'too-fast') into.notRun++;
    else if (s === 'unreadable') into.unreadable++;
    else into.other++;
  }
  return into;
}

/** The quiet sentence after an import. */
export function importLine(t: ImportTally): string {
  const parts: string[] = [];
  if (t.added) parts.push(ui().shape.broughtIn(t.added));
  else parts.push(ui().shape.nothingNewToBringIn);
  if (t.duplicate) parts.push(ui().shape.alreadyHere(t.duplicate));
  if (t.notRun) parts.push(ui().shape.notRuns(t.notRun));
  if (t.unreadable) parts.push(ui().shape.unreadable(t.unreadable));
  if (t.zipped) parts.push(ui().shape.zipped(t.zipped));
  if (t.other) parts.push(ui().shape.other(t.other));
  return parts.join(' ');
}
