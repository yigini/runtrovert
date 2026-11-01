import { parseGpx, writeGpx } from '../src/io/gpx';
import { RunSaver, importOne } from '../src/io/saver';
import { EMPTY_TALLY, type KnownRun } from '../src/io/shape';
import type { ImportedRunRow } from '../src/db';

// A big import stopped half way (the app closed, the phone slept) and then
// brought in again: what was saved stays, the rest comes in, nothing twice.
// Saving goes in handfuls, each all or nothing. Made-up runs only.
// Run: npm run test:import-resume
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 6, 7, 0, 0);
/** One made-up 20-minute run a day, heading north at about 3 m/s. */
function gpx(day: number): string {
  const startedAt = START + day * DAY;
  const points = Array.from({ length: 1200 }, (_, i) => ({ ts: startedAt + i * 1000, lat: 45 + (i * 3) / 111_320, lon: 9 + day / 1000, alt: 120 }));
  return writeGpx({ startedAt, points });
}
const files = Array.from({ length: 60 }, (_, d) => ({ name: `run-${d}.gpx`, result: parseGpx(gpx(d)) }));
check(files.every((f) => f.result.runs.length === 1), 'every made-up file reads as one run');

// The phone's database, as far as this needs: saved rows, and the spans runSpans() gives back.
const db: ImportedRunRow[] = [];
let calls = 0;
const spans = (): KnownRun[] => db.map((r) => ({ startedAt: r.run.startedAt, endedAt: r.run.endedAt, distanceM: r.run.distanceM, externalId: r.source.externalId }));

// First go: the second handful never lands (the app was closed while it was being written).
{
  let n = 0;
  const tally = { ...EMPTY_TALLY };
  const saver = new RunSaver(tally, async (rows) => {
    calls++;
    if (++n === 2) throw new Error('stopped');
    for (const r of rows) db.push(r);
    return rows.map((_, i) => db.length - rows.length + i + 1);
  });
  const known = spans();
  let stopped = false;
  try {
    for (const f of files) await importOne(f.result, f.name, 'gpx', known, tally, saver);
    await saver.flush();
  } catch {
    stopped = true;
  }
  check(stopped, 'the first go stops');
  check(db.length === 25, `one whole handful saved before the stop (${db.length})`);
  check(tally.added === 25, `the tally counts only what was saved (${tally.added})`);
}

// Second go, the same files: the rest comes in, nothing twice.
{
  calls = 0;
  const tally = { ...EMPTY_TALLY, ids: [] as number[] };
  const saver = new RunSaver(tally, async (rows) => {
    calls++;
    for (const r of rows) db.push(r);
    return rows.map((_, i) => db.length - rows.length + i + 1);
  });
  const known = spans();
  for (const f of files) await importOne(f.result, f.name, 'gpx', known, tally, saver);
  await saver.flush();
  check(db.length === 60, `all 60 runs in after the second go (${db.length})`);
  check(new Set(db.map((r) => r.run.startedAt)).size === 60, 'no run saved twice');
  check(tally.added === 35 && tally.duplicate === 25, `35 new, 25 already here (${tally.added}, ${tally.duplicate})`);
  check(tally.ids?.length === 35, 'every new id reported');
  check(calls === 2, `35 runs saved in two handfuls, not 35 trips (${calls})`);
  check(db.every((r) => r.points.length > 1000 && r.splits.length >= 3), 'points and splits go with each run');
}

// A third go finds nothing new and saves nothing.
{
  let saved = 0;
  const tally = { ...EMPTY_TALLY };
  const saver = new RunSaver(tally, async (rows) => ((saved += rows.length), rows.map(() => 0)));
  const known = spans();
  for (const f of files) await importOne(f.result, f.name, 'gpx', known, tally, saver);
  await saver.flush();
  check(saved === 0 && tally.duplicate === 60, 'a third go adds nothing');
}

// A handful also closes on points, so a few very long runs don't sit in memory together.
{
  const sizes: number[] = [];
  const saver = new RunSaver({ ...EMPTY_TALLY }, async (rows) => (sizes.push(rows.length), rows.map(() => 0)), 25, 3000);
  for (const f of files.slice(0, 6)) await importOne(f.result, f.name, 'gpx', [], { ...EMPTY_TALLY }, saver);
  await saver.flush();
  check(sizes.join() === '3,3', `closes on points as well as runs (${sizes.join()})`);
}

// Patterns are reused between calls now; reading the same file twice gives the same run.
{
  const a = parseGpx(gpx(3)).runs[0];
  const b = parseGpx(gpx(3)).runs[0];
  check(a.segments.flat().length === b.segments.flat().length && a.startedAt === b.startedAt, 'reading twice gives the same run');
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('import resume: all good');
