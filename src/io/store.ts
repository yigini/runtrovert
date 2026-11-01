import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { addHeartRate, addImportedRun, getHeartRate, getPoints, getRun, listRuns, runSpans } from '../db';
import { cleanHeart, type HeartSample } from '../heart';
import { parseFit, writeFit } from './fit';
import { parseGpx, writeGpx } from './gpx';
import { EMPTY_TALLY, runFileName, sameRun, shapeRun, sniff, tallySkips, type ImportTally, type KnownRun } from './shape';
import type { ParseResult, SourceKind } from './types';
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
  for (const { result, fileName } of parsed) {
    tallySkips(result.skipped, tally);
    for (const r of result.runs) {
      const shaped = shapeRun(r);
      if (typeof shaped === 'string') {
        tallySkips([shaped], tally);
        continue;
      }
      if (known.some((k) => sameRun(k, shaped))) {
        tally.duplicate++;
        continue;
      }
      const id = await addImportedRun(shaped, shaped.points, shaped.kmSplits, { kind, fileName, externalId: shaped.externalId });
      // Heart rate from the file, within the run's own times.
      const beats = (r.heart ?? []).filter((h) => h.ts >= shaped.startedAt && h.ts <= shaped.endedAt).map((h) => [h.ts, h.bpm] as [number, number]);
      if (beats.length) await addHeartRate(id, beats).catch(() => {});
      known.push(shaped);
      tally.added++;
      tally.ids?.push(id);
    }
  }
  return tally;
}

/** Opens the phone's file picker and brings in every GPX and FIT file picked. null if nothing was picked. */
export async function pickAndImport(onProgress?: (done: number, total: number) => void): Promise<ImportTally | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const tally: ImportTally = { ...EMPTY_TALLY };
  const byKind: Record<'gpx' | 'fit', Array<{ result: ParseResult; fileName: string | null }>> = { gpx: [], fit: [] };
  for (const [i, f] of picked.result.entries()) {
    onProgress?.(i, picked.result.length);
    let bytes: Uint8Array;
    try {
      bytes = await f.bytes();
    } catch {
      tally.unreadable++;
      continue;
    }
    const kind = sniff(f.name, bytes.subarray(0, 512));
    if (kind === 'zipped') tally.zipped++;
    else if (kind === 'fit') byKind.fit.push({ result: parseFit(bytes), fileName: f.name });
    else if (kind === 'gpx') byKind.gpx.push({ result: parseGpx(await f.text()), fileName: f.name });
    else tally.unreadable++;
  }
  await importParsed(byKind.gpx, 'gpx', tally);
  await importParsed(byKind.fit, 'fit', tally);
  return tally;
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
