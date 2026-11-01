import { gunzip, entryBytes, isZip, listZip, text, type ByteSource, type ZipEntry } from './unzip';

// A whole export, as it comes: Strava's "Download your data" zip (activities/
// with .gpx, .fit.gz and .tcx.gz files, plus activities.csv) or Garmin's
// "Export your data" zip (DI_CONNECT/…/UploadedFiles_*.zip, zips inside the
// zip). Photos, videos and everything else in there are never read. Pure:
// the phone and the Node tests hand in their own way of reading bytes.

export type ActivityKind = 'gpx' | 'fit' | 'tcx';
export type Origin = 'strava' | 'garmin';

export interface Activity {
  /** Where it sits, unique within the archive: "outer/path.zip>inner.fit". */
  key: string;
  fileName: string;
  kind: ActivityKind;
  bytes: Uint8Array;
  /** What the archive's own list says, when it has one (Strava's activities.csv). */
  sport: string | null;
  name: string | null;
  externalId: string | null;
  /** Whose export it came from, when the archive says. */
  origin: Origin | null;
}

export interface WalkResult {
  origin: Origin | null;
  /** Activities the archive's own list called something other than a run: never opened. */
  notRun: number;
  unreadable: number;
  /** How many activity files there were in all, read or not. */
  files: number;
}

/** Spills a nested zip somewhere it can be read at random (a cache file on the phone). */
export type Spill = (src: ByteSource, e: ZipEntry) => Promise<ByteSource & { dispose?: () => void }>;

export interface WalkOptions {
  spill: Spill;
  /** Only these keys (the second pass, after the preview). */
  only?: Set<string>;
  onProgress?: (done: number, total: number) => void;
}

/** gpx, fit or tcx from a file name, looking through a .gz on the end. */
export function activityKind(name: string): ActivityKind | null {
  const m = /\.(gpx|fit|tcx)(\.gz)?$/i.exec(name);
  return m ? (m[1].toLowerCase() as ActivityKind) : null;
}

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** One CSV line into fields, with quotes and doubled quotes. Newlines inside quotes are handled by the caller. */
export function csvRows(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') (field += '"'), i++;
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

export interface StravaLine {
  id: string;
  name: string | null;
  type: string | null;
}

/** Strava's activities.csv: file path (as in the zip) to what the activity was. */
export function readStravaCsv(csv: string): Map<string, StravaLine> {
  const rows = csvRows(csv.replace(/^﻿/, ''));
  const out = new Map<string, StravaLine>();
  if (!rows.length) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const iId = col('activity id');
  const iName = col('activity name');
  const iType = col('activity type');
  const iFile = col('filename');
  if (iId < 0 || iFile < 0) return out;
  for (const r of rows.slice(1)) {
    const file = r[iFile]?.trim();
    if (!file) continue;
    out.set(file.replace(/\\/g, '/'), { id: r[iId]?.trim() ?? '', name: iName >= 0 ? r[iName]?.trim() || null : null, type: iType >= 0 ? r[iType]?.trim() || null : null });
  }
  return out;
}

/** Strava's own word for a run: Run, Trail Run, Virtual Run (the treadmill). */
export function stravaIsRun(type: string | null): boolean {
  return type == null || /run|jog/i.test(type);
}

/**
 * Every activity file in the archive, handed to `onActivity` one at a time and
 * then let go. Nested zips are spilled and walked the same way.
 */
export async function walkArchive(src: ByteSource, opts: WalkOptions, onActivity: (a: Activity) => Promise<void>): Promise<WalkResult> {
  const entries = await listZip(src);
  const result: WalkResult = { origin: null, notRun: 0, unreadable: 0, files: 0 };
  if (entries.some((e) => /(^|\/)DI_CONNECT\//.test(e.name))) result.origin = 'garmin';
  const csvEntry = entries.find((e) => /(^|\/)activities\.csv$/i.test(e.name));
  let strava = new Map<string, StravaLine>();
  if (csvEntry) {
    try {
      strava = readStravaCsv(text(await entryBytes(src, csvEntry)));
    } catch {
      // Without the list every file is opened and judged by what it says.
    }
  }
  if (!result.origin && (strava.size || entries.some((e) => /^activities\/\d+\.(gpx|fit|tcx)/i.test(e.name)))) result.origin = 'strava';
  const work = entries.filter((e) => activityKind(e.name) || /\.zip$/i.test(e.name));
  let done = 0;
  for (const e of work) {
    opts.onProgress?.(done++, work.length);
    if (/\.zip$/i.test(e.name)) {
      if (!wantsZip(opts.only, e.name)) continue;
      const inner = await opts.spill(src, e).catch(() => null);
      if (!inner) {
        result.unreadable++;
        continue;
      }
      try {
        const head = await inner.read(0, 4);
        if (!isZip(head)) continue;
        const sub = await walkArchive(inner, { ...opts, onProgress: undefined, only: opts.only ? prefixed(opts.only, e.name) : undefined }, (a) => onActivity({ ...a, key: `${e.name}>${a.key}`, origin: a.origin ?? result.origin }));
        result.origin ??= sub.origin;
        result.notRun += sub.notRun;
        result.unreadable += sub.unreadable;
        result.files += sub.files;
      } catch {
        result.unreadable++;
      } finally {
        inner.dispose?.();
      }
      continue;
    }
    result.files++;
    if (opts.only && !opts.only.has(e.name)) continue;
    const line = strava.get(e.name) ?? null;
    if (line && !stravaIsRun(line.type)) {
      result.notRun++;
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await entryBytes(src, e);
      if (/\.gz$/i.test(e.name)) bytes = gunzip(bytes);
    } catch {
      result.unreadable++;
      continue;
    }
    await onActivity({
      key: e.name,
      fileName: base(e.name).replace(/\.gz$/i, ''),
      kind: activityKind(e.name)!,
      bytes,
      sport: line?.type ? (stravaIsRun(line.type) ? 'running' : line.type.toLowerCase()) : null,
      name: line?.name ?? null,
      externalId: line?.id ? `strava:${line.id}` : null,
      origin: result.origin,
    });
  }
  opts.onProgress?.(work.length, work.length);
  return result;
}

/** The keys inside one nested zip, without its prefix. */
function prefixed(keys: Set<string>, zipName: string): Set<string> {
  const p = `${zipName}>`;
  const out = new Set<string>();
  for (const k of keys) if (k.startsWith(p)) out.add(k.slice(p.length));
  return out;
}

/** Whether a nested zip has anything wanted on the second pass; skip spilling it otherwise. */
export function wantsZip(keys: Set<string> | undefined, zipName: string): boolean {
  if (!keys) return true;
  const p = `${zipName}>`;
  for (const k of keys) if (k.startsWith(p)) return true;
  return false;
}
