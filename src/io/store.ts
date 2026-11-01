import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { addImportedRuns, getHeartRate, getPoints, getRun, listRuns, runSpans } from '../db';
import { RunSaver, importOne } from './saver';
import { cleanHeart, type HeartSample } from '../heart';
import { parseFit, writeFit } from './fit';
import { parseGpx, writeGpx } from './gpx';
import { EMPTY_TALLY, runFileName, sameRun, shapeRun, sniff, tallySkips, type ImportTally, type KnownRun } from './shape';
import { parseTcx } from './tcx';
import type { ParseResult, SourceKind } from './types';
import { walkArchive, type Activity, type ActivityKind, type Origin, type Spill } from './archive';
import { MAX_ENTRY_BYTES, gunzip, streamEntry, text, type ByteSource } from './unzip';
import { ZipWriter } from './zip';
import { ui } from '../i18n/ui';

// The glue between files and stored runs. Files only arrive through the
// system file picker and only leave through the share sheet: no storage
// permission, no network, nothing in the background.
//
// Health Connect plugs in at importParsed: read its exercise sessions into
// ImportedRun (externalId = the record id), call importParsed with kind
// 'health', and de-duplication, history, bests and places work as for files.

/** Bring parsed activities in, leaving out any we already have. New runs show up everywhere on the next load. */
export async function importParsed(parsed: Array<{ result: ParseResult; fileName: string | null }>, kind: SourceKind, tally: ImportTally = { ...EMPTY_TALLY }): Promise<ImportTally> {
  const known: KnownRun[] = await runSpans();
  const saver = new RunSaver(tally, addImportedRuns);
  for (const { result, fileName } of parsed) await importOne(result, fileName, kind, known, tally, saver);
  await saver.flush();
  return tally;
}

// ---- Bringing runs in: single files or a whole export --------------------------
// Two passes. The first reads everything and counts (nothing is saved), so the
// runner sees what would come in before it does. The second brings in only the
// files the first one picked out. Nothing is kept in memory between them but
// the list of file keys, so years of runs fit on any phone.

/** A picked file, read at random without loading it. */
function fileSource(f: File): ByteSource & { dispose: () => void } {
  const h = f.open(FileMode.ReadOnly);
  return {
    size: h.size ?? f.size ?? 0,
    read: async (offset, length) => {
      h.offset = offset;
      return h.readBytes(length);
    },
    dispose: () => h.close(),
  };
}

let spills = 0;
/** A zip inside the zip (Garmin): written out to the cache, then read like any file. */
const spill: Spill = async (src, e) => {
  const f = new File(Paths.cache, `import-inner-${++spills}.zip`);
  if (f.exists) f.delete();
  f.create();
  const h = f.open(FileMode.Truncate);
  try {
    await streamEntry(src, e, (chunk) => h.writeBytes(chunk));
  } finally {
    h.close();
  }
  const s = fileSource(f);
  return {
    ...s,
    dispose: () => {
      s.dispose();
      if (f.exists) f.delete();
    },
  };
};

/** What would come in, before anything does. */
export interface ImportPreview {
  /** A whole export rather than a few files: worth asking before saving. */
  archive: boolean;
  origin: Origin | null;
  fresh: number;
  freshKm: number;
  firstAt: number | null;
  lastAt: number | null;
  /** Already here, not runs, unreadable, too short: what stays out. `added` stays 0. */
  out: ImportTally;
  /** Per picked file, the activity keys worth a second look. */
  keep: Map<number, Set<string>>;
}

function parseActivity(a: Activity): ParseResult {
  if (a.typed) return { runs: [a.typed], skipped: [] };
  const result = a.kind === 'fit' ? parseFit(a.bytes) : a.kind === 'tcx' ? parseTcx(text(a.bytes)) : parseGpx(text(a.bytes));
  for (const r of result.runs) {
    // The archive's own list knows what the activity was, even when the file doesn't.
    if (a.sport) r.sport = a.sport;
    if (a.name && !r.name) r.name = a.name;
    if (a.externalId && !r.externalId && result.runs.length === 1) r.externalId = a.externalId;
  }
  return result;
}

