import type { ImportedRun, ParseResult, TrackPoint } from './types';

// GPX in and out, on the phone. No DOM in React Native, so this reads the few
// tags a run needs with patterns that tolerate namespaces (gpx:trkpt),
// either attribute order, self-closing points and the extensions Garmin,
// Strava, Coros, Suunto and Polar add (heart rate and so on, ignored).

const TAG = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}\\s*>)`, 'g');

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`).exec(attrs);
  return m ? m[2] : null;
}

function child(body: string | undefined, name: string): string | null {
  if (!body) return null;
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}\\s*>`).exec(body);
  return m ? decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()) : null;
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function encode(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function points(body: string, tag: 'trkpt' | 'rtept'): { pts: TrackPoint[]; untimed: number } {
  const pts: TrackPoint[] = [];
  let untimed = 0;
  for (const m of body.matchAll(TAG(tag))) {
    const lat = Number(attr(m[1], 'lat'));
    const lon = Number(attr(m[1], 'lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const t = child(m[2], 'time');
    const ts = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(ts)) {
      untimed++;
      continue;
    }
    const e = child(m[2], 'ele');
    const alt = e != null && e !== '' && Number.isFinite(Number(e)) ? Number(e) : null;
    pts.push({ ts, lat, lon, alt });
  }
  return { pts, untimed };
}

/** Every track in a GPX file. Each <trk> is one activity; each <trkseg> in it is a piece between pauses. */
export function parseGpx(text: string): ParseResult {
  const out: ParseResult = { runs: [], skipped: [] };
  if (!/<(?:[\w-]+:)?gpx\b/.test(text)) {
    out.skipped.push('unreadable');
    return out;
  }
  for (const trk of text.matchAll(TAG('trk'))) {
    const body = trk[2] ?? '';
    const segments: TrackPoint[][] = [];
    let untimed = 0;
    const segs = [...body.matchAll(TAG('trkseg'))];
    for (const s of segs.length ? segs : [[body, '', body] as unknown as RegExpMatchArray]) {
      const r = points(s[2] ?? '', 'trkpt');
      untimed += r.untimed;
      const sorted = r.pts.sort((a, b) => a.ts - b.ts);
      if (sorted.length) segments.push(sorted);
    }
    if (!segments.length) {
      out.skipped.push(untimed ? 'no-times' : 'too-short');
      continue;
    }
    // Strava writes the name and type on the track; some apps only in <metadata>.
    const head = body.split(/<(?:[\w-]+:)?trkseg\b/)[0];
    out.runs.push({
      segments,
      startedAt: null,
      endedAt: null,
      distanceM: null,
      movingS: null,
      elevationGainM: null,
      sport: child(head, 'type')?.toLowerCase() ?? null,
      name: child(head, 'name'),
      externalId: null,
    });
  }
  // A planned route has no times, so it can't be a run. Say so rather than staying silent.
  if (!out.runs.length && !out.skipped.length && /<(?:[\w-]+:)?rte\b/.test(text)) out.skipped.push('no-times');
  if (!out.runs.length && !out.skipped.length) out.skipped.push('too-short');
  return out;
}

export interface ExportRun {
  startedAt: number;
  name?: string;
  points: Array<{ ts: number; lat: number; lon: number; alt: number | null }>;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * One run as GPX 1.1. Only the route, heights and times go in: notes, energy
 * and busyness stay on the phone. Readable by Strava, Garmin Connect,
 * Komoot, Runalyze and every mapping app.
 */
export function writeGpx(run: ExportRun): string {
  const name = run.name ?? `Run, ${new Date(run.startedAt).toISOString().slice(0, 10)}`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Runtrovert" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><time>${iso(run.startedAt)}</time></metadata>`,
    '  <trk>',
    `    <name>${encode(name)}</name>`,
    '    <type>running</type>',
    '    <trkseg>',
  ];
  for (const p of run.points) {
    const ele = p.alt != null && Number.isFinite(p.alt) ? `<ele>${p.alt.toFixed(1)}</ele>` : '';
    lines.push(`      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${iso(p.ts)}</time></trkpt>`);
  }
  lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
  return lines.join('\n');
}
