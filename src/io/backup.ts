// A full backup: every table that holds something of yours, in one file you
// keep. Pure: no React Native, so `npm run test:backup` runs it in Node.
//
// The file is plain ASCII text, one JSON value per line. The first line is a
// header (what is in it, which columns each table had); every other line is a
// row, `[tableIndex, ...values]`. ASCII so it can be read and written without
// a text codec, and line by line so a long history never has to sit in memory
// as one string.

// v2 adds a last line, `{"end":true,"rows":[...]}`, with the number of rows
// written for each table. A file without it, or with other numbers, was cut
// short somewhere on its way and is never restored.
export const BACKUP_V = 2;

/** Parents first: restore inserts in this order and deletes in the reverse. */
export const BACKUP_TABLES = ['runs', 'points', 'splits', 'run_facts', 'run_sources', 'route_sigs', 'heart_rate', 'places', 'place_visits', 'routes', 'settings'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Settings keys that never go into a backup and are never replaced by one. The purchase is confirmed with the store, not carried in a file. */
export const KEEP_KEYS = ['unlock'];

export type BackupCounts = {
  runs: number;
  places: number;
  notes: number;
  plan: boolean;
  firstRunAt: number | null;
  lastRunAt: number | null;
};

export type BackupHeader = {
  app: 'runtrovert';
  kind: 'backup';
  v: number;
  madeAt: number;
  tables: Array<{ name: string; cols: string[] }>;
  counts: BackupCounts;
};

export function makeHeader(madeAt: number, tables: Array<{ name: string; cols: string[] }>, counts: BackupCounts): BackupHeader {
  return { app: 'runtrovert', kind: 'backup', v: BACKUP_V, madeAt, tables, counts };
}

/** JSON with everything outside ASCII written as \uXXXX, so one character is always one byte. */
export function asciiJson(v: unknown): string {
  return JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0x7f;
  return out;
}

function asciiText(bytes: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i += 8192) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(to, i + 8192))));
  return s;
}

/** Each line of the file, without its newline. Empty lines are skipped. */
export function* lines(bytes: Uint8Array): Generator<string> {
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 10) {
      let end = i;
      if (end > start && bytes[end - 1] === 13) end--;
      if (end > start) yield asciiText(bytes, start, end);
      start = i + 1;
    }
  }
}

export type HeaderResult = BackupHeader | 'notBackup' | 'newer';

/** What the file says it holds, read from its first line only. */
export function readHeader(bytes: Uint8Array): HeaderResult {
  // The header is small; never scan a big file that isn't ours.
  const nl = bytes.indexOf(10);
  const end = nl < 0 ? Math.min(bytes.length, 1 << 20) : nl;
  if (bytes.length === 0 || bytes[0] !== 123) return 'notBackup';
  let h: any;
  try {
    h = JSON.parse(asciiText(bytes, 0, end));
  } catch {
    return 'notBackup';
  }
  if (!h || h.app !== 'runtrovert' || h.kind !== 'backup' || typeof h.v !== 'number' || !Array.isArray(h.tables) || !h.counts) return 'notBackup';
  if (h.v > BACKUP_V) return 'newer';
  return h as BackupHeader;
}

/** The last line of a v2 file: how many rows each table (by header index) has. */
export function footer(rowsPerTable: number[]): string {
  return asciiJson({ end: true, rows: rowsPerTable });
}

/**
 * Reads the whole file before anything on the phone is touched, and says
 * whether it holds everything its header and last line promise. A restore
 * deletes first, so a file that was cut short must never get that far.
 */
export function checkComplete(bytes: Uint8Array, header: BackupHeader): 'ok' | 'incomplete' {
  // The app always ends a backup with a newline; a file cut mid-line doesn't.
  if (!bytes.length || bytes[bytes.length - 1] !== 10) return 'incomplete';
  const seen = header.tables.map(() => 0);
  let end: { rows: unknown } | null = null;
  let first = true;
  try {
    for (const line of lines(bytes)) {
      if (first) {
        first = false;
        continue;
      }
      if (end) return 'incomplete'; // nothing comes after the last line
      const v = JSON.parse(line);
      if (v && !Array.isArray(v) && v.end === true) {
        end = v;
        continue;
      }
      if (!Array.isArray(v) || typeof v[0] !== 'number' || !header.tables[v[0]]) return 'incomplete';
      seen[v[0]]++;
    }
  } catch {
    return 'incomplete';
  }
  const count = (name: string) => header.tables.reduce((n, t, i) => (t.name === name ? n + seen[i] : n), 0);
  if (count('runs') !== header.counts.runs || count('places') !== header.counts.places) return 'incomplete';
  if (header.v >= 2) {
    const want = end?.rows;
    if (!Array.isArray(want) || want.length !== seen.length || want.some((n, i) => n !== seen[i])) return 'incomplete';
  } else if (end) return 'incomplete';
  return 'ok';
}

/** Every row in the file, after the header. Lines for tables this version doesn't know are passed over. */
export function* rows(bytes: Uint8Array, header: BackupHeader): Generator<{ table: string; cols: string[]; values: unknown[] }> {
  let first = true;
  for (const line of lines(bytes)) {
    if (first) {
      first = false;
      continue;
    }
    const v = JSON.parse(line);
    if (v && !Array.isArray(v) && v.end === true) continue; // the last line, checked by checkComplete
    if (!Array.isArray(v) || typeof v[0] !== 'number') throw new Error('bad line');
    const t = header.tables[v[0]];
    if (!t) throw new Error('bad table');
    yield { table: t.name, cols: t.cols, values: v.slice(1) };
  }
}

/** The columns a backup and this version both have: names to insert, and where each sits in the backup's row. */
export function sharedCols(backupCols: string[], currentCols: string[]): { names: string[]; idx: number[] } {
  const names: string[] = [];
  const idx: number[] = [];
  backupCols.forEach((c, i) => {
    if (currentCols.includes(c)) {
      names.push(c);
      idx.push(i);
    }
  });
  return { names, idx };
}

/** One INSERT for n rows of these columns. */
export function insertSql(table: string, cols: string[], n: number): string {
  const one = `(${cols.map(() => '?').join(', ')})`;
  return `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES ${Array.from({ length: n }, () => one).join(', ')}`;
}

/** How many rows go in one INSERT, keeping well under SQLite's limit on bound values. */
export function rowsPerInsert(cols: number): number {
  return Math.max(1, Math.floor(900 / Math.max(1, cols)));
}

export function backupFileName(madeAt: number): string {
  const d = new Date(madeAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `runtrovert-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.runtrovert`;
}
