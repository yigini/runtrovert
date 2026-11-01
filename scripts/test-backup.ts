// npm run test:backup — the backup file format (src/io/backup.ts).
import assert from 'node:assert/strict';
import { BACKUP_TABLES, BACKUP_V, asciiBytes, asciiJson, backupFileName, checkComplete, footer, insertSql, lines, makeHeader, readHeader, rows, rowsPerInsert, sharedCols } from '../src/io/backup.ts';

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

// Completeness (Pip's audit, 1 Nov): a file cut short is never restored, wherever it was cut.
{
  const tbl = [
    { name: 'runs', cols: ['id', 'note'] },
    { name: 'points', cols: ['run_id', 'ts'] },
    { name: 'places', cols: ['id'] },
    { name: 'settings', cols: ['key', 'value'] },
  ];
  const hd = makeHeader(0, tbl, { runs: 2, places: 1, notes: 1, plan: false, firstRunAt: 0, lastRunAt: 1 });
  const body = [asciiJson([0, 1, 'hi']), asciiJson([0, 2, null]), asciiJson([1, 1, 10]), asciiJson([1, 1, 11]), asciiJson([1, 2, 12]), asciiJson([2, 5]), asciiJson([3, 'units', 'km'])];
  const full = [asciiJson(hd), ...body, footer([2, 3, 1, 1])].join('\n') + '\n';
  const fb = asciiBytes(full);
  const fh = readHeader(fb);
  assert.ok(typeof fh === 'object');
  assert.equal(checkComplete(fb, fh), 'ok');
  assert.equal([...rows(fb, fh)].length, 7, 'the last line is not a row');
  const bad = (text: string, why: string) => assert.equal(checkComplete(asciiBytes(text), fh), 'incomplete', why);
  bad(asciiJson(hd) + '\n', 'header only');
  bad([asciiJson(hd), ...body].join('\n') + '\n', 'no last line');
  bad([asciiJson(hd), ...body.slice(0, 4)].join('\n') + '\n', 'cut at a row boundary');
  bad(full.slice(0, full.length - 10), 'cut inside the last line');
  bad([asciiJson(hd), ...body.slice(0, 3)].join('\n') + '\n' + body[3].slice(0, 5), 'cut inside a row');
  bad([asciiJson(hd), ...body, footer([2, 2, 1, 1])].join('\n') + '\n', 'a row went missing (count mismatch)');
  bad([asciiJson(hd), ...body.filter((_, i) => i !== 2), footer([2, 3, 1, 1])].join('\n') + '\n', 'row missing, footer kept');
  bad([asciiJson(hd), ...body, footer([2, 3, 1, 1]), asciiJson([0, 3, null])].join('\n') + '\n', 'rows after the last line');
  bad([asciiJson(hd), asciiJson([0, 1, 'hi']), ...body.slice(2), footer([1, 3, 1, 1])].join('\n') + '\n', 'fewer runs than the header promises');
  bad([asciiJson(hd), ...body, asciiJson([9, 1]), footer([2, 3, 1, 1])].join('\n') + '\n', 'unknown table index');
  // A v1 file (before the last line existed): runs and places must match the header, and it must end cleanly.
  const h1 = { ...hd, v: 1 };
  const v1 = [asciiJson(h1), ...body].join('\n') + '\n';
  assert.equal(checkComplete(asciiBytes(v1), h1), 'ok');
  assert.equal(checkComplete(asciiBytes(asciiJson(h1) + '\n'), h1), 'incomplete', 'v1 header only');
  assert.equal(checkComplete(asciiBytes(v1.slice(0, -3)), h1), 'incomplete', 'v1 cut mid-line');
}
console.log('backup completeness: ok');
