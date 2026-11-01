import type { HeartSample } from '../heart';
import { TAG, attr, child } from './gpx';
import { plausibleBpm, type ImportedRun, type ParseResult, type TrackPoint } from './types';

// TCX, Garmin's older training format. Strava's archive keeps many runs only
// as .tcx.gz, and Garmin's export has them too. Same approach as GPX: a few
// tags read with tolerant patterns, no DOM. A treadmill run has laps and no
// positions; it comes in with its totals and no route.

const num = (s: string | null): number | null => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Every activity in a TCX file. Each <Activity> is one; each <Track> in it a piece between pauses. */
export function parseTcx(text: string): ParseResult {
  const out: ParseResult = { runs: [], skipped: [] };
  if (!/<(?:[\w-]+:)?TrainingCenterDatabase\b/.test(text)) {
    out.skipped.push('unreadable');
    return out;
  }
  for (const act of text.matchAll(TAG('Activity'))) {
    const sport = attr(act[1], 'Sport')?.toLowerCase() ?? null;
    const body = act[2] ?? '';
    const segments: TrackPoint[][] = [];
    const heart: HeartSample[] = [];
    let lapStart: number | null = null;
    let totalS = 0;
    let totalM = 0;
    let hasTotals = false;
    for (const lap of body.matchAll(TAG('Lap'))) {
      const st = Date.parse(attr(lap[1], 'StartTime') ?? '');
      if (Number.isFinite(st) && (lapStart == null || st < lapStart)) lapStart = st;
      const lapBody = lap[2] ?? '';
      // The lap's own totals come before its Track; read them from the part before it.
      const head = lapBody.split(/<(?:[\w-]+:)?Track\b/)[0];
      const s = num(child(head, 'TotalTimeSeconds'));
      const m = num(child(head, 'DistanceMeters'));
      if (s != null) (totalS += s), (hasTotals = true);
      if (m != null) totalM += m;
      for (const trk of lapBody.matchAll(TAG('Track'))) {
        const seg: TrackPoint[] = [];
        for (const tp of (trk[2] ?? '').matchAll(TAG('Trackpoint'))) {
          const b = tp[2] ?? '';
          const ts = Date.parse(child(b, 'Time') ?? '');
          if (!Number.isFinite(ts)) continue;
          const bpm = num(child(child(b, 'HeartRateBpm') ?? '', 'Value'));
          if (bpm != null && plausibleBpm(bpm)) heart.push({ ts, bpm: Math.round(bpm) });
          const lat = num(child(b, 'LatitudeDegrees'));
          const lon = num(child(b, 'LongitudeDegrees'));
          if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
          seg.push({ ts, lat, lon, alt: num(child(b, 'AltitudeMeters')) });
        }
        if (seg.length) segments.push(seg.sort((a, b) => a.ts - b.ts));
      }
    }
    const id = child(body.split(/<(?:[\w-]+:)?Lap\b/)[0], 'Id');
    const idTs = id ? Date.parse(id) : NaN;
    const startedAt = lapStart ?? (Number.isFinite(idTs) ? idTs : (segments[0]?.[0]?.ts ?? null));
    if (startedAt == null) {
      out.skipped.push('no-times');
      continue;
    }
    const lastPt = segments.length ? segments[segments.length - 1][segments[segments.length - 1].length - 1].ts : null;
    // With no route the laps are all there is; with one, the points say when it ended.
    const endedAt = lastPt ?? (hasTotals ? startedAt + totalS * 1000 : null);
    if (!segments.length && !(hasTotals && totalM > 0)) {
      out.skipped.push('too-short');
      continue;
    }
    out.runs.push({
      segments,
      startedAt,
      endedAt,
      distanceM: totalM > 0 ? totalM : null,
      movingS: hasTotals && totalS > 0 ? totalS : null,
      elevationGainM: null,
      sport,
      name: child(body.split(/<(?:[\w-]+:)?Lap\b/)[0], 'Notes'),
      externalId: null,
      heart: heart.sort((a, b) => a.ts - b.ts),
    });
  }
  if (!out.runs.length && !out.skipped.length) out.skipped.push(/<(?:[\w-]+:)?Course\b/.test(text) ? 'no-times' : 'too-short');
  return out;
}
