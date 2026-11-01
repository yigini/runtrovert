import { TAG, attr, child } from './gpx';
import { simplify, pathLength, type Pt } from '../routeFollow';

// A route to follow, from a file: a GPX route or track (Komoot, Strava routes,
// Garmin courses exported as GPX, any mapping site) or a TCX course. Times
// don't matter here, so a planned route, which can't be a run, is exactly
// what's wanted. Pure, tested in Node.

export interface ParsedRoute {
  name: string | null;
  path: Pt[];
  distanceM: number;
}

function pointsOf(body: string, tag: string): Pt[] {
  const out: Pt[] = [];
  for (const m of body.matchAll(TAG(tag))) {
    const lat = Number(attr(m[1], 'lat'));
    const lon = Number(attr(m[1], 'lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ lat, lon });
  }
  return out;
}

function tcxPoints(body: string): Pt[] {
  const out: Pt[] = [];
  for (const m of body.matchAll(TAG('Trackpoint'))) {
    const lat = Number(child(m[2], 'LatitudeDegrees'));
    const lon = Number(child(m[2], 'LongitudeDegrees'));
    if (m[2] && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ lat, lon });
  }
  return out;
}

function finish(name: string | null, raw: Pt[]): ParsedRoute | null {
  if (raw.length < 2) return null;
  const path = simplify(raw, 3);
  const distanceM = pathLength(raw);
  return distanceM >= 100 ? { name: name?.trim() || null, path, distanceM } : null;
}

/** Every route in the file: each GPX <rte> and <trk>, or each TCX <Course> and <Activity>. Empty when there is none. */
export function parseRoutes(text: string): ParsedRoute[] {
  const out: ParsedRoute[] = [];
  if (/<(?:[\w-]+:)?gpx\b/.test(text)) {
    const fileName = child(text.split(/<(?:[\w-]+:)?(?:trk|rte)\b/)[0], 'name');
    for (const r of text.matchAll(TAG('rte'))) {
      const body = r[2] ?? '';
      const got = finish(child(body.split(/<(?:[\w-]+:)?rtept\b/)[0], 'name') ?? fileName, pointsOf(body, 'rtept'));
      if (got) out.push(got);
    }
    for (const t of text.matchAll(TAG('trk'))) {
      const body = t[2] ?? '';
      const got = finish(child(body.split(/<(?:[\w-]+:)?trkseg\b/)[0], 'name') ?? fileName, pointsOf(body, 'trkpt'));
      if (got) out.push(got);
    }
  } else if (/<(?:[\w-]+:)?TrainingCenterDatabase\b/.test(text)) {
    for (const c of text.matchAll(TAG('Course'))) {
      const body = c[2] ?? '';
      const got = finish(child(body.split(/<(?:[\w-]+:)?Lap\b|<(?:[\w-]+:)?Track\b/)[0], 'Name'), tcxPoints(body));
      if (got) out.push(got);
    }
    for (const a of text.matchAll(TAG('Activity'))) {
      const got = finish(null, tcxPoints(a[2] ?? ''));
      if (got) out.push(got);
    }
  }
  return out;
}
