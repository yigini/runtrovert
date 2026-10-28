import * as SQLite from 'expo-sqlite';
import { DEFAULT_SETTINGS, type Mood, type Point, type Quiet, type Run, type Settings, type Split, type SplitKind } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('runtrovert.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          distance_m REAL NOT NULL DEFAULT 0,
          duration_s INTEGER NOT NULL DEFAULT 0,
          elevation_gain_m REAL NOT NULL DEFAULT 0,
          mood_before INTEGER,
          mood_after INTEGER,
          quiet TEXT,
          note TEXT
        );
        CREATE TABLE IF NOT EXISTS points (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          ts INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          alt REAL,
          acc REAL
        );
        CREATE INDEX IF NOT EXISTS idx_points_run ON points(run_id, ts);
        CREATE TABLE IF NOT EXISTS splits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          idx INTEGER NOT NULL,
          distance_m REAL NOT NULL,
          duration_s REAL NOT NULL,
          at_distance_m REAL NOT NULL,
          at_duration_s REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_splits_run ON splits(run_id, kind, idx);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Add columns introduced after the first release. Safe to run repeatedly. */
async function migrate(db: SQLite.SQLiteDatabase) {
  const cols = (await db.getAllAsync('PRAGMA table_info(runs)')) as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('elevation_gain_m')) {
    await db.execAsync('ALTER TABLE runs ADD COLUMN elevation_gain_m REAL NOT NULL DEFAULT 0');
  }
}

function rowToRun(r: any): Run {
  return {
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    elevationGainM: r.elevation_gain_m ?? 0,
    moodBefore: r.mood_before,
    moodAfter: r.mood_after,
    quiet: r.quiet,
    note: r.note,
  };
}

// ---- Runs ------------------------------------------------------------------

export async function createRun(startedAt: number, moodBefore: Mood | null): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync('INSERT INTO runs (started_at, mood_before) VALUES (?, ?)', startedAt, moodBefore);
  return res.lastInsertRowId;
}

export async function addPoints(
  runId: number,
  pts: Array<{ ts: number; lat: number; lon: number; alt: number | null; acc: number | null }>,
): Promise<void> {
  if (pts.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const p of pts) {
      await db.runAsync(
        'INSERT INTO points (run_id, ts, lat, lon, alt, acc) VALUES (?, ?, ?, ?, ?, ?)',
        runId,
        p.ts,
        p.lat,
        p.lon,
        p.alt,
        p.acc,
      );
    }
  });
}

export async function updateRunProgress(runId: number, distanceM: number, durationS: number, elevationGainM: number) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE runs SET distance_m = ?, duration_s = ?, elevation_gain_m = ? WHERE id = ?',
    distanceM,
    durationS,
    elevationGainM,
    runId,
  );
}

export async function finishRun(
  runId: number,
  data: {
    endedAt: number;
    distanceM: number;
    durationS: number;
    elevationGainM: number;
    moodAfter: Mood | null;
    quiet: Quiet | null;
    note: string | null;
  },
) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE runs SET ended_at = ?, distance_m = ?, duration_s = ?, elevation_gain_m = ?, mood_after = ?, quiet = ?, note = ? WHERE id = ?',
    data.endedAt,
    data.distanceM,
    data.durationS,
    data.elevationGainM,
    data.moodAfter,
    data.quiet,
    data.note,
    runId,
  );
}

export async function deleteRun(runId: number) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM points WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM splits WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM runs WHERE id = ?', runId);
  });
}

export async function listRuns(): Promise<Run[]> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM runs WHERE ended_at IS NOT NULL ORDER BY started_at DESC');
  return rows.map(rowToRun);
}

export async function getRun(runId: number): Promise<Run | null> {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM runs WHERE id = ?', runId);
  return row ? rowToRun(row) : null;
}

export async function getPoints(runId: number): Promise<Point[]> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM points WHERE run_id = ? ORDER BY ts ASC', runId);
  return rows.map((r: any) => ({ id: r.id, runId: r.run_id, ts: r.ts, lat: r.lat, lon: r.lon, alt: r.alt, acc: r.acc }));
}

/** Runs that were never finished (app killed mid-run). Cleaned up on launch. */
export async function discardUnfinishedRuns() {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM points WHERE run_id IN (SELECT id FROM runs WHERE ended_at IS NULL)');
    await db.runAsync('DELETE FROM splits WHERE run_id IN (SELECT id FROM runs WHERE ended_at IS NULL)');
    await db.runAsync('DELETE FROM runs WHERE ended_at IS NULL');
  });
}

// ---- Splits ----------------------------------------------------------------

export async function addSplit(runId: number, s: Omit<Split, 'id' | 'runId'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO splits (run_id, kind, idx, distance_m, duration_s, at_distance_m, at_duration_s) VALUES (?, ?, ?, ?, ?, ?, ?)',
    runId,
    s.kind,
    s.index,
    s.distanceM,
    s.durationS,
    s.atDistanceM,
    s.atDurationS,
  );
}

export async function getSplits(runId: number, kind?: SplitKind): Promise<Split[]> {
  const db = await getDb();
  const rows = kind
    ? await db.getAllAsync('SELECT * FROM splits WHERE run_id = ? AND kind = ? ORDER BY idx ASC', runId, kind)
    : await db.getAllAsync('SELECT * FROM splits WHERE run_id = ? ORDER BY kind, idx ASC', runId);
  return rows.map((r: any) => ({
    id: r.id,
    runId: r.run_id,
    kind: r.kind,
    index: r.idx,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    atDistanceM: r.at_distance_m,
    atDurationS: r.at_duration_s,
  }));
}

// ---- Settings --------------------------------------------------------------

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', 'settings')) as { value: string } | null;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'settings', JSON.stringify(s));
}

/** Notification line ids already shown, kept apart from settings so the two never clobber each other. */
export async function loadSeenLines(): Promise<string[]> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', 'seenLines')) as { value: string } | null;
  try {
    return row ? (JSON.parse(row.value) as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveSeenLines(ids: string[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'seenLines', JSON.stringify(ids));
}
