import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db';
import { forgetCommute } from '../commuteStore';
import { forgetShoes } from '../shoeStore';
import { forgetValues } from '../valueStore';
import { ui } from '../i18n/ui';
import {
  BACKUP_TABLES,
  KEEP_KEYS,
  asciiBytes,
  asciiJson,
  backupFileName,
  insertSql,
  makeHeader,
  readHeader,
  rows,
  rowsPerInsert,
  sharedCols,
  type BackupCounts,
  type BackupHeader,
} from './backup';

// Backup and restore on the phone. The file leaves through the share sheet and
// comes back through the system file picker, like run files: no storage
// permission, no network, no account. See backup.ts for the format.

async function columns(table: string): Promise<string[]> {
  const db = await getDb();
  const cols = (await db.getAllAsync(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

/** What is on this phone now, in the terms a backup describes itself. */
export async function currentCounts(): Promise<BackupCounts> {
  const db = await getDb();
  const one = async (sql: string) => ((await db.getFirstAsync(sql)) as { n: number | null } | null)?.n ?? 0;
  const span = (await db.getFirstAsync('SELECT MIN(started_at) AS a, MAX(started_at) AS b FROM runs')) as { a: number | null; b: number | null } | null;
  return {
    runs: await one('SELECT COUNT(*) AS n FROM runs'),
    places: await one('SELECT COUNT(*) AS n FROM places'),
    notes: (await one("SELECT COUNT(*) AS n FROM runs WHERE note IS NOT NULL AND note <> ''")) + (await one("SELECT COUNT(*) AS n FROM place_visits WHERE note IS NOT NULL AND note <> ''")),
    plan: (await one("SELECT COUNT(*) AS n FROM settings WHERE key = 'trainingPlan'")) > 0,
    firstRunAt: span?.a ?? null,
    lastRunAt: span?.b ?? null,
  };
}

/** Writes every table to one file and opens the share sheet. Free, always: keeping your own data safe is never for sale. */
export async function shareBackup(onProgress?: (done: number, total: number) => void): Promise<BackupCounts> {
  const db = await getDb();
  const madeAt = Date.now();
  const tables = await Promise.all(BACKUP_TABLES.map(async (name) => ({ name, cols: await columns(name) })));
  const counts = await currentCounts();
  const file = new File(Paths.cache, backupFileName(madeAt));
  if (file.exists) file.delete();
  file.create();
  const handle = file.open(FileMode.Truncate);
  let buf = '';
  const flush = async (force = false) => {
    if (!buf || (!force && buf.length < 256 * 1024)) return;
    await handle.writeBytes(asciiBytes(buf));
    buf = '';
  };
  try {
    buf += asciiJson(makeHeader(madeAt, tables, counts)) + '\n';
    for (const [t, { name, cols }] of tables.entries()) {
      onProgress?.(t, tables.length);
      let last = -1;
      for (;;) {
        // Page by rowid so a long history is read a slice at a time.
        const page = (await db.getAllAsync(`SELECT rowid AS _rowid, * FROM ${name} WHERE rowid > ? ORDER BY rowid LIMIT 2000`, last)) as Array<Record<string, unknown>>;
        if (!page.length) break;
        for (const r of page) {
          last = r._rowid as number;
          if (name === 'settings' && KEEP_KEYS.includes(r.key as string)) continue;
          buf += asciiJson([t, ...cols.map((c) => r[c] ?? null)]) + '\n';
        }
        await flush();
      }
    }
    await flush(true);
  } finally {
    handle.close();
  }
  onProgress?.(tables.length, tables.length);
  if (!(await Sharing.isAvailableAsync())) throw new Error(ui().store.sharingIsnTAvailableHere(file.uri));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: ui().backup.saveYourBackup });
  return counts;
}

export type PickedBackup = { header: BackupHeader; bytes: Uint8Array };

/** Opens the file picker for one backup file. null if nothing was picked. */
export async function pickBackup(): Promise<PickedBackup | 'notBackup' | 'newer' | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  const f = Array.isArray(picked.result) ? picked.result[0] : picked.result;
  if (!f) return null;
  const bytes = await f.bytes();
  const header = readHeader(bytes);
  if (typeof header === 'string') return header;
  return { header, bytes };
}

/**
 * Replaces everything on this phone with what the backup holds, in one
 * transaction: if anything goes wrong, the phone keeps what it had. The
 * purchase stays as it is on this phone (and Restore purchase on the unlock
 * screen asks the store).
 */
export async function restoreBackup(picked: PickedBackup): Promise<void> {
  const db = await getDb();
  const { header, bytes } = picked;
  const current = new Map<string, string[]>();
  for (const name of BACKUP_TABLES) current.set(name, await columns(name));
  const plan = new Map<string, { names: string[]; idx: number[]; keyAt: number }>();
  for (const t of header.tables) {
    const cur = current.get(t.name);
    if (!cur) continue; // a table this version doesn't have
    const shared = sharedCols(t.cols, cur);
    if (shared.names.length) plan.set(t.name, { ...shared, keyAt: t.cols.indexOf('key') });
  }
  await db.withTransactionAsync(async () => {
    for (const name of [...BACKUP_TABLES].reverse()) {
      if (name === 'settings') await db.runAsync(`DELETE FROM settings WHERE key NOT IN (${KEEP_KEYS.map(() => '?').join(', ')})`, ...KEEP_KEYS);
      else await db.runAsync(`DELETE FROM ${name}`);
    }
    let table: string | null = null;
    let batch: unknown[][] = [];
    const flush = async () => {
      if (!table || !batch.length) return;
      const p = plan.get(table)!;
      await db.runAsync(insertSql(table, p.names, batch.length), ...(batch.flat() as any[]));
      batch = [];
    };
    for (const r of rows(bytes, header)) {
      const p = plan.get(r.table);
      if (!p) continue;
      if (r.table === 'settings' && KEEP_KEYS.includes(r.values[p.keyAt] as string)) continue;
      if (r.table !== table || batch.length >= rowsPerInsert(p.names.length)) {
        await flush();
        table = r.table;
      }
      batch.push(p.idx.map((i) => r.values[i] ?? null));
    }
    await flush();
    // The live-run buffer belongs to this phone's last run, not to the backup.
    await db.runAsync('DELETE FROM bg_fixes');
  });
  forgetCommute();
  forgetShoes();
  forgetValues();
}
