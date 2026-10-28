/**
 * Crash recovery. The live run state is snapshotted to SQLite every few
 * seconds and on every transition. If the OS kills the app mid-run, the next
 * launch finds the snapshot, rebuilds the in-memory state, re-attaches to the
 * location engine (which on Android may still be running as a foreground
 * service) and carries on. The runner sees a run that never stopped.
 */
import { getDb } from '../db';

export interface RunSnapshot {
  runId: number;
  status: 'running' | 'paused' | 'autopaused';
  startedAt: number;
  distanceM: number;
  elevationGainM: number;
  accumulatedS: number; // active seconds before the open segment
  segmentStartedAt: number | null;
  kmMarkDistance: number;
  kmMarkDuration: number;
  lapMarkDistance: number;
  lapMarkDuration: number;
  splitCount: number;
  lapCount: number;
  savedAt: number;
}

const KEY = 'live-run';

export async function saveSnapshot(s: RunSnapshot): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', KEY, JSON.stringify(s));
}

export async function loadSnapshot(): Promise<RunSnapshot | null> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', KEY)) as { value: string } | null;
  if (!row) return null;
  try {
    const s = JSON.parse(row.value) as RunSnapshot;
    return typeof s.runId === 'number' ? s : null;
  } catch {
    return null;
  }
}

export async function clearSnapshot(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?', KEY);
}
