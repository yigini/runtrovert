// npm run test:snappy — the app-wide speed pass with a big imported history:
// 237 made-up runs (YY's Strava import was 237) with full one-second tracks.
// Checks the kept answers (keptUntilChanged) are reused until the runs change,
// and times the one-off catch-up work (loops, deep summaries) that now runs a
// few runs at a time after launch instead of all at once on a screen. No real runs.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { keptUntilChanged } from '../src/batch.ts';
import { routeSignature } from '../src/places.ts';
import { runSummary } from '../src/deepMore.ts';
import { bestEfforts } from '../src/progress.ts';

// ---- keptUntilChanged ---------------------------------------------------------------
{
  let version = 0;
  let passes = 0;
  const load = keptUntilChanged(
    () => version,
    async () => {
      passes++;
      await new Promise((r) => setTimeout(r, 5));
      return passes;
    },
  );
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, 1);
  assert.equal(b, 1, 'two screens at once share one pass');
  assert.equal(await load(), 1, 'kept while nothing changed');
  assert.equal(passes, 1);
  version++;
  assert.equal(await load(), 2, 'a write means a fresh pass');
  assert.equal(await load(), 2);
  // A write while a pass is running: that answer is used once but not kept.
  version++;
  const p = load();
  version++;
  assert.equal(await p, 3);
  assert.equal(await load(), 4, 'an answer read before a write is never kept');
  assert.equal(passes, 4);
  // A failed pass is not kept either.
  let fail = true;
  const flaky = keptUntilChanged(
    () => 0,
    async () => {
      if (fail) throw new Error('read failed');
      return 'ok';
    },
  );
  await assert.rejects(flaky());
  fail = false;
  assert.equal(await flaky(), 'ok');
  console.log('keptUntilChanged: shared, kept, dropped after writes ✓');
}

// ---- One-off catch-up for 237 imported runs ---------------------------------------------
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const rand = rng(11);
function track(start: number, metres: number, seconds: number) {
  const pts: Array<{ ts: number; lat: number; lon: number; alt: number }> = [];
  const step = metres / seconds;
  let lat = 45.46, lon = 9.19, heading = rand() * Math.PI * 2, alt = 120;
  for (let i = 0; i < seconds; i++) {
    heading += (rand() - 0.5) * 0.2;
    lat += (Math.cos(heading) * step) / 111195;
    lon += (Math.sin(heading) * step) / (111195 * Math.cos((lat * Math.PI) / 180));
    alt += (rand() - 0.5) * 0.6;
    pts.push({ ts: start + i * 1000, lat, lon, alt });
  }
  return pts;
}
const N = 237;
let sigMs = 0, sumMs = 0, bestMs = 0, worst = 0, totalPts = 0;
for (let i = 0; i < N; i++) {
  const metres = 5000 + rand() * 10000;
  const seconds = Math.round(metres / 2.9);
  const pts = track(Date.UTC(2020, 0, 1) + i * 3 * 86400000, metres, seconds);
  totalPts += pts.length;
  const t0 = performance.now();
  routeSignature(pts);
  const t1 = performance.now();
  runSummary(pts, 40);
  const t2 = performance.now();
  bestEfforts(pts);
  const t3 = performance.now();
  sigMs += t1 - t0;
  sumMs += t2 - t1;
  bestMs += t3 - t2;
  worst = Math.max(worst, t3 - t0);
}
console.log(`${N} runs, ${totalPts.toLocaleString('en')} points: loops ${sigMs.toFixed(0)} ms, deep summaries ${sumMs.toFixed(0)} ms, bests ${bestMs.toFixed(0)} ms (laptop Node; a phone is roughly 5–10× slower)`);
console.log(`slowest single run ${worst.toFixed(1)} ms: done a few at a time with a breath between, the screen keeps drawing`);
// One run's work must stay small enough to sit between two frames on a phone with room to spare.
assert.ok(worst < 60, `one run's catch-up took ${worst.toFixed(1)} ms`);
console.log('test:snappy ✓');