/** Every activity in the picked files, one at a time. A file that isn't an export counts as one activity. */
async function eachActivity(files: File[], only: Map<number, Set<string>> | null, onProgress: ((done: number, total: number) => void) | undefined, out: ImportTally, cb: (index: number, a: Activity) => Promise<void>): Promise<{ archive: boolean; origin: Origin | null }> {
  let archive = false;
  let origin: Origin | null = null;
  for (const [i, f] of files.entries()) {
    const want = only?.get(i);
    if (only && !want) continue;
    if (files.length > 1) onProgress?.(i, files.length);
    let src: ReturnType<typeof fileSource>;
    try {
      src = fileSource(f);
    } catch {
      out.unreadable++;
      continue;
    }
    try {
      const head = await src.read(0, 512);
      const kind = sniff(f.name ?? '', head);
      if (kind === 'zip') {
        archive = true;
        const r = await walkArchive(src, { spill, only: want, onProgress: files.length === 1 ? onProgress : undefined }, (a) => cb(i, a));
        origin ??= r.origin;
        out.notRun += r.notRun;
        out.unreadable += r.unreadable;
        continue;
      }
      if (!kind) {
        out.unreadable++;
        continue;
      }
      let bytes = await src.read(0, Math.min(src.size, MAX_ENTRY_BYTES));
      let name = f.name ?? '';
      let k: ActivityKind | null = kind === 'gzip' ? null : kind;
      if (kind === 'gzip') {
        bytes = gunzip(bytes);
        name = name.replace(/\.gz$/i, '');
        const inner = sniff(name, bytes.subarray(0, 512));
        k = inner === 'gpx' || inner === 'fit' || inner === 'tcx' ? inner : null;
      }
      if (!k) {
        out.unreadable++;
        continue;
      }
      await cb(i, { key: '', fileName: name, kind: k, bytes, sport: null, name: null, externalId: null, origin: null });
    } catch {
      out.unreadable++;
    } finally {
      src.dispose();
    }
  }
  return { archive, origin };
}

/** Opens the phone's file picker. Single GPX, FIT or TCX files, gzipped ones, or a whole Strava or Garmin export zip. */
export async function pickImportFiles(): Promise<File[] | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
  if (picked.canceled || !picked.result.length) return null;
  return picked.result;
}

/** First pass: reads everything, saves nothing, and says what would come in. */
export async function scanImport(files: File[], onProgress?: (done: number, total: number) => void): Promise<ImportPreview> {
  const known: KnownRun[] = await runSpans();
  const out: ImportTally = { ...EMPTY_TALLY };
  const keep = new Map<number, Set<string>>();
  let fresh = 0;
  let freshKm = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  let activities = 0;
  const { archive, origin } = await eachActivity(files, null, onProgress, out, async (i, a) => {
    activities++;
    const result = parseActivity(a);
    tallySkips(result.skipped, out);
    for (const r of result.runs) {
      const shaped = shapeRun(r);
      if (typeof shaped === 'string') {
        tallySkips([shaped], out);
        continue;
      }
      if (known.some((k) => sameRun(k, shaped))) {
        out.duplicate++;
        continue;
      }
      // Only the times stay: enough to notice the same run twice in one export.
      known.push({ startedAt: shaped.startedAt, endedAt: shaped.endedAt, distanceM: shaped.distanceM, externalId: shaped.externalId });
      fresh++;
      freshKm += shaped.distanceM / 1000;
      firstAt = firstAt == null ? shaped.startedAt : Math.min(firstAt, shaped.startedAt);
      lastAt = lastAt == null ? shaped.startedAt : Math.max(lastAt, shaped.startedAt);
      let set = keep.get(i);
      if (!set) keep.set(i, (set = new Set()));
      set.add(a.key);
    }
  });
  return { archive: archive || activities > 20, origin, fresh, freshKm, firstAt, lastAt, out, keep };
}

