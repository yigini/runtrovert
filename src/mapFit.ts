import type { LatLon } from './types';

/**
 * Fit a route into a map view ourselves instead of asking MapLibre to do it.
 * The native fit measures the view at the moment the camera is attached; on
 * Android that can happen before layout, with a 0×0 view, and the "fit" comes
 * back as zoom 0: the whole world. Here we wait for onLayout and do the
 * Web Mercator maths in JS, so the answer never depends on native timing.
 */

export type Bounds = [number, number, number, number]; // west, south, east, north
export type Padding = { top: number; right: number; bottom: number; left: number };

const TILE = 512; // MapLibre's world is 512 px wide at zoom 0
const MAX_LAT = 85.051129;

export function boundsFor(path: LatLon[]): Bounds | null {
  if (path.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of path) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  if (!Number.isFinite(minLat)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/** Longitude/latitude to Web Mercator, 0..1 on both axes (y grows south). */
function project(lon: number, lat: number): [number, number] {
  const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((l * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

function unproject(x: number, y: number): [number, number] {
  const lon = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lon, lat];
}

/**
 * Center and zoom that show `bounds` inside a `width`×`height` view, keeping
 * `padding` clear (e.g. under text laid over the map). A route that is one
 * point, or a few metres long, gets `maxZoom` rather than an absurd close-up.
 */
export function fitBounds(
  bounds: Bounds,
  width: number,
  height: number,
  padding: Padding = { top: 0, right: 0, bottom: 0, left: 0 },
  maxZoom = 16.5,
): { center: [number, number]; zoom: number } {
  const [west, south, east, north] = bounds;
  const [x1, y1] = project(west, north);
  const [x2, y2] = project(east, south);
  const dx = Math.max(x2 - x1, 1e-12);
  const dy = Math.max(y2 - y1, 1e-12);

  // Never let padding eat the whole view: keep at least a third for the route.
  const innerW = Math.max(width - padding.left - padding.right, width / 3);
  const innerH = Math.max(height - padding.top - padding.bottom, height / 3);

  const zoom = Math.max(0, Math.min(maxZoom, Math.log2(Math.min(innerW / dx, innerH / dy) / TILE)));
  const world = TILE * 2 ** zoom;

  // Middle of the route, then shift so it sits in the middle of the clear area.
  const cx = (x1 + x2) / 2 + (padding.right - padding.left) / 2 / world;
  const cy = (y1 + y2) / 2 + (padding.bottom - padding.top) / 2 / world;
  return { center: unproject(cx, cy), zoom };
}
