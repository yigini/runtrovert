import { readFileSync } from 'node:fs';
import { fitCrc, parseFit, writeFit } from '../src/io/fit';
import { parseGpx, writeGpx } from '../src/io/gpx';
import { EMPTY_TALLY, importLine, runFileName, sameRun, shapeRun, sniff, tallySkips } from '../src/io/shape';
import type { ImportedRun } from '../src/io/types';
import { ZipWriter, crc32 } from '../src/io/zip';

// GPX and FIT in and out, against the files in scripts/samples (made by
// make-io-samples.ts). Run: npm run test:io
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sample = (name: string) => readFileSync(new URL(`./samples/${name}`, import.meta.url));
const START = Date.UTC(2026, 9, 12, 6, 31, 0);
const one = (r: ReturnType<typeof shapeRun>) => {
  if (typeof r === 'string') throw new Error(`expected a run, got ${r}`);
  return r;
};

// ---- GPX in ----------------------------------------------------------------
const strava = parseGpx(sample('strava-run.gpx').toString('utf8'));
check(strava.runs.length === 1 && strava.skipped.length === 0, 'Strava GPX: one run');
const s = strava.runs[0];
check(s.name === 'Morning Run & coffee', `entities decoded in the name (${s.name})`);
check(s.sport === 'running', 'type read');
check(s.segments.length === 1, 'one trkseg');
const sr = one(shapeRun(s));
check(sr.startedAt === START, 'starts at the first point');
check(near(sr.distanceM, 5000, 60), `distance from the track ≈ 5 km (${sr.distanceM.toFixed(0)})`);
// 2:00 standing still is a pause, so moving time stays near 5000 m at 5:30/km = 1650 s.
check(near(sr.durationS, 1650, 15), `the stop isn't running time (${sr.durationS} s)`);
check(sr.kmSplits.length === 5 || sr.kmSplits.length === 4, `km splits (${sr.kmSplits.length})`);
check(sr.kmSplits.every((k) => near(k.durationS, 330, 12)), `each km about 5:30 (${sr.kmSplits.map((k) => k.durationS.toFixed(0))})`);
check(sr.elevationGainM > 30 && sr.elevationGainM < 60, `climb from heights, wiggles ignored (${sr.elevationGainM})`);

const garmin = parseGpx(sample('garmin-two-pieces.gpx').toString('utf8'));
check(garmin.runs.length === 1, 'Garmin GPX with gpx: prefix reads');
check(garmin.runs[0].segments.length === 2, 'two trksegs stay two pieces');
const gr = one(shapeRun(garmin.runs[0]));
check(near(gr.distanceM, sr.distanceM, 5), 'same run, same distance, either attribute order');
check(near(gr.durationS, sr.durationS, 5), 'the gap between pieces is a pause');

const route = parseGpx(sample('planned-route.gpx').toString('utf8'));
check(route.runs.length === 0 && route.skipped[0] === 'no-times', 'a planned route has no times');
const ride = parseGpx(sample('ride.gpx').toString('utf8'));
check(ride.runs.length === 1 && shapeRun(ride.runs[0]) === 'not-a-run', 'a ride stays out');
check(parseGpx('<html>hello</html>').skipped[0] === 'unreadable', 'not GPX at all');
check(parseGpx('<gpx><trk><trkseg></trkseg></trk></gpx>').skipped[0] === 'too-short', 'an empty track');
const selfClosing = parseGpx(`<gpx><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.0001" lon="2"><time>${new Date(START).toISOString()}</time></trkpt></trkseg></trk></gpx>`);
check(selfClosing.runs[0]?.segments[0].length === 1, 'self-closing points without a time are left out, the rest kept');

// ---- FIT in ----------------------------------------------------------------
const watchBytes = new Uint8Array(sample('watch-run.fit'));
const watch = parseFit(watchBytes);
check(watch.runs.length === 1, `watch FIT: one run (${watch.runs.length})`);
check(watch.skipped.includes('not-a-run'), 'the cycling session stays out');
const w = watch.runs[0];
check(w.sport === 'running', 'sport read');
check(w.externalId === `fit:3999123456:${Math.round(START / 1000) - 631065600}:0`, `id from serial and time (${w.externalId})`);
check(w.segments.length === 2, `timer stop splits the track (${w.segments.length})`);
const allPts = w.segments.flat();
const gpxPts = s.segments.flat();
check(allPts.length === gpxPts.length, `every record read, compressed ones too (${allPts.length} of ${gpxPts.length})`);
check(
  allPts.every((p, i) => near(p.lat, gpxPts[i].lat, 1e-6) && near(p.lon, gpxPts[i].lon, 1e-6) && p.ts === gpxPts[i].ts),
  'positions and times match the GPX of the same run',
);
check(allPts.every((p, i) => p.alt != null && near(p.alt, gpxPts[i].alt ?? 0, 0.25)), 'heights from altitude and enhanced_altitude');
const wr = one(shapeRun(w));
check(wr.distanceM === 5012.4, 'the watch’s own distance wins');
check(wr.elevationGainM === 41, 'the watch’s own climb wins');
check(near(wr.durationS, 1650, 15), `timer time from the session (${wr.durationS})`);
check(near(wr.kmSplits[wr.kmSplits.length - 1]?.atDistanceM ?? 0, 5000, 1), 'splits stretched to the watch distance');
check(parseFit(new Uint8Array([1, 2, 3])).skipped[0] === 'unreadable', 'garbage is unreadable');
// A watch that died mid-run: the file stops halfway. Keep what's there.
const cut = parseFit(watchBytes.slice(0, Math.floor(watchBytes.length / 2)));
check(cut.runs.length === 1 && cut.runs[0].segments.flat().length > 100, 'a cut-off file keeps its first half');

