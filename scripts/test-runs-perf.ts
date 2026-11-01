// npm run test:runs-perf — Your runs with a big imported history: 300 made-up
// runs from 2015 on, about 1,000 GPS points each. Checks the list's sums and
// sections stay cheap, month names are looked up once per month, and the
// catch-up helpers pause and share work. No real runs are used.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { eachWithBreaks, singleFlight } from '../src/batch.ts';
import { energyPatterns, groupRuns, monthSummary, type PatternRun } from '../src/patterns.ts';
import { bestEfforts, bests, trends, type RunFacts, type TimedPoint } from '../src/progress.ts';
import type { Mood } from '../src/types.ts';

const DAY = 86400000;
const NOW = new Date(2026, 10, 1, 21).getTime();
const N = 300;

/** Seeded, so a slow case repeats. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const rand = rng(7);

/** About 1,000 fixes, one every 2–3 s, wandering round a loop. */
function track(start: number, metres: number): TimedPoint[] {
  const pts: TimedPoint[] = [];
  const n = 1000;
  const step = metres / n;
  let lat = 52.37, lon = 4.89, ts = start, heading = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    heading += (rand() - 0.5) * 0.3;
    lat += (Math.cos(heading) * step) / 111195;
    lon += (Math.sin(heading) * step) / (111195 * Math.cos((lat * Math.PI) / 180));
    ts += 2000 + Math.round(rand() * 1000);
    pts.push({ ts, lat, lon });
  }
  return pts;
}

const runs: Array<PatternRun & { elevationGainM: number }> = [];
const first = new Date(2015, 2, 1).getTime();
for (let i = 0; i < N; i++) {
  const startedAt = first + Math.round(((NOW - first) * i) / N) + Math.round(rand() * DAY);
  const distanceM = 3000 + Math.round(rand() * 9000);
  const rated = rand() < 0.6;
  runs.push({
    id: i + 1,
    startedAt,
    distanceM,
    durationS: Math.round(distanceM * (0.3 + rand() * 0.06)),
    elevationGainM: Math.round(rand() * 80),
    moodBefore: rated ? ((1 + Math.floor(rand() * 5)) as Mood) : null,
    moodAfter: rated ? ((1 + Math.floor(rand() * 5)) as Mood) : null,
    placeId: rand() < 0.3 ? 1 + Math.floor(rand() * 4) : null,
  });
}

function time<T>(label: string, budgetMs: number, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  console.log(`   ${label}: ${ms.toFixed(1)} ms (budget ${budgetMs} ms)`);
  assert.ok(ms < budgetMs, `${label} took ${ms.toFixed(1)} ms`);
  return out;
}

// ---- The list ----
{
  let lookups = 0;
  const groups = time('sections for 300 runs', 50, () =>
    groupRuns(runs, NOW, (t) => {
      lookups++;
      return new Date(t).toLocaleDateString('en', { month: 'long' });
    }),
  );
  const months = new Set(runs.map((r) => `${new Date(r.startedAt).getFullYear()}-${new Date(r.startedAt).getMonth()}`)).size;
  assert.ok(lookups <= months, `month names looked up ${lookups} times for ${months} months`);
  assert.equal(groups.reduce((a, g) => a + g.data.length, 0), N, 'every run lands in one section');
  for (let i = 1; i < groups.length; i++) assert.notEqual(groups[i].key, groups[i - 1].key, 'one section per month');
  time('month summary', 10, () => monthSummary(runs, NOW));
  time('energy patterns', 50, () => energyPatterns(runs, [1, 2, 3, 4].map((id) => ({ id, name: `Loop ${id}` })), NOW));
  console.log('✓ list: sections and summaries stay cheap with 300 runs');
}

// ---- Bests: the one-time catch-up after an import, then the cheap part ----
{
  const tracks = runs.map((r) => track(r.startedAt, r.distanceM));
  const facts: RunFacts[] = time('bests inside 300 runs × 1,000 points (once, then stored)', 3000, () =>
    runs.map((r, i) => ({ id: r.id, startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, elevationGainM: r.elevationGainM, moodBefore: r.moodBefore, moodAfter: r.moodAfter, efforts: bestEfforts(tracks[i]) })),
  );
  time('bests and trends from stored facts', 50, () => {
    bests(facts);
    bests(facts, NOW - 90 * DAY);
    trends(facts, NOW);
  });
  console.log('✓ bests: worked out once per run, cheap after that');
}

// ---- Pauses and shared passes ----
{
  // A fake clock: each item "takes" 5 ms, so a 12 ms slice pauses about every third item.
  let t = 0;
  const seen: number[] = [];
  const pauses = await eachWithBreaks(Array.from({ length: 30 }, (_, i) => i), (i) => {
    seen.push(i);
    t += 5;
  }, 12, () => t);
  assert.deepEqual(seen, Array.from({ length: 30 }, (_, i) => i), 'every item, in order');
  assert.equal(pauses, 9, 'pauses between slices, never after the last item');
  assert.equal(await eachWithBreaks([], () => {}), 0);

  let calls = 0;
  const load = singleFlight(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return calls;
  });
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(calls, 1, 'two screens asking at once share one pass');
  assert.equal(a, b);
  assert.equal(await load(), 2, 'a later call starts fresh, so it sees new runs');
  const failing = singleFlight(async () => {
    throw new Error('no db');
  });
  await assert.rejects(failing());
  await assert.rejects(failing(), 'a failure is not kept');
  console.log('✓ catch-up: pauses between slices, one shared pass at a time');
}

console.log('runs-perf: all good');
