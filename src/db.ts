import * as SQLite from 'expo-sqlite';
import { salvageEnd } from './gps/salvage';
import type { SourceKind } from './io/types';
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
        CREATE TABLE IF NOT EXISTS run_facts (
          run_id INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
          v INTEGER NOT NULL,
          efforts TEXT NOT NULL,
          weather TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_sources (
          run_id INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          file_name TEXT,
          external_id TEXT,
          imported_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_run_sources_ext ON run_sources(external_id);
        CREATE TABLE IF NOT EXISTS route_sigs (
          run_id INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
          v INTEGER NOT NULL,
          sig TEXT
        );
        CREATE TABLE IF NOT EXISTS places (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          distance_m REAL NOT NULL,
          sig TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS place_visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
          run_id INTEGER,
          at INTEGER NOT NULL,
          busy TEXT,
          note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_visits_place ON place_visits(place_id, at);
        CREATE TABLE IF NOT EXISTS heart_rate (
          run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          ts INTEGER NOT NULL,
          bpm INTEGER NOT NULL,
          PRIMARY KEY (run_id, ts)
        );
        CREATE TABLE IF NOT EXISTS deep_summaries (
          run_id INTEGER PRIMARY KEY,
          v INTEGER NOT NULL,
          k TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bg_fixes (
          ts INTEGER PRIMARY KEY,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          acc REAL,
          alt REAL,
          speed REAL
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

/** The energy check, filled in later (from the after-run note), changed, or cleared. */
export async function setMoodAfter(runId: number, mood: Mood | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE runs SET mood_after = ? WHERE id = ?', mood, runId);
}

/** The after-run note, written or corrected later. Empty clears it. */
export async function setRunNote(runId: number, note: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE runs SET note = ? WHERE id = ?', note && note.trim() ? note.trim() : null, runId);
}

export async function deleteRun(runId: number) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM points WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM splits WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM heart_rate WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM run_facts WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM deep_summaries WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM run_sources WHERE run_id = ?', runId);
    // A deleted run takes its line in a place's log with it; the place itself stays.
    await db.runAsync('DELETE FROM route_sigs WHERE run_id = ?', runId);
    await db.runAsync('DELETE FROM place_visits WHERE run_id = ?', runId);
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

// ---- Runs brought in from files (and later Health Connect) -----------------------
// A run with a run_sources row came from somewhere else; every other run was
// recorded here. The rest of the app treats both the same.

export interface RunSource {
  kind: SourceKind;
  fileName: string | null;
  externalId: string | null;
  importedAt: number;
}

export async function getRunSource(runId: number): Promise<RunSource | null> {
  const db = await getDb();
  const r = (await db.getFirstAsync('SELECT * FROM run_sources WHERE run_id = ?', runId)) as any;
  return r ? { kind: r.kind, fileName: r.file_name, externalId: r.external_id, importedAt: r.imported_at } : null;
}

/** Start, end, distance and any outside id of every finished run, for spotting one we already have. */
export async function runSpans(): Promise<Array<{ startedAt: number; endedAt: number | null; distanceM: number; externalId: string | null }>> {
  const db = await getDb();
  const rows = (await db.getAllAsync(
    'SELECT r.started_at, r.ended_at, r.distance_m, s.external_id FROM runs r LEFT JOIN run_sources s ON s.run_id = r.id WHERE r.ended_at IS NOT NULL',
  )) as any[];
  return rows.map((r) => ({ startedAt: r.started_at, endedAt: r.ended_at, distanceM: r.distance_m, externalId: r.external_id }));
}

/** A whole run from a file, in one go: the run, its points, its km splits and where it came from. */
export async function addImportedRun(
  run: { startedAt: number; endedAt: number; distanceM: number; durationS: number; elevationGainM: number },
  points: Array<{ ts: number; lat: number; lon: number; alt: number | null }>,
  splits: Array<Omit<Split, 'id' | 'runId' | 'kind'>>,
  source: Omit<RunSource, 'importedAt'>,
): Promise<number> {
  const db = await getDb();
  let id = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT INTO runs (started_at, ended_at, distance_m, duration_s, elevation_gain_m) VALUES (?, ?, ?, ?, ?)',
      run.startedAt,
      run.endedAt,
      run.distanceM,
      run.durationS,
      run.elevationGainM,
    );
    id = res.lastInsertRowId;
    const pt = await db.prepareAsync('INSERT INTO points (run_id, ts, lat, lon, alt, acc) VALUES (?, ?, ?, ?, ?, NULL)');
    try {
      for (const p of points) await pt.executeAsync(id, p.ts, p.lat, p.lon, p.alt);
    } finally {
      await pt.finalizeAsync();
    }
    for (const s of splits) {
      await db.runAsync(
        'INSERT INTO splits (run_id, kind, idx, distance_m, duration_s, at_distance_m, at_duration_s) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id,
        'km',
        s.index,
        s.distanceM,
        s.durationS,
        s.atDistanceM,
        s.atDurationS,
      );
    }
    await db.runAsync(
      'INSERT INTO run_sources (run_id, kind, file_name, external_id, imported_at) VALUES (?, ?, ?, ?, ?)',
      id,
      source.kind,
      source.fileName,
      source.externalId,
      Date.now(),
    );
  });
  return id;
}

// ---- Runs typed in or corrected by hand -------------------------------------------
// A run added by hand has a run_sources row of kind 'manual' and no route. A
// correction keeps what was recorded under the settings key 'runEdits', so it
// can always be put back.

export async function addManualRun(run: { startedAt: number; distanceM: number; durationS: number; note: string | null }): Promise<number> {
  const db = await getDb();
  let id = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT INTO runs (started_at, ended_at, distance_m, duration_s, elevation_gain_m, note) VALUES (?, ?, ?, ?, 0, ?)',
      run.startedAt,
      run.startedAt + run.durationS * 1000,
      run.distanceM,
      run.durationS,
      run.note && run.note.trim() ? run.note.trim() : null,
    );
    id = res.lastInsertRowId;
    await db.runAsync('INSERT INTO run_sources (run_id, kind, file_name, external_id, imported_at) VALUES (?, ?, NULL, NULL, ?)', id, 'manual', Date.now());
  });
  return id;
}

