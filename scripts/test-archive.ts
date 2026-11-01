import { readFileSync } from 'node:fs';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { activityKind, csvRows, readStravaCsv, stravaDate, stravaIsRun, stravaTypedIn, walkArchive, type Activity } from '../src/io/archive';
import { parseFit } from '../src/io/fit';
import { parseGpx, writeGpx } from '../src/io/gpx';
import { sameRun, shapeRun } from '../src/io/shape';
import { parseTcx } from '../src/io/tcx';
import { ZipWriter, crc32 } from '../src/io/zip';
import { entryBytes, gunzip, isZip, listZip, memorySource, streamEntry, text } from '../src/io/unzip';

// Whole exports in: zips read in pieces, Strava's list, Garmin's zips inside
// the zip, TCX. Archives are built here with Node's own deflate, so the test
// needs nothing installed. Run: npm run test:archive
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}
const sample = (name: string) => new Uint8Array(readFileSync(new URL(`./samples/${name}`, import.meta.url)));
const enc = (s: string) => new TextEncoder().encode(s);
const START = Date.UTC(2026, 9, 12, 6, 31, 0);

/** A deflated zip, the way Strava and Garmin write theirs. */
function deflatedZip(files: Array<[string, Uint8Array]>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = enc(name);
    const comp = new Uint8Array(deflateRawSync(data));
    const crc = crc32(data);
    const h = new Uint8Array(30 + n.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(8, 8, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, comp.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    h.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    parts.push(h, comp);
    central.push(c);
    offset += h.length + comp.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const p of all) out.set(p, o), (o += p.length);
  return out;
}

/** A run as GPX at a given start, 3 km at 5:30/km. */
function gpxRun(start: number, type = 'running'): Uint8Array {
  const points = Array.from({ length: 200 }, (_, i) => ({ ts: start + i * 5000, lat: 45 + i * 0.000135, lon: 9, alt: 100 }));
  return enc(writeGpx({ startedAt: start, points }).replace('<type>running</type>', `<type>${type}</type>`));
}

const TCX = (start: number, withTrack: boolean) => `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${new Date(start).toISOString()}</Id>
<Lap StartTime="${new Date(start).toISOString()}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters>
${withTrack ? `<Track>${Array.from({ length: 50 }, (_, i) => `<Trackpoint><Time>${new Date(start + i * 36000).toISOString()}</Time><Position><LatitudeDegrees>${45 + i * 0.0009}</LatitudeDegrees><LongitudeDegrees>9</LongitudeDegrees></Position><AltitudeMeters>100</AltitudeMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>`).join('')}</Track>` : ''}
</Lap></Activity></Activities></TrainingCenterDatabase>`;

async function collect(zip: Uint8Array, only?: Set<string>) {
  const got: Activity[] = [];
  const r = await walkArchive(memorySource(zip), { spill: async (src, e) => memorySource(await entryBytes(src, e)), only }, async (a) => void got.push(a));
  return { got, r };
}

// ---- The zip reader ------------------------------------------------------------
const big = new Uint8Array(600_000).map(() => Math.floor(Math.random() * 256));
const z = deflatedZip([['folder/a.txt', enc('hello')], ['big.bin', big]]);
const entries = await listZip(memorySource(z));
check(entries.length === 2 && entries[0].name === 'folder/a.txt', 'directory read');
check(text(await entryBytes(memorySource(z), entries[0])) === 'hello', 'a deflated entry');
const pieces: number[] = [];
await streamEntry(memorySource(z), entries[1], (c) => void pieces.push(c.length));
check(pieces.length > 1 && pieces.reduce((a, b) => a + b, 0) === big.length, `a big entry comes in pieces (${pieces.length})`);
check((await entryBytes(memorySource(z), entries[1])).every((b, i) => b === big[i]), 'and whole again, byte for byte');
// Stored entries, from our own writer (the "all runs" zip comes back in).
const chunks: Uint8Array[] = [];
const w = new ZipWriter((c) => void chunks.push(c));
await w.add('one.gpx', gpxRun(START), START);
await w.finish();
const stored = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
chunks.reduce((o, c) => (stored.set(c, o), o + c.length), 0);
const se = await listZip(memorySource(stored));
check(se.length === 1 && se[0].method === 0 && parseGpx(text(await entryBytes(memorySource(stored), se[0]))).runs.length === 1, 'a stored zip reads too');
check(isZip(stored) && !isZip(enc('<gpx')), 'zip by its first bytes');
let threw = false;
await listZip(memorySource(enc('not a zip at all'))).catch(() => (threw = true));
check(threw, 'not a zip says so');
check(text(gunzip(new Uint8Array(gzipSync(enc('squeezed'))))) === 'squeezed', 'gzip');

// ---- TCX ---------------------------------------------------------------------
const tcx = parseTcx(TCX(START, true));
check(tcx.runs.length === 1 && tcx.runs[0].sport === 'running', 'TCX: one run');
check(tcx.runs[0].segments[0].length === 50 && tcx.runs[0].heart?.length === 50, 'TCX: points and heart rate');
const tcxShaped = shapeRun(tcx.runs[0]);
check(typeof tcxShaped !== 'string' && tcxShaped.distanceM === 5000 && tcxShaped.durationS === 1800, 'TCX: the lap totals win');
const treadmill = shapeRun(parseTcx(TCX(START, false)).runs[0]);
check(typeof treadmill !== 'string' && treadmill.points.length === 0 && treadmill.distanceM === 5000, 'TCX treadmill run: totals, no route');
check(parseTcx('<gpx/>').skipped[0] === 'unreadable', 'TCX: not TCX');
check(parseTcx('<TrainingCenterDatabase><Courses><Course><Name>x</Name></Course></Courses></TrainingCenterDatabase>').skipped[0] === 'no-times', 'TCX: a course is a route, not a run');

// ---- Strava's list ---------------------------------------------------------------
check(csvRows('a,"b, c","say ""hi"""\n1,2,3').join('|') === 'a,b, c,say "hi"|1,2,3', 'CSV quotes');
const csv =
  '﻿Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Filename\n' +
  '101,"Oct 12, 2026",Morning Run,Run,"a ""good"" one\nwith a line break",1800,5,activities/101.gpx\n' +
  '102,"Oct 13, 2026",Commute,Ride,,1800,15,activities/102.gpx.gz\n' +
  '103,"Oct 14, 2026",Treadmill,Virtual Run,,1800,5,activities/103.tcx.gz\n' +
  '104,"Oct 15, 2026",Yoga,Yoga,,1800,0,\n' +
  '105,"Oct 16, 2026",Watch run,Run,,1800,5,activities/105.fit.gz\n';
const list = readStravaCsv(csv);
check(list.size === 4 && list.get('activities/101.gpx')?.name === 'Morning Run', 'Strava list read, multi-line description and all');
check(stravaIsRun('Run') && stravaIsRun('Virtual Run') && stravaIsRun('Trail Run') && !stravaIsRun('Ride') && !stravaIsRun('Walk'), 'Strava types');
check(activityKind('activities/1.fit.gz') === 'fit' && activityKind('x/2.TCX') === 'tcx' && activityKind('photo.jpg') === null, 'kinds by name');

// ---- A Strava export ----------------------------------------------------------------
const DAY = 86_400_000;
const strava = deflatedZip([
  ['activities.csv', enc(csv)],
  ['activities/101.gpx', gpxRun(START)],
  ['activities/102.gpx.gz', new Uint8Array(gzipSync(gpxRun(START + DAY, 'running')))],
  ['activities/103.tcx.gz', new Uint8Array(gzipSync(enc(TCX(START + 2 * DAY, false))))],
  ['activities/105.fit.gz', new Uint8Array(gzipSync(sample('watch-run.fit')))],
  ['media/photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])],
  ['profile.csv', enc('a,b\n1,2')],
]);
const s = await collect(strava);
check(s.r.origin === 'strava', 'Strava export recognised');
check(s.r.notRun === 1, `the ride is left out by the list, never opened (${s.r.notRun})`);
check(s.got.map((a) => a.key).join(',') === 'activities/101.gpx,activities/103.tcx.gz,activities/105.fit.gz', `runs only, photos never read (${s.got.map((a) => a.key)})`);
const first = s.got[0];
check(first.externalId === 'strava:101' && first.name === 'Morning Run' && first.origin === 'strava', 'the list names the run');
check(s.got[1].fileName === '103.tcx' && s.got[1].kind === 'tcx' && parseTcx(text(s.got[1].bytes)).runs.length === 1, 'gzipped TCX opened');
check(parseFit(s.got[2].bytes).runs.length === 1, 'gzipped FIT opened');
const only = await collect(strava, new Set(['activities/105.fit.gz']));
check(only.got.length === 1 && only.got[0].key === 'activities/105.fit.gz', 'the second pass reads only what it was told');

// ---- Runs typed in by hand on Strava: a line in the list, no file ---------------------------
check(stravaDate('Oct 12, 2026, 7:31:00 AM') === Date.UTC(2026, 9, 12, 7, 31, 0), 'Strava date, morning');
check(stravaDate('Jan 3, 2020, 12:05:09 PM') === Date.UTC(2020, 0, 3, 12, 5, 9), 'Strava date, noon');
check(stravaDate('Jan 3, 2020, 12:05:09 AM') === Date.UTC(2020, 0, 3, 0, 5, 9), 'Strava date, midnight');
check(stravaDate('2020-01-03 18:30:00') === Date.UTC(2020, 0, 3, 18, 30, 0), 'ISO date');
check(stravaDate('3 janvier 2020') === null, 'a date it cannot read is left alone');
// The newer list: km first, metres later; elapsed and moving time twice too.
const csv2 =
  'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Filename,Elapsed Time,Moving Time,Distance\n' +
  '201,"Oct 12, 2026, 6:31:00 AM",Morning Run,Run,,1800,5.01,,activities/201.gpx,1800,1700,5012.3\n' +
  '202,"Oct 13, 2026, 6:00:00 PM",Track by hand,Run,,2400,8.00,,,2400,2300,8000.0\n' +
  '203,"Oct 14, 2026, 6:00:00 PM",Gym,Weight Training,,3600,0,,,3600,3600,0\n' +
  '204,"Oct 15, 2026, 6:00:00 PM",No distance,Run,,600,,,,600,600,\n';
const typed = stravaTypedIn(csv2);
check(typed.length === 1 && typed[0].key === 'strava-typed:202', `only the hand-typed run with a distance (${typed.map((t) => t.key)})`);
const tr = typed[0].run;
check(tr.startedAt === Date.UTC(2026, 9, 13, 18, 0, 0) && tr.endedAt === tr.startedAt! + 2_400_000, 'its start and end');
check(tr.distanceM === 8000 && tr.movingS === 2300 && tr.externalId === 'strava:202' && tr.name === 'Track by hand', 'metres and moving time win');
const shapedTyped = shapeRun(tr);
check(typeof shapedTyped !== 'string' && shapedTyped.points.length === 0 && shapedTyped.distanceM === 8000 && shapedTyped.durationS === 2300, 'comes in like a run added by hand');
check(stravaTypedIn(csv).length === 0, 'the older list without times: nothing typed comes in');
const strava2 = deflatedZip([['activities.csv', enc(csv2)], ['activities/201.gpx', gpxRun(START)]]);
const s2 = await collect(strava2);
check(s2.got.map((a) => a.key).join(',') === 'activities/201.gpx,strava-typed:202', `file runs, then typed ones (${s2.got.map((a) => a.key)})`);
check(s2.got[1].typed === tr || s2.got[1].typed?.distanceM === 8000, 'the typed run travels with its numbers');
const only2 = await collect(strava2, new Set(['strava-typed:202']));
check(only2.got.length === 1 && only2.got[0].typed != null, 'the second pass can ask for a typed run alone');

// Two hand-typed runs the same morning, overlapping times: two Strava ids, two runs.
const am = Date.UTC(2026, 2, 1, 7, 0);
check(!sameRun({ startedAt: am, endedAt: am + 3_600_000, distanceM: 10000, externalId: 'strava:1001' }, { startedAt: am + 1_800_000, endedAt: am + 3_000_000, distanceM: 2000, externalId: 'strava:1002' }), 'different Strava ids are different runs');
check(sameRun({ startedAt: am, endedAt: am + 3_600_000, distanceM: 10000, externalId: 'strava:1' }, { startedAt: am, endedAt: am + 3_600_000, distanceM: 10000, externalId: 'fit:9:9:0' }), 'a Strava run and the watch file of it are still one run');

// ---- A Garmin export: zips inside the zip ------------------------------------------------
const part1 = deflatedZip([
  ['run_1111.fit', sample('watch-run.fit')],
  ['ride_2222.gpx', gpxRun(START + 5 * DAY, 'cycling')],
]);
const part2 = deflatedZip([['old_3333.tcx', enc(TCX(START + 9 * DAY, true))]]);
const garmin = deflatedZip([
  ['DI_CONNECT/DI-Connect-Fitness/me_summarizedActivities.json', enc('[]')],
  ['DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip', part1],
  ['DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part2.zip', part2],
]);
const g = await collect(garmin);
check(g.r.origin === 'garmin', 'Garmin export recognised');
check(g.got.length === 3 && g.got.every((a) => a.origin === 'garmin'), `every file inside the inner zips (${g.got.length})`);
check(g.got[0].key === 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip>run_1111.fit', `keys say where (${g.got[0].key})`);
const ride = parseGpx(text(g.got[1].bytes)).runs[0];
check(shapeRun(ride) === 'not-a-run', 'a ride with no list is judged by the file');
let spilled = 0;
const again: Activity[] = [];
await walkArchive(memorySource(garmin), { only: new Set(['DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part2.zip>old_3333.tcx']), spill: async (src, e) => (spilled++, memorySource(await entryBytes(src, e))) }, async (a) => void again.push(a));
check(again.length === 1 && spilled === 1, `second pass opens only the inner zip it needs (${spilled})`);
const broken = deflatedZip([['UploadedFiles.zip', enc('not really a zip')], ['a.gpx', gpxRun(START)]]);
const b = await collect(broken);
check(b.got.length === 1 && b.r.unreadable === 0, 'an inner file that is not a zip is passed over');

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('archive: all good');
