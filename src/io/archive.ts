import type { ImportedRun } from './types';
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
  /** A run typed in by hand on Strava: no file, only the list's numbers. bytes is empty. */
  typed?: ImportedRun;
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
  /**
   * The first pass, only counting: a run Strava's list already describes is
   * handed over from the list (as `typed`, no bytes) instead of being opened.
   */
  lite?: boolean;
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Strava's list dates, in UTC: "Oct 12, 2026, 7:31:00 AM". ISO too, for safety. null when it can't tell. */
export function stravaDate(s: string): number | null {
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?$/i.exec(s.trim());
  if (m) {
    const mon = MONTHS.indexOf(m[1].toLowerCase());
    if (mon < 0) return null;
    let h = Number(m[4]);
    const pm = m[7]?.toUpperCase();
    if (pm === 'PM' && h < 12) h += 12;
    if (pm === 'AM' && h === 12) h = 0;
    return Date.UTC(Number(m[3]), mon, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s.trim())) {
    const t = Date.parse(s.trim().replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s.trim()) ? '' : 'Z'));
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

/** Each run line of Strava's list as a run of its own: date, distance and time, no route. */
function stravaLines(csv: string): Array<{ id: string; file: string; run: ImportedRun }> {
  const rows = csvRows(csv.replace(/^\uFEFF/, ''));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const first = (n: string) => head.indexOf(n);
  const last = (n: string) => head.lastIndexOf(n);
  const iId = first('activity id');
  const iDate = first('activity date');
  const iName = first('activity name');
  const iType = first('activity type');
  const iFile = first('filename');
  const iElapsed = last('elapsed time');
  const iMoving = last('moving time');
  const iDistFirst = first('distance');
  const iDistLast = last('distance');
  if (iId < 0 || iDate < 0 || iFile < 0 || iElapsed < 0 || iDistFirst < 0) return [];
  const out: Array<{ id: string; file: string; run: ImportedRun }> = [];
  for (const r of rows.slice(1)) {
    if (r.length < head.length / 2) continue;
    const type = iType >= 0 ? r[iType]?.trim() || null : null;
    if (type == null || !stravaIsRun(type)) continue;
    const startedAt = stravaDate(r[iDate] ?? '');
    const elapsed = num(r[iElapsed]);
    const moving = iMoving >= 0 ? num(r[iMoving]) : null;
    const metres = iDistLast > iDistFirst ? num(r[iDistLast]) : null;
    const km = num(r[iDistFirst]?.replace(',', '.'));
    const distanceM = metres != null && metres > 0 ? metres : km != null ? km * 1000 : null;
    const id = r[iId]?.trim();
    if (startedAt == null || elapsed == null || !distanceM || !id) continue;
    out.push({
      id,
      file: (r[iFile]?.trim() ?? '').replace(/\\/g, '/'),
      run: { segments: [], startedAt, endedAt: startedAt + elapsed * 1000, distanceM, movingS: moving && moving > 0 ? moving : elapsed, elevationGainM: null, sport: 'running', name: iName >= 0 ? r[iName]?.trim() || null : null, externalId: `strava:${id}` },
    });
  }
  return out;
}

/**
 * Runs in Strava's list with no file: typed in by hand there. They come in
 * with their date, distance and time, like a run added here by hand. The list
 * has two Distance columns in newer exports, km first and metres later; the
 * metres one wins when it is there.
 */
export function stravaTypedIn(csv: string): Array<{ key: string; run: ImportedRun }> {
  return stravaLines(csv)
    .filter((l) => !l.file)
    .map((l) => ({ key: `strava-typed:${l.id}`, run: l.run }));
}

/**
 * Runs in Strava's list that have a file, by file path: enough (date,
 * distance, time, id) to count and de-duplicate them without opening a single
 * file, so the preview of a whole export takes seconds instead of minutes.
 */
export function stravaListed(csv: string): Map<string, ImportedRun> {
  return new Map(stravaLines(csv).filter((l) => l.file).map((l) => [l.file, l.run]));
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
  let typedIn: ReturnType<typeof stravaTypedIn> = [];
  let listed = new Map<string, ImportedRun>();
  if (csvEntry) {
    try {
      const csv = text(await entryBytes(src, csvEntry));
      strava = readStravaCsv(csv);
      typedIn = stravaTypedIn(csv);
      if (opts.lite) listed = stravaListed(csv);
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
    const fromList = listed.get(e.name);
    if (fromList) {
      await onActivity({ key: e.name, fileName: base(e.name).replace(/\.gz$/i, ''), kind: activityKind(e.name)!, bytes: new Uint8Array(0), sport: 'running', name: fromList.name, externalId: fromList.externalId, origin: result.origin, typed: fromList });
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
  // Runs typed in by hand on Strava: no file, so they come from the list itself.
  for (const t of typedIn) {
    if (opts.only && !opts.only.has(t.key)) continue;
    await onActivity({ key: t.key, fileName: '', kind: 'gpx', bytes: new Uint8Array(0), sport: 'running', name: t.run.name, externalId: t.run.externalId, origin: result.origin, typed: t.run });
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
