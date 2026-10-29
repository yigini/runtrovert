// The route on a share card is a bare line on a pastel ground: no map, no
// streets, and the first and last 300 m cut off so it doesn't start at a front
// door. The shape can still be recognisable, so the share sheet keeps it off
// by default. Pure, so `npm run test:progress` can check it under plain Node.

import type { LatLon } from './types';

export const TRIM_M = 300;

function metres(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lerp(a: LatLon, b: LatLon, f: number): LatLon {
  return { latitude: a.latitude + (b.latitude - a.latitude) * f, longitude: a.longitude + (b.longitude - a.longitude) * f };
}

/**
 * Cut `trim` metres off both ends. Returns null when too little is left to
 * draw (under 400 m), in which case the card shows no route at all.
 */
export function trimEnds(path: LatLon[], trim = TRIM_M): LatLon[] | null {
  if (path.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metres(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  if (total - 2 * trim < 400) return null;
  const at = (d: number): LatLon => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const span = cum[i] - cum[i - 1];
    return lerp(path[i - 1], path[i], span > 0 ? (d - cum[i - 1]) / span : 0);
  };
  const from = trim;
  const to = total - trim;
  const out: LatLon[] = [at(from)];
  for (let i = 0; i < path.length; i++) if (cum[i] > from && cum[i] < to) out.push(path[i]);
  out.push(at(to));
  return out;
}

/**
 * An SVG path for the trimmed route, fitted and centred in a w × h box with
 * `pad` around it. Flat projection with longitude squeezed by cos(latitude),
 * which is plenty for a run-sized area. At most ~400 points.
 */
export function routePath(path: LatLon[], w: number, h: number, pad = 0): string | null {
  const pts = trimEnds(path);
  if (!pts) return null;
  const lat0 = pts.reduce((a, p) => a + p.latitude, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map((p) => [p.longitude * k, -p.latitude]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of xy) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanY * s) / 2;
  const step = Math.max(1, Math.ceil(xy.length / 400));
  const kept = xy.filter((_, i) => i % step === 0 || i === xy.length - 1);
  return kept
    .map(([x, y], i) => `${i ? 'L' : 'M'}${((x - minX) * s + ox).toFixed(1)} ${((y - minY) * s + oy).toFixed(1)}`)
    .join(' ');
}
