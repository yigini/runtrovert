// npm run test:backup — the backup file format (src/io/backup.ts).
import assert from 'node:assert/strict';
import { BACKUP_TABLES, BACKUP_V, asciiBytes, asciiJson, backupFileName, insertSql, lines, makeHeader, readHeader, rows, rowsPerInsert, sharedCols } from '../src/io/backup.ts';

// ASCII only, and it reads back to the same values, accents and all.
const note = 'Koşu güzeldi — 雨 😀 "quoted"\nnew line';
const enc = asciiJson([0, note, 1.5, null]);
assert.ok(/^[\x00-\x7e]*$/.test(enc), 'not ASCII');
assert.deepEqual(JSON.parse(enc), [0, note, 1.5, null]);

// A whole file: header, rows, read back in order.
const tables = [
  { name: 'runs', cols: ['id', 'started_at', 'note', 'old_col'] },
  { name: 'settings', cols: ['key', 'value'] },
  { name: 'gone_table', cols: ['x'] },
];
const header = makeHeader(Date.UTC(2026, 10, 1), tables, { runs: 2, places: 0, notes: 1, plan: true, firstRunAt: 1, lastRunAt: 2 });
const text = [asciiJson(header), asciiJson([0, 1, 1000, note, 'x']), asciiJson([0, 2, 2000, null, 'y']), asciiJson([1, 'settings', '{"language":"tr"}']), asciiJson([2, 9]), ''].join('\r\n');
const bytes = asciiBytes(text);
const h = readHeader(bytes);
assert.ok(typeof h === 'object');
assert.equal(h.v, BACKUP_V);
assert.equal(h.counts.notes, 1);
const got = [...rows(bytes, h)];
assert.equal(got.length, 4);
assert.equal(got[0].table, 'runs');
assert.equal(got[0].values[2], note);
assert.equal(got[2].values[1], '{"language":"tr"}');
assert.equal([...lines(bytes)].length, 5, 'CRLF and the trailing newline');

// Not ours, or from a newer app.
assert.equal(readHeader(asciiBytes('<gpx>')), 'notBackup');
assert.equal(readHeader(asciiBytes('{"app":"other"}\n')), 'notBackup');
assert.equal(readHeader(new Uint8Array(0)), 'notBackup');
assert.equal(readHeader(asciiBytes(asciiJson({ ...header, v: BACKUP_V + 1 }) + '\n')), 'newer');
assert.throws(() => [...rows(asciiBytes(asciiJson(header) + '\n[7, 1]\n'), h)]);

// Columns: a backup from an older or newer app keeps what both know.
assert.deepEqual(sharedCols(['id', 'started_at', 'note', 'old_col'], ['id', 'started_at', 'ended_at', 'note']), { names: ['id', 'started_at', 'note'], idx: [0, 1, 2] });
assert.equal(insertSql('runs', ['id', 'note'], 2), 'INSERT OR REPLACE INTO runs (id, note) VALUES (?, ?), (?, ?)');
for (const n of [1, 2, 7, 12]) assert.ok(rowsPerInsert(n) * n <= 900);

// Parents before children, so a restore never inserts a point before its run.
assert.ok(BACKUP_TABLES.indexOf('runs') < BACKUP_TABLES.indexOf('points'));
assert.ok(BACKUP_TABLES.indexOf('places') < BACKUP_TABLES.indexOf('place_visits'));
assert.ok(!BACKUP_TABLES.includes('bg_fixes' as never));
assert.match(backupFileName(Date.UTC(2026, 10, 1, 12)), /^runtrovert-backup-2026-11-0[12]\.runtrovert$/);

// A long history: 200,000 points read line by line.
const many = [asciiJson(makeHeader(0, [{ name: 'points', cols: ['run_id', 'ts', 'lat', 'lon'] }], { runs: 1, places: 0, notes: 0, plan: false, firstRunAt: 0, lastRunAt: 0 }))];
for (let i = 0; i < 200_000; i++) many.push(asciiJson([0, 1, i, 52.1 + i / 1e6, 4.3]));
const big = asciiBytes(many.join('\n'));
const hb = readHeader(big);
assert.ok(typeof hb === 'object');
let n = 0;
for (const r of rows(big, hb)) n += r.values.length === 4 ? 1 : 0;
assert.equal(n, 200_000);

console.log('backup: ok');
