// npm run test:watch-solo — runs recorded on the watch alone, phone side (src/wearProtocol.ts).
import assert from 'node:assert/strict';
import { addRunChunk, parseRunChunk, runAckJson, watchRunToImported, type ChunkStore } from '../src/wearProtocol.ts';
import { shapeRun } from '../src/io/shape.ts';

const t0 = Date.UTC(2026, 10, 1, 7);
// 20 minutes east at ~3 m/s, one point every 2 s, paused from minute 8 to minute 10.
const pts: Array<[number, number, number, number | null]> = [];
for (let s = 0; s <= 1320; s += 2) {
  if (s > 480 && s < 600) continue;
  const moving = s <= 480 ? s : s - 120;
  pts.push([t0 + s * 1000, 45.0, 9.0 + (moving * 3) / 78_700, s % 10 === 0 ? 120 + s / 100 : null]);
}
const run = {
  v: 1,
  id: `${t0}-1234`,
  startedAt: t0,
  endedAt: t0 + 1320_000,
  movingS: 1200,
  distanceM: 3605.2,
  climbM: 12,
  pauses: [[t0 + 480_000, t0 + 600_000]],
  p: [...pts, [t0 + 5000, 0, 0, null], [t0 + 6000, 95, 9, null]],
  hr: [[t0 + 1000, 130], [t0 + 2000, 10], [t0 + 3000, 131.4]],
};
const json = JSON.stringify(run);

// Cut into pieces, delivered out of order, put back together.
const pieces = json.match(/[\s\S]{1,4000}/g)!;
assert.ok(pieces.length > 3);
const store: ChunkStore = new Map();
const order = pieces.map((_, i) => i).reverse();
let whole: string | null = null;
for (const i of order) {
  const c = parseRunChunk(JSON.stringify({ id: run.id, part: i, of: pieces.length, d: pieces[i] }));
  assert.ok(c);
  const got = addRunChunk(store, c, t0);
  if (i !== order[order.length - 1]) assert.equal(got, null);
  else whole = got;
}
assert.equal(whole, json);
assert.equal(store.size, 0);

// Half a run that never finishes arriving is dropped after ten minutes.
addRunChunk(store, { id: 'x', part: 0, of: 2, d: '{' }, t0);
addRunChunk(store, { id: 'y', part: 0, of: 2, d: '{' }, t0 + 11 * 60_000);
assert.ok(!store.has('x') && store.has('y'));

// Bad pieces are refused.
assert.equal(parseRunChunk('{"id":"a","part":2,"of":2,"d":""}'), null);
assert.equal(parseRunChunk('not json'), null);

// The run: cut at the pause, the watch's totals win, odd points and beats dropped.
const r = watchRunToImported(json)!;
assert.ok(r);
assert.equal(r.externalId, `watch:${run.id}`);
assert.equal(r.segments.length, 2);
assert.ok(r.segments.flat().every((p) => p.lat !== 0 && Math.abs(p.lat) <= 90));
assert.deepEqual(r.heart, [{ ts: t0 + 1000, bpm: 130 }, { ts: t0 + 3000, bpm: 131 }]);
const shaped = shapeRun(r);
assert.ok(typeof shaped !== 'string');
assert.equal(shaped.distanceM, 3605.2);
assert.equal(shaped.durationS, 1200);
assert.equal(shaped.elevationGainM, 12);
assert.equal(shaped.kmSplits.length, 3);

// Not a watch run, or a broken one: null, and the phone answers "not kept".
assert.equal(watchRunToImported('{"v":2}'), null);
assert.equal(watchRunToImported('{'), null);
assert.equal(watchRunToImported(JSON.stringify({ ...run, endedAt: t0 })), null);
assert.deepEqual(JSON.parse(runAckJson('a', false)), { id: 'a', ok: false });

// A run with no GPS fix at all still comes in on the watch's distance.
const noGps = watchRunToImported(JSON.stringify({ ...run, p: [] }))!;
assert.equal(noGps.segments.length, 0);
assert.ok(typeof shapeRun(noGps) !== 'string');

console.log('watch solo: ok');