// ---- Same run? ---------------------------------------------------------------
const known = { startedAt: START, endedAt: START + 1800000, distanceM: 5000 };
check(sameRun(known, { startedAt: START + 30000, endedAt: START + 1790000, distanceM: 5010 }), 'phone and watch both recorded it');
check(sameRun(known, { startedAt: START + 120000, endedAt: START + 1200000, distanceM: 3000 }), 'mostly overlapping');
check(!sameRun(known, { startedAt: START + 3 * 3600000, endedAt: START + 4 * 3600000, distanceM: 5000 }), 'the same loop later that day is a new run');
check(!sameRun(known, { startedAt: START + 1700000, endedAt: START + 3600000, distanceM: 5000 }), 'a run that starts as this one ends');
check(sameRun({ ...known, externalId: 'fit:1:2:0' }, { startedAt: 0, endedAt: 1, distanceM: 1, externalId: 'fit:1:2:0' }), 'same id');

// ---- Out: GPX and FIT round trips ---------------------------------------------
const pts = sr.points;
const gpxOut = writeGpx({ startedAt: sr.startedAt, name: 'A <quiet> run', points: pts });
check(gpxOut.includes('<name>A &lt;quiet&gt; run</name>'), 'names are escaped');
check(!/note|mood|energy|busy/i.test(gpxOut), 'nothing private goes in');
const back = parseGpx(gpxOut);
const backRun = one(shapeRun(back.runs[0]));
check(back.runs[0].segments[0].length === pts.length, 'GPX round trip keeps every point');
check(near(backRun.distanceM, sr.distanceM, 1), 'GPX round trip keeps the distance');

const fitOut = writeFit({ startedAt: sr.startedAt, endedAt: sr.endedAt, distanceM: sr.distanceM, durationS: sr.durationS, elevationGainM: sr.elevationGainM, points: pts });
check(fitCrc(fitOut, 0, 12) === (fitOut[12] | (fitOut[13] << 8)), 'header CRC');
check(fitCrc(fitOut) === 0, 'file CRC (a correct FIT file checks to 0 with its CRC included)');
const fitBack = parseFit(fitOut);
check(fitBack.runs.length === 1 && fitBack.skipped.length === 0, 'our FIT reads back as one run');
const fb = fitBack.runs[0];
check(fb.sport === 'running', 'written as running');
check(fb.startedAt === sr.startedAt && near(fb.endedAt ?? 0, sr.endedAt, 1000), 'start and end');
check(near(fb.distanceM ?? 0, sr.distanceM, 0.01) && fb.movingS === sr.durationS, 'distance and moving time');
check(fb.segments.flat().length === pts.length, 'every point');
check(fb.segments.flat().every((p, i) => near(p.lat, pts[i].lat, 1e-6) && near(p.alt ?? 0, pts[i].alt ?? 0, 0.2)), 'positions and heights survive');
const noAlt = parseFit(writeFit({ startedAt: START, endedAt: START + 600000, distanceM: 2000, durationS: 600, elevationGainM: 0, points: pts.slice(0, 200).map((p) => ({ ...p, alt: null })) }));
check(noAlt.runs[0].segments.flat().every((p) => p.alt == null), 'no height stays no height');