export type RunEdit = { distanceM: number; durationS: number; at: number };

async function loadEdits(): Promise<Record<string, RunEdit>> {
  return (await loadValue<Record<string, RunEdit>>('runEdits')) ?? {};
}

/** What was recorded before a correction, or null when the run is as recorded. */
export async function getRunEdit(runId: number): Promise<RunEdit | null> {
  return (await loadEdits())[String(runId)] ?? null;
}

/** New distance and time for a run. The first correction keeps what was recorded. */
export async function correctRun(runId: number, distanceM: number, durationS: number): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;
  const edits = await loadEdits();
  if (!edits[String(runId)]) edits[String(runId)] = { distanceM: run.distanceM, durationS: run.durationS, at: Date.now() };
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE runs SET distance_m = ?, duration_s = ? WHERE id = ?', distanceM, durationS, runId);
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'runEdits', JSON.stringify(edits));
  });
}

/** Back to what was recorded. */
export async function putBackRun(runId: number): Promise<void> {
  const edits = await loadEdits();
  const was = edits[String(runId)];
  if (!was) return;
  delete edits[String(runId)];
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE runs SET distance_m = ?, duration_s = ? WHERE id = ?', was.distanceM, was.durationS, runId);
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'runEdits', JSON.stringify(edits));
  });
}

/** What "Everything you have" counts: runs recorded here, runs brought in, by where from. */
export async function storedCounts(): Promise<{ runs: number; brought: Partial<Record<SourceKind, number>> }> {
  const db = await getDb();
  const total = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM runs WHERE ended_at IS NOT NULL')) as { n: number };
  const rows = (await db.getAllAsync('SELECT kind, COUNT(*) AS n FROM run_sources GROUP BY kind')) as Array<{ kind: SourceKind; n: number }>;
  const brought: Partial<Record<SourceKind, number>> = {};
  for (const r of rows) brought[r.kind] = r.n;
  return { runs: total.n, brought };
}

