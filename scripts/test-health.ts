// npm run test:health — the pure half of Health Connect (src/healthShape.ts).
import assert from 'node:assert/strict';
import { appName, pausesFrom, sessionToRun, writesToHealth } from '../src/healthShape.ts';
import { sameRun, shapeRun } from '../src/io/shape.ts';

// Only runs recorded here or added by hand go out; files and Health Connect's own don't.
assert.ok(writesToHealth(null));
assert.ok(writesToHealth({ kind: 'manual' }));
assert.ok(!writesToHealth({ kind: 'health' }));
assert.ok(!writesToHealth({ kind: 'fit' }));
assert.ok(!writesToHealth({ kind: 'gpx' }));

// Pauses are gaps in the track.
const t0 = Date.UTC(2026, 10, 1, 7);
const pts = [0, 1, 2, 3, 60, 61, 62, 200, 201].map((s) => ({ ts: t0 + s * 1000 }));
assert.deepEqual(pausesFrom(pts), [
  [t0 + 3000, t0 + 60000],
  [t0 + 62000, t0 + 200000],
]);
assert.deepEqual(pausesFrom([]), []);

// A Health Connect session becomes a run with no track, its own totals and heart rate.
const s = {
  id: 'abc-123',
  app: 'com.sec.android.app.shealth',
  title: 'Morning run',
  treadmill: false,
  startedAt: t0,
  endedAt: t0 + 35 * 60000,
  movingS: 33 * 60,
  distanceM: 6020,
  climbM: 41.5,
  heart: [
    [t0 + 1000, 120],
    [t0 + 2000, 0],
    [t0 + 3000, 300],
    [t0 + 4000, 141.6],
  ] as Array<[number, number]>,
};
const r = sessionToRun(s);
assert.equal(r.externalId, 'health:abc-123');
assert.deepEqual(r.heart, [
  { ts: t0 + 1000, bpm: 120 },
  { ts: t0 + 4000, bpm: 142 },
]);
const shaped = shapeRun(r);
assert.ok(typeof shaped !== 'string');
assert.equal(shaped.distanceM, 6020);
assert.equal(shaped.durationS, 33 * 60);
assert.equal(shaped.elevationGainM, 42);
assert.equal(shaped.points.length, 0);

// No distance (a gym session logged as a run): too short to keep, not a crash.
assert.equal(shapeRun(sessionToRun({ ...s, distanceM: null })), 'too-short');
// No moving time given: the whole span counts.
assert.equal(sessionToRun({ ...s, movingS: 0 }).movingS, 35 * 60);

// Brought in twice, or also recorded here at the same time: one run.
assert.ok(sameRun({ startedAt: t0, endedAt: t0 + 35 * 60000, distanceM: 6000 }, { ...shaped, externalId: 'health:other' }));

assert.equal(appName('com.sec.android.app.shealth'), 'Samsung Health');
assert.equal(appName('org.example.runner'), 'org.example.runner');

console.log('health: ok');