// Heart rate from a watch or strap rides along: GPX TrackPointExtension, FIT record field 3 and session avg/max.
const heart = pts.map((p, i) => ({ ts: p.ts, bpm: 140 + (i % 10) }));
const gpxHr = writeGpx({ startedAt: sr.startedAt, points: pts, heart });
check((gpxHr.match(/<gpxtpx:hr>\d+<\/gpxtpx:hr>/g) ?? []).length === pts.length, 'GPX: a heart rate on every point');
check(parseGpx(gpxHr).runs[0].segments[0].length === pts.length, 'GPX with heart rate still reads back');
check(!writeGpx({ startedAt: sr.startedAt, points: pts, heart: [] }).includes('gpxtpx:hr'), 'GPX: no heart rate, no extension');
const fitHr = writeFit({ startedAt: sr.startedAt, endedAt: sr.endedAt, distanceM: sr.distanceM, durationS: sr.durationS, elevationGainM: sr.elevationGainM, points: pts, heart });
check(fitCrc(fitHr) === 0, 'FIT with heart rate: CRC');
check(fitHr.length === fitOut.length + pts.length + 3 + 2 + 6, 'FIT: one byte per record, two on the session, three field definitions');
const fitHrBack = parseFit(fitHr);
check(fitHrBack.runs.length === 1 && fitHrBack.runs[0].segments.flat().length === pts.length, 'FIT with heart rate still reads back');
// ...and comes back in on import (Argon review: it used to be dropped).
const gpxBeats = parseGpx(gpxHr).runs[0].heart ?? [];
check(gpxBeats.length === pts.length && gpxBeats.every((h, i) => h.bpm === heart[i].bpm && h.ts === heart[i].ts), 'GPX import keeps heart rate');
const ns3 = gpxHr.replace(/gpxtpx:/g, 'ns3:');
check((parseGpx(ns3).runs[0].heart ?? []).length === pts.length, 'GPX import reads Garmin ns3:hr too');
const fitBeats = fitHrBack.runs[0].heart ?? [];
check(fitBeats.length === pts.length && fitBeats.every((h, i) => h.bpm === heart[i].bpm && Math.abs(h.ts - heart[i].ts) < 1000), 'FIT import keeps heart rate');
check((parseFit(fitOut).runs[0].heart ?? []).length === 0, 'FIT without heart rate: none invented');

// A treadmill run: totals, no track. Kept, since it's still a run.
const treadmill: ImportedRun = { segments: [], startedAt: START, endedAt: START + 1800000, distanceM: 5000, movingS: 1750, elevationGainM: null, sport: 'running', name: null, externalId: null };
const tr = one(shapeRun(treadmill));
check(tr.points.length === 0 && tr.distanceM === 5000 && tr.durationS === 1750, 'a run without a track keeps its totals');
check(shapeRun({ ...treadmill, distanceM: 30000 }) === 'too-fast', '30 km in 29 minutes is not a run');
check(shapeRun({ ...treadmill, distanceM: 100 }) === 'too-short', 'a few steps');

// ---- Zip ----------------------------------------------------------------------
check(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC-32 check value');
const chunks: Uint8Array[] = [];
const zip = new ZipWriter((c) => {
  chunks.push(c);
});
await zip.add('a.gpx', gpxOut, START);
await zip.add('b.fit', fitOut, START);
await zip.finish();
const total = chunks.reduce((n, c) => n + c.length, 0);
const all = new Uint8Array(total);
let at = 0;
for (const c of chunks) {
  all.set(c, at);
  at += c.length;
}
const dv = new DataView(all.buffer);
check(dv.getUint32(0, true) === 0x04034b50, 'zip starts with a local header');
check(dv.getUint32(total - 22, true) === 0x06054b50 && dv.getUint16(total - 12, true) === 2, 'zip ends with a directory of 2');
const cdStart = dv.getUint32(total - 6, true);
check(dv.getUint32(cdStart, true) === 0x02014b50, 'directory where the end record says');
// The second entry's data is our FIT file, byte for byte.
const off2 = dv.getUint32(cdStart + 46 + 5 + 42, true);
const nameLen2 = dv.getUint16(off2 + 26, true);
const data2 = all.slice(off2 + 30 + nameLen2, off2 + 30 + nameLen2 + fitOut.length);
check(data2.every((b, i) => b === fitOut[i]), 'stored entries are the files as written');
if (process.env.ZIP_OUT) (await import('node:fs')).writeFileSync(process.env.ZIP_OUT, all);

check(sniff('Morning_Run.fit', watchBytes.subarray(0, 512)) === 'fit', 'FIT by its header');
check(sniff('export', watchBytes.subarray(0, 512)) === 'fit', 'FIT without the extension');
check(sniff('a.gpx', new Uint8Array(sample('strava-run.gpx').subarray(0, 512))) === 'gpx', 'GPX');
check(sniff('download', new Uint8Array(sample('garmin-two-pieces.gpx').subarray(0, 512))) === 'gpx', 'GPX without the extension');
check(sniff('123.fit.gz', new Uint8Array([0x1f, 0x8b, 8, 0])) === 'gzip', 'Strava bulk export files are gzipped');
check(sniff('export.zip', new Uint8Array([0x50, 0x4b, 3, 4])) === 'zip', 'a whole export');
check(sniff('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === null, 'anything else');

// ---- Words --------------------------------------------------------------------
check(runFileName(Date.UTC(2026, 0, 2, 3, 4), 'gpx').endsWith('-run.gpx'), 'file names say nothing but the date');
const t = tallySkips(['duplicate', 'duplicate', 'not-a-run', 'unreadable', 'no-times'], { ...EMPTY_TALLY, added: 3 });
check(importLine(t) === 'Brought in 3 runs. 2 were already here. 1 wasn’t a run, so it stayed out. 1 file couldn’t be read. 1 had no times or was too short.', importLine(t));
check(importLine({ ...EMPTY_TALLY, duplicate: 1 }) === 'Nothing new to bring in. 1 was already here.', 'nothing new');

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('io: all good');
