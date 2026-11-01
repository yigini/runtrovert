// Runs that arrive from somewhere other than this phone's own recording.
// Everything here is plain data so the parsers stay pure and testable.

/** Where a run came from. null on a run means it was recorded here. 'health' is kept for Health Connect later; 'manual' is a run typed in by hand. */
export type SourceKind = 'gpx' | 'fit' | 'health' | 'manual';

export interface TrackPoint {
  ts: number; // epoch ms
  lat: number;
  lon: number;
  alt: number | null;
}

/** One activity as a file describes it, before it becomes a run. */
export interface ImportedRun {
  /** Track pieces. A gap between pieces is a pause (a GPX trkseg, a FIT timer stop). */
  segments: TrackPoint[][];
  /** From the file when it says so (FIT sessions do); otherwise worked out from the points. */
  startedAt: number | null;
  endedAt: number | null;
  distanceM: number | null;
  movingS: number | null;
  elevationGainM: number | null;
  /** The file's own word for the activity: 'running', 'cycling', a FIT sport number as text, or null. */
  sport: string | null;
  name: string | null;
  /** Something stable that names this activity wherever it is seen again (FIT serial + time, a Health Connect id). */
  externalId: string | null;
  /** Heart rate from the file (GPX extensions, FIT records), sorted by time. Absent or empty when it has none. */
  heart?: Array<{ ts: number; bpm: number }>;
}

/** A believable heart rate. Anything else (0, the 255 "no reading" marker) is dropped. */
export function plausibleBpm(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 240;
}

/** Why a file, or one activity in it, was not brought in. */
export type SkipReason = 'not-a-run' | 'no-times' | 'too-short' | 'unreadable' | 'duplicate' | 'too-fast';

export interface ParseResult {
  runs: ImportedRun[];
  skipped: SkipReason[];
}
