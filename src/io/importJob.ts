import { useSyncExternalStore } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { File } from 'expo-file-system';
import { commitImport, scanImport, type ImportPreview } from './store';
import { EMPTY_TALLY, importLine, type ImportTally } from './shape';
import { ui } from '../i18n/ui';

// Bringing runs in, as one job for the whole app rather than for one screen.
// A whole Strava export takes a while; the runner can leave the page, look at
// Settings or another tab, and it keeps going. Settings shows how far it is,
// and the page shows the same when they come back. The screen stays awake
// while it works, so the phone doesn't put the app to sleep half way.

export type ImportPhase = 'idle' | 'reading' | 'confirm' | 'saving' | 'done' | 'failed';

export interface ImportJob {
  phase: ImportPhase;
  done: number;
  total: number;
  /** After reading: what would come in. */
  preview: ImportPreview | null;
  /** When done: what came in and what stayed out. */
  tally: ImportTally | null;
  error: string | null;
}

const IDLE: ImportJob = { phase: 'idle', done: 0, total: 0, preview: null, tally: null, error: null };
const AWAKE_TAG = 'runtrovert-import';

let job: ImportJob = IDLE;
let files: File[] | null = null;
const listeners = new Set<() => void>();
const finished = new Set<(t: ImportTally) => void>();

function set(next: Partial<ImportJob>) {
  job = { ...job, ...next };
  for (const l of listeners) l();
}

export function getImportJob(): ImportJob {
  return job;
}

export function subscribeImportJob(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The job as it is now, re-rendering as it moves. */
export function useImportJob(): ImportJob {
  return useSyncExternalStore(subscribeImportJob, getImportJob, getImportJob);
}

/** Told once each time runs have been saved, wherever the runner is in the app. */
export function onRunsImported(cb: (t: ImportTally) => void): () => void {
  finished.add(cb);
  return () => finished.delete(cb);
}

export function importBusy(j: ImportJob = job): boolean {
  return j.phase === 'reading' || j.phase === 'saving';
}

// Progress comes per file; a few hundred files don't need a few hundred renders.
let lastTick = 0;
function progress(done: number, total: number) {
  const now = Date.now();
  if (done < total && now - lastTick < 250) return;
  lastTick = now;
  set({ done, total });
}

function awake(on: boolean) {
  try {
    if (on) void activateKeepAwakeAsync(AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(AWAKE_TAG);
  } catch {
    // Not every phone allows it; the import works without.
  }
}

function fail(e: unknown) {
  awake(false);
  files = null;
  set({ phase: 'failed', error: String((e as Error)?.message ?? e) });
}

/** Reads the picked files. A few files come straight in; a whole export waits for confirmImport. */
export async function startImport(picked: File[]): Promise<void> {
  if (importBusy()) return;
  files = picked;
  set({ ...IDLE, phase: 'reading' });
  awake(true);
  let preview: ImportPreview;
  try {
    preview = await scanImport(picked, progress);
  } catch (e) {
    return fail(e);
  }
  if (!preview.fresh) {
    awake(false);
    files = null;
    set({ phase: 'done', preview, tally: { ...preview.out, added: 0 } });
    return;
  }
  if (!preview.archive) return saveNow(preview);
  awake(false);
  set({ phase: 'confirm', preview, done: 0, total: 0 });
}

/** The runner said yes to what the preview showed. */
export function confirmImport(): Promise<void> {
  if (job.phase !== 'confirm' || !job.preview) return Promise.resolve();
  return saveNow(job.preview);
}

async function saveNow(preview: ImportPreview): Promise<void> {
  const picked = files;
  if (!picked) return fail(new Error('no files'));
  set({ phase: 'saving', preview, done: 0, total: 0 });
  awake(true);
  try {
    const tally = await commitImport(picked, preview, progress);
    awake(false);
    files = null;
    set({ phase: 'done', tally });
    if (tally.added) for (const cb of finished) cb(tally);
  } catch (e) {
    fail(e);
    // Some handfuls may be in already: lists reload, and bringing the same files in again adds the rest.
    for (const cb of finished) cb({ ...EMPTY_TALLY });
  }
}

/** Not now, or the result has been read: back to nothing going on. */
export function clearImport(): void {
  if (importBusy()) return;
  files = null;
  set(IDLE);
}

/** What the job is doing, in one line; null when nothing is going on or it waits for an answer. */
export function importStatus(job: ImportJob): string | null {
  const many = job.total > 3;
  switch (job.phase) {
    case 'reading':
      return many ? ui().everything.readingTheFilesXOf(job.done, job.total) : ui().everything.readingTheFiles;
    case 'saving':
      return many ? ui().everything.bringingInXOf(job.done, job.total) : ui().everything.bringingIn;
    case 'done':
      return job.tally ? importLine(job.tally) : null;
    case 'failed':
      return `${ui().everything.couldnTReadThoseFiles}. ${job.error ?? ''}`.trim();
    default:
      return null;
  }
}

/** The same, short enough for the Settings row: null when nothing is going on. */
export function importRowValue(job: ImportJob): string | null {
  if (job.phase === 'confirm' && job.preview) return ui().everything.runsWaiting(job.preview.fresh);
  if (job.phase === 'done' && job.tally) return job.tally.added ? ui().shape.broughtIn(job.tally.added) : ui().shape.nothingNewToBringIn;
  if (job.phase === 'failed') return ui().everything.couldnTReadThoseFiles;
  return importStatus(job);
}
