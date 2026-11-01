import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { getHeartRate, getPoints, getRun, getRunSource, listRuns, loadSettings } from './db';
import { importParsed } from './io/store';
import { EMPTY_TALLY, type ImportTally } from './io/shape';
import { appName, pausesFrom, sessionToRun, writesToHealth, type HealthSession } from './healthShape';
import type { Run } from './types';
import { ui } from './i18n/ui';

/**
 * Health Connect (Android): runs out to it and, when asked, runs in from it.
 * Free, and off until the runner turns it on in Settings › Health Connect.
 * Nothing runs in the background; nothing leaves the phone. Only running
 * sessions with distance, climb and heart rate: never the route, notes,
 * energy or anything a plan was told. modules/runtrovert-health does the
 * Health Connect calls; the pure half is healthShape.ts.
 */

export type HealthStatus = 'ok' | 'update' | 'no';

interface Native {
  status(): HealthStatus;
  granted(): Promise<{ write: boolean; read: boolean }>;
  ask(what: 'write' | 'read'): Promise<boolean>;
  openStore(): boolean;
  openSettings(): boolean;
  writeRun(run: { id: number; version: number; startedAt: number; endedAt: number; distanceM: number; climbM: number; title: string; manual: boolean; heart: Array<[number, number]>; pauses: Array<[number, number]> }): Promise<boolean>;
  deleteRun(startedAt: number, endedAt: number): Promise<boolean>;
  readRuns(sinceMs: number): Promise<HealthSession[]>;
}

// Missing on iPhone, in Expo Go and on web: then the setting never shows.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('RuntrovertHealth') : null;

export function healthStatus(): HealthStatus {
  try {
    return native?.status() ?? 'no';
  } catch {
    return 'no';
  }
}

export async function healthGranted(): Promise<{ write: boolean; read: boolean }> {
  if (!native || healthStatus() !== 'ok') return { write: false, read: false };
  return native.granted().catch(() => ({ write: false, read: false }));
}

/** Health Connect's own permission screen. True when everything asked for was allowed. */
export async function askHealth(what: 'write' | 'read'): Promise<boolean> {
  if (!native || healthStatus() !== 'ok') return false;
  return native.ask(what).catch(() => false);
}

export function openHealthStore(): void {
  native?.openStore();
}

export function openHealthSettings(): void {
  native?.openSettings();
}

/** Writes one run if it is ours to write. Called after a save or a correction, with the setting on. */
export async function writeRunToHealth(runOrId: Run | number): Promise<boolean> {
  if (!native || healthStatus() !== 'ok') return false;
  const run = typeof runOrId === 'number' ? await getRun(runOrId) : runOrId;
  if (!run || run.endedAt == null) return false;
  const source = await getRunSource(run.id).catch(() => null);
  if (!writesToHealth(source)) return false;
  const [points, heart] = await Promise.all([getPoints(run.id).catch(() => []), getHeartRate(run.id).catch(() => [])]);
  return native
    .writeRun({
      id: run.id,
      version: Date.now(), // a correction later replaces this copy
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      distanceM: run.distanceM,
      climbM: run.elevationGainM,
      title: ui().health.runTitle,
      manual: source?.kind === 'manual',
      heart: heart.map((h) => [h.ts, h.bpm] as [number, number]),
      pauses: pausesFrom(points),
    })
    .catch(() => false);
}

/** After a run is deleted here: our copy in Health Connect goes too. */
export async function deleteRunFromHealth(run: Pick<Run, 'startedAt' | 'endedAt' | 'durationS'>): Promise<void> {
  if (!native || healthStatus() !== 'ok') return;
  await native.deleteRun(run.startedAt, run.endedAt ?? run.startedAt + run.durationS * 1000).catch(() => {});
}

/** Every run recorded here or added by hand, oldest first. Returns how many went in. */
export async function writeAllRuns(onProgress?: (done: number, total: number) => void): Promise<number> {
  const runs = (await listRuns()).sort((a, b) => a.startedAt - b.startedAt);
  let n = 0;
  for (let i = 0; i < runs.length; i++) {
    onProgress?.(i, runs.length);
    if (await writeRunToHealth(runs[i])) n++;
  }
  onProgress?.(runs.length, runs.length);
  return n;
}

/** Running sessions other apps saved in Health Connect, brought in like files. null when access was not given. */
export async function bringInFromHealth(): Promise<ImportTally | null> {
  if (!native || !(await askHealth('read'))) return null;
  // Health Connect itself decides how far back an app may read (30 days before access was first given, unless more is allowed).
  const sessions = await native.readRuns(Date.now() - 20 * 365 * 86400000);
  const tally: ImportTally = { ...EMPTY_TALLY };
  return importParsed(
    sessions.map((s) => ({ result: { runs: [sessionToRun(s)], skipped: [] }, fileName: appName(s.app) })),
    'health',
    tally,
  );
}

async function switchedOn(): Promise<boolean> {
  return !!native && healthStatus() === 'ok' && (await loadSettings().catch(() => null))?.healthConnect === true;
}

/** A run was saved, added by hand or corrected: with the setting on, Health Connect gets the new version. Never throws. */
export async function syncRunToHealth(runId: number): Promise<void> {
  if (await switchedOn()) await writeRunToHealth(runId).catch(() => false);
}

/** A run is about to be deleted: read it first, then call the returned function once it's gone. Never throws. */
export async function beforeDeleteForHealth(runId: number): Promise<() => Promise<void>> {
  if (!(await switchedOn())) return async () => {};
  const run = await getRun(runId).catch(() => null);
  const source = run ? await getRunSource(runId).catch(() => null) : null;
  if (!run || !writesToHealth(source)) return async () => {};
  return () => deleteRunFromHealth(run);
}
