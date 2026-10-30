/**
 * What launch does with a run that never got its Stop, when recovery could not
 * pick it up (no snapshot, or the restore threw). A run with a route is kept
 * and closed where its recording stopped; only a run with nothing in it goes.
 * Pure, so it runs under plain Node in test:recording.
 */

export interface UnfinishedRun {
  startedAt: number;
  durationS: number; // as last saved by the snapshot loop
  pointCount: number;
  lastPointTs: number | null;
}

/** endedAt to close it with, or null to delete it (fewer than two points: no route, no distance). */
export function salvageEnd(r: UnfinishedRun): number | null {
  if (r.pointCount < 2) return null;
  return Math.max(r.lastPointTs ?? r.startedAt, r.startedAt + r.durationS * 1000);
}