// ---- Run facts (bests found inside a run, the weather at the time) ------------

export interface StoredFacts {
  v: number;
  efforts: Record<string, number>;
  weather: unknown | null;
}

export async function loadAllFacts(): Promise<Map<number, StoredFacts>> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT * FROM run_facts')) as Array<{ run_id: number; v: number; efforts: string; weather: string | null }>;
  const out = new Map<number, StoredFacts>();
  for (const r of rows) {
    try {
      out.set(r.run_id, { v: r.v, efforts: JSON.parse(r.efforts), weather: r.weather ? JSON.parse(r.weather) : null });
    } catch {
      // A damaged row is simply recomputed.
    }
  }
  return out;
}

export async function saveFacts(runId: number, f: StoredFacts): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO run_facts (run_id, v, efforts, weather) VALUES (?, ?, ?, ?)',
    runId,
    f.v,
    JSON.stringify(f.efforts),
    f.weather == null ? null : JSON.stringify(f.weather),
  );
}

/**
 * Runs that were never finished and that recovery didn't pick up. A run with a
 * route is closed where its recording stopped and shows in history like any
 * other; only an empty one (fewer than two points) is removed. `keep` is a run
 * that still has a live snapshot and must be left alone.
 */
export async function closeUnfinishedRuns(keep: number | null = null) {
  const db = await getDb();
  const rows = (await db.getAllAsync(
    'SELECT r.id, r.started_at, r.duration_s, COUNT(p.id) AS n, MAX(p.ts) AS last_ts FROM runs r LEFT JOIN points p ON p.run_id = r.id WHERE r.ended_at IS NULL GROUP BY r.id',
  )) as Array<{ id: number; started_at: number; duration_s: number; n: number; last_ts: number | null }>;
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      if (r.id === keep) continue;
      const endedAt = salvageEnd({ startedAt: r.started_at, durationS: r.duration_s, pointCount: r.n, lastPointTs: r.last_ts });
      if (endedAt != null) {
        await db.runAsync('UPDATE runs SET ended_at = ? WHERE id = ?', endedAt, r.id);
        continue;
      }
      await db.runAsync('DELETE FROM points WHERE run_id = ?', r.id);
      await db.runAsync('DELETE FROM splits WHERE run_id = ?', r.id);
      await db.runAsync('DELETE FROM heart_rate WHERE run_id = ?', r.id);
      await db.runAsync('DELETE FROM runs WHERE id = ?', r.id);
    }
  });
}

// ---- Heart rate (from a watch) -----------------------------------------------

/** Readings sent by the watch mid-run. A reading already stored is skipped. */
export async function addHeartRate(runId: number, samples: Array<[number, number]>): Promise<void> {
  if (samples.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [ts, bpm] of samples) await db.runAsync('INSERT OR IGNORE INTO heart_rate (run_id, ts, bpm) VALUES (?, ?, ?)', runId, ts, bpm);
  });
}

export async function getHeartRate(runId: number): Promise<Array<{ ts: number; bpm: number }>> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT ts, bpm FROM heart_rate WHERE run_id = ? ORDER BY ts ASC', runId);
  return rows.map((r: any) => ({ ts: r.ts, bpm: r.bpm }));
}

/**
 * The highest heart rate this phone has seen, for zones. The tenth highest
 * reading, so one optical-sensor spike can't set everyone's zones too high.
 */
export async function highestHeartRate(): Promise<number | null> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT bpm FROM heart_rate ORDER BY bpm DESC LIMIT 10');
  return rows.length === 10 ? (rows[9] as any).bpm : null;
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

/** A treadmill run's km splits, redrawn on the distance the treadmill gave (tracking.stopRun). Laps stay as they were. */
export async function replaceKmSplits(runId: number, splits: Array<Omit<Split, 'id' | 'runId' | 'kind'>>): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM splits WHERE run_id = ? AND kind = 'km'", runId);
    for (const s of splits) {
      await db.runAsync(
        'INSERT INTO splits (run_id, kind, idx, distance_m, duration_s, at_distance_m, at_duration_s) VALUES (?, ?, ?, ?, ?, ?, ?)',
        runId,
        'km',
        s.index,
        s.distanceM,
        s.durationS,
        s.atDistanceM,
        s.atDurationS,
      );
    }
  });
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

