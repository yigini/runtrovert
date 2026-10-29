/**
 * Rebuilding a run after the OS killed the app.
 *
 * While the app is dead, the background location task can still be woken
 * with fixes, but nothing in JS is recording. The engine keeps those fixes in
 * a buffer table instead of dropping them; on relaunch recovery replays them
 * through a fresh filter, starting from the last point that was saved, so the
 * route, distance and time between the last snapshot and the relaunch come
 * back instead of being lost.
 */
import { GpsFilter, type RawFix } from './kalman';

const MOVING_SPEED_MPS = 0.9; // same as tracking.ts

export interface ReplayResult {
  distanceM: number;
  points: Array<{ ts: number; lat: number; lon: number; alt: number | null; acc: number | null }>;
  /** Last fix that showed the runner moving: time counts up to here, not to the relaunch. */
  lastMovingTs: number | null;
  /** GPS altitudes in order, for the climb when there is no barometer. */
  alts: number[];
}

export function replayFixes(last: { lat: number; lon: number; ts: number; acc: number | null } | null, fixes: RawFix[]): ReplayResult {
  const out: ReplayResult = { distanceM: 0, points: [], lastMovingTs: null, alts: [] };
  const filter = new GpsFilter();
  if (last) filter.push({ lat: last.lat, lon: last.lon, acc: last.acc, alt: null, speed: null, ts: last.ts });
  const after = last?.ts ?? 0;
  const sorted = fixes.filter((f) => f.ts > after).sort((a, b) => a.ts - b.ts);
  for (const raw of sorted) {
    const fix = filter.push(raw);
    if (!fix) continue;
    if (fix.alt != null) out.alts.push(fix.alt);
    if (fix.stepM > 0) {
      out.distanceM += fix.stepM;
      out.points.push({ ts: fix.ts, lat: fix.lat, lon: fix.lon, alt: fix.alt, acc: fix.acc });
    }
    if (fix.stepM > 0 && fix.speed >= MOVING_SPEED_MPS) out.lastMovingTs = fix.ts;
  }
  return out;
}