/** Second pass: brings in what the first pass found new. */
export async function commitImport(files: File[], preview: ImportPreview, onProgress?: (done: number, total: number) => void): Promise<ImportTally> {
  const known: KnownRun[] = await runSpans();
  // What stays out was counted in the first pass; this one only adds.
  const now: ImportTally = { ...EMPTY_TALLY };
  const saver = new RunSaver(now, addImportedRuns);
  await eachActivity(files, preview.keep, onProgress, { ...EMPTY_TALLY }, (_i, a) => importOne(parseActivity(a), a.typed ? null : a.fileName, a.typed ? 'manual' : (a.origin ?? a.kind), known, now, saver));
  await saver.flush();
  return { ...preview.out, added: now.added, duplicate: preview.out.duplicate + now.duplicate };
}

async function share(file: File, mimeType: string, UTI: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error(ui().store.sharingIsnTAvailableHere(file.uri));
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle });
}

function fresh(name: string): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  return f;
}

/** The run's heart rate from a watch or strap, cleaned; undefined when there is none. */
async function heartFor(runId: number, startedAt: number, endedAt: number | null): Promise<HeartSample[] | undefined> {
  const h = cleanHeart(await getHeartRate(runId).catch(() => []), startedAt, endedAt);
  return h.length ? h : undefined;
}

/** One run as GPX, through the share sheet. Free, always. */
export async function shareRunGpx(runId: number): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;
  const points = await getPoints(runId);
  if (!points.length) throw new Error(ui().store.thisRunHasNoRoute);
  const file = fresh(runFileName(run.startedAt, 'gpx'));
  const heart = await heartFor(run.id, run.startedAt, run.endedAt);
  await file.write(writeGpx({ startedAt: run.startedAt, points, heart }));
  await share(file, 'application/gpx+xml', 'com.topografix.gpx', ui().store.saveTheRunAsGpx);
}

/**
 * Every run, one file each, in a single zip, through the share sheet. Free,
 * always: taking your own runs out is never part of the unlock.
 * Written run by run, so a long history never sits in memory at once.
 */
export async function shareAllRuns(format: 'gpx' | 'fit', onProgress?: (done: number, total: number) => void): Promise<{ files: number; skipped: number }> {
  const runs = (await listRuns()).sort((a, b) => a.startedAt - b.startedAt);
  const day = new Date().toISOString().slice(0, 10);
  const file = fresh(`runtrovert-runs-${format}-${day}.zip`);
  file.create();
  const handle = file.open(FileMode.Truncate);
  const used = new Set<string>();
  let files = 0;
  let skipped = 0;
  try {
    const zip = new ZipWriter((chunk) => handle.writeBytes(chunk));
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      onProgress?.(i, runs.length);
      const points = await getPoints(r.id);
      // A GPX file without a track has no times either, and apps refuse it. FIT keeps the totals.
      if (format === 'gpx' && !points.length) {
        skipped++;
        continue;
      }
      let name = runFileName(r.startedAt, format);
      for (let n = 2; used.has(name); n++) name = runFileName(r.startedAt, format).replace(`-run.${format}`, `-run-${n}.${format}`);
      used.add(name);
      const heart = await heartFor(r.id, r.startedAt, r.endedAt);
      const data =
        format === 'gpx'
          ? writeGpx({ startedAt: r.startedAt, points, heart })
          : writeFit({ startedAt: r.startedAt, endedAt: r.endedAt ?? r.startedAt + r.durationS * 1000, distanceM: r.distanceM, durationS: r.durationS, elevationGainM: r.elevationGainM, points, heart });
      await zip.add(name, data, r.startedAt);
      files++;
    }
    await zip.finish();
  } finally {
    handle.close();
  }
  onProgress?.(runs.length, runs.length);
  await share(file, 'application/zip', 'public.zip-archive', format === 'gpx' ? ui().store.allYourRunsAsGpx : ui().store.allYourRunsAsFit);
  return { files, skipped };
}
