// The area of a saved map: a box around a place or a route, and how many
// tiles that box takes. Pure, tested in Node (npm run test:routes).

/** [west, south, east, north], as MapLibre wants it. */
export type Box = [number, number, number, number];

/** Zoom 8 to 14: the street tiles stop at 14 and the map draws closer zooms from them. */
export const MIN_ZOOM = 8;
export const MAX_ZOOM = 14;
/** Around here: this far each way. */
export const AROUND_KM = 8;
/** Along a route: this much either side. */
export const ROUTE_PAD_KM = 1.5;
/** Past this the box is too big for one saved map. */
export const MAX_TILES = 4000;
/** A street tile at these zooms is about this big, on average, for the estimate shown before saving. */
export const TILE_KB = 45;

const KM_PER_DEG_LAT = 111.32;

function clampLat(lat: number) {
  return Math.max(-85, Math.min(85, lat));
}

export function boxAround(lat: number, lon: number, km = AROUND_KM): Box {
  const dLat = km / KM_PER_DEG_LAT;
  const dLon = km / (KM_PER_DEG_LAT * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, clampLat(lat - dLat), lon + dLon, clampLat(lat + dLat)];
}

export function boxOfPath(path: Array<{ lat: number; lon: number }>, padKm = ROUTE_PAD_KM): Box | null {
  if (!path.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of path) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  const mid = (s + n) / 2;
  const dLat = padKm / KM_PER_DEG_LAT;
  const dLon = padKm / (KM_PER_DEG_LAT * Math.max(0.05, Math.cos((mid * Math.PI) / 180)));
  return [w - dLon, clampLat(s - dLat), e + dLon, clampLat(n + dLat)];
}

function tileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function tileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Tiles the box covers from minZ to maxZ. */
export function tileCount(box: Box, minZ = MIN_ZOOM, maxZ = MAX_ZOOM): number {
  let n = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const x = tileX(box[2], z) - tileX(box[0], z) + 1;
    const y = tileY(box[1], z) - tileY(box[3], z) + 1;
    n += x * y;
  }
  return n;
}

/** Rough megabytes for the box, for "about 12 MB" before saving. */
export function roughMb(box: Box): number {
  return Math.max(1, Math.round((tileCount(box) * TILE_KB) / 1024));
}