/** Seconds per km of every full km split, run by run, in order. For the months view of deep stats. */
export async function allKmPaces(): Promise<Map<number, number[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT run_id, distance_m, duration_s FROM splits WHERE kind = 'km' ORDER BY run_id, idx ASC");
  const out = new Map<number, number[]>();
  for (const r of rows as any[]) {
    if (r.distance_m < 900) continue; // a short last split isn't a km
    const list = out.get(r.run_id) ?? [];
    list.push((r.duration_s / r.distance_m) * 1000);
    out.set(r.run_id, list);
  }
  return out;
}

// ---- Deep stats across months -----------------------------------------------
// A small summary per run (how far the pace held, hill price, streets as grid
// cells), worked out once from its points. Not in backups: it is rebuilt from
// the runs. `k` ties a row to the run it was made from (start time and number of
// points), so a restored or corrected run is worked out again.

export async function loadDeepSummaries(): Promise<Map<number, { v: number; k: string; data: string }>> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT run_id, v, k, data FROM deep_summaries')) as Array<{ run_id: number; v: number; k: string; data: string }>;
  return new Map(rows.map((r) => [r.run_id, { v: r.v, k: r.k, data: r.data }]));
}

export async function saveDeepSummary(runId: number, v: number, k: string, data: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO deep_summaries (run_id, v, k, data) VALUES (?, ?, ?, ?)', runId, v, k, data);
}

/** How many points each run has, for the summary key. */
export async function pointCounts(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT run_id, COUNT(*) AS n FROM points GROUP BY run_id')) as Array<{ run_id: number; n: number }>;
  return new Map(rows.map((r) => [r.run_id, r.n]));
}

/** Your places with the length of their loop. */
export async function placeLoops(): Promise<Array<{ id: number; name: string; distanceM: number }>> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT id, name, distance_m FROM places')) as Array<{ id: number; name: string; distance_m: number }>;
  return rows.map((r) => ({ id: r.id, name: r.name, distanceM: r.distance_m }));
}

// ---- Settings --------------------------------------------------------------

/**
 * Reminders went from a few a week to one or two a day (30 Oct 2026). Older
 * settings move once: off stays off, one a week becomes a few a week.
 */
function migrateSettings(saved: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...saved };
  if ((saved.notifyCadence ?? 1) >= 2) return s;
  const was = (saved.notifyPerWeek ?? 3) as number;
  return { ...s, notifyCadence: 2, notifyPerWeek: was === 0 ? 0 : was === 1 ? 3 : 14 };
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', 'settings')) as { value: string } | null;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return migrateSettings(JSON.parse(row.value));
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

// ---- Background fixes ------------------------------------------------------
// Fixes the location task received while nothing in JS was recording (the OS
// killed the app mid-run). Recovery replays them; see gps/replay.ts.

export async function bufferFixes(fixes: Array<{ ts: number; lat: number; lon: number; acc: number | null; alt: number | null; speed: number | null }>): Promise<void> {
  if (fixes.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const f of fixes) {
      await db.runAsync('INSERT OR IGNORE INTO bg_fixes (ts, lat, lon, acc, alt, speed) VALUES (?, ?, ?, ?, ?, ?)', f.ts, f.lat, f.lon, f.acc, f.alt, f.speed);
    }
  });
}

export async function getBufferedFixes(): Promise<Array<{ ts: number; lat: number; lon: number; acc: number | null; alt: number | null; speed: number | null }>> {
  const db = await getDb();
  return (await db.getAllAsync('SELECT ts, lat, lon, acc, alt, speed FROM bg_fixes ORDER BY ts ASC')) as any[];
}

export async function clearBufferedFixes(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM bg_fixes');
}

/** Small JSON values that aren't settings (the last weather reading, for one). */
export async function loadValue<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', key)) as { value: string } | null;
  try {
    return row ? (JSON.parse(row.value) as T) : null;
  } catch {
    return null;
  }
}

export async function saveValue(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}
