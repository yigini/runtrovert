import { File } from 'expo-file-system';
import { getDb } from './db';
import { parseRoutes } from './io/route';
import { gunzip, isGzip, text } from './io/unzip';
import type { Pt } from './routeFollow';

// Routes kept to follow: brought in from a file (Komoot, a Strava route, a
// Garmin course, any GPX) and stored on this phone only, in the backup like
// everything else. A past run is followed straight from Your runs and needs
// no copy here.

export interface SavedRoute {
  id: number;
  name: string;
  createdAt: number;
  distanceM: number;
  path: Pt[];
}

const pack = (path: Pt[]) => JSON.stringify(path.map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lon * 1e6) / 1e6]));
const unpack = (s: string): Pt[] => (JSON.parse(s) as Array<[number, number]>).map(([lat, lon]) => ({ lat, lon }));

export async function listRoutes(): Promise<SavedRoute[]> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT * FROM routes ORDER BY created_at DESC')) as any[];
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, distanceM: r.distance_m, path: unpack(r.pts) }));
}

export async function deleteRoute(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM routes WHERE id = ?', id);
}

/** Keeps a route to follow later, from a past run. */
export async function keepRoute(name: string, path: Pt[], distanceM: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO routes (name, created_at, distance_m, pts, source) VALUES (?, ?, ?, ?, ?)', name, Date.now(), distanceM, pack(path), null);
}

/**
 * Opens the phone's file picker and keeps every route in the files picked.
 * null if nothing was picked; otherwise how many routes came in and how many
 * files had none.
 */
export async function pickAndKeepRoutes(fallbackName: (n: number) => string): Promise<{ added: number; empty: number } | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
  if (picked.canceled || !picked.result.length) return null;
  const db = await getDb();
  const existing = ((await db.getAllAsync('SELECT COUNT(*) AS n FROM routes')) as Array<{ n: number }>)[0]?.n ?? 0;
  let added = 0;
  let empty = 0;
  for (const f of picked.result) {
    let routes: ReturnType<typeof parseRoutes> = [];
    try {
      let bytes: Uint8Array = await f.bytes();
      if (isGzip(bytes)) bytes = gunzip(bytes);
      routes = parseRoutes(text(bytes));
    } catch {
      routes = [];
    }
    if (!routes.length) {
      empty++;
      continue;
    }
    for (const r of routes) {
      const name = r.name ?? f.name?.replace(/\.(gpx|tcx)(\.gz)?$/i, '') ?? fallbackName(existing + added + 1);
      await db.runAsync('INSERT INTO routes (name, created_at, distance_m, pts, source) VALUES (?, ?, ?, ?, ?)', name, Date.now(), r.distanceM, pack(r.path), f.name ?? null);
      added++;
    }
  }
  return { added, empty };
}
