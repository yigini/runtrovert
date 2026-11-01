// npm run test:run-filter — Your runs › Filter on 300 made-up runs: each part
// on its own and together, words without accents or case, totals, which
// choices the sheet offers, and letting go of parts that point at nothing.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { activeCount, applyFilter, bandOf, choicesFor, fold, isEmpty, NO_FILTER, originOf, tidy, totalsOf, type FilterRun, type Names, type RunFilter } from '../src/runFilter.ts';

const f = (patch: Partial<RunFilter>): RunFilter => ({ ...NO_FILTER, ...patch });
const names: Names = {
  places: new Map([
    [1, 'Canal loop'],
    [2, 'Parc de la Tête d’Or'],
  ]),
  shoes: new Map([
    ['s1', 'Blue Pegasus'],
    ['s2', 'Old trail shoes'],
  ]),
};

/** Seeded, so a failure repeats. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const rand = rng(11);
const runs: FilterRun[] = [];
for (let i = 0; i < 300; i++) {
  const startedAt = new Date(2015 + Math.floor(i / 30), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28), 7).getTime();
  const distanceM = 2000 + Math.round(rand() * 24000);
  runs.push({
    id: i + 1,
    startedAt,
    distanceM,
    durationS: Math.round(distanceM * 0.33),
    note: i % 50 === 0 ? 'Rainy, felt great at the café' : null,
    placeId: i % 7 === 0 ? 1 : i % 11 === 0 ? 2 : null,
    origin: i < 200 ? 'imported' : i % 10 === 0 ? 'manual' : 'recorded',
    shoeId: i >= 250 ? 's1' : null,
    fromPlan: i >= 280,
  });
}

// ---- Empty means everything, and draws nothing extra ----
assert.ok(isEmpty(NO_FILTER));
assert.ok(isEmpty(f({ text: '   ' })), 'spaces are not a search');
assert.equal(applyFilter(runs, NO_FILTER, true, names), runs, 'the same list, not a copy');
assert.equal(activeCount(f({ year: 2017, month: 3, band: 'mid', text: 'x' })), 3, 'month counts with its year');

// ---- Each part ----
const y2017 = applyFilter(runs, f({ year: 2017 }), true, names);
assert.ok(y2017.length > 0 && y2017.every((r) => new Date(r.startedAt).getFullYear() === 2017));
const mar = applyFilter(runs, f({ year: 2017, month: 2 }), true, names);
assert.ok(mar.every((r) => new Date(r.startedAt).getMonth() === 2));
assert.deepEqual(applyFilter(runs, f({ month: 2 }), true, names), runs, 'a month without a year is ignored');

assert.equal(bandOf(4999, true), 'short');
assert.equal(bandOf(5000, true), 'mid');
assert.equal(bandOf(21097, true), 'long');
assert.equal(bandOf(21097.5, true), 'longest', 'a half marathon counts as half and more');
assert.equal(bandOf(4900, false), 'mid', 'over 3 miles in miles');
assert.ok(applyFilter(runs, f({ band: 'longest' }), true, names).every((r) => r.distanceM >= 21097.5));

assert.ok(applyFilter(runs, f({ placeId: 1 }), true, names).every((r) => r.placeId === 1));
assert.equal(applyFilter(runs, f({ origin: 'manual' }), true, names).length, 10);
assert.equal(applyFilter(runs, f({ shoeId: 's1' }), true, names).length, 50);
assert.equal(applyFilter(runs, f({ plan: 'plan' }), true, names).length, 20);
assert.equal(applyFilter(runs, f({ plan: 'free' }), true, names).length, 280);

assert.equal(originOf(null), 'recorded');
assert.equal(originOf('watch'), 'recorded', 'a watch run was recorded by you');
assert.equal(originOf('strava'), 'imported');
assert.equal(originOf('gpx'), 'imported');
assert.equal(originOf('manual'), 'manual');
console.log('✓ each part on its own');

// ---- Words: notes, places and shoes, any case, no accents, every word ----
assert.equal(fold('  Café   LOOP '), 'cafe loop');
assert.equal(applyFilter(runs, f({ text: 'CAFE' }), true, names).length, 6, 'a note, without its accent');
assert.equal(applyFilter(runs, f({ text: 'tete' }), true, names).length, runs.filter((r) => r.placeId === 2).length, 'a place name');
assert.equal(applyFilter(runs, f({ text: 'pegasus' }), true, names).length, 50, 'a shoe name');
assert.equal(applyFilter(runs, f({ text: 'rainy great' }), true, names).length, 6, 'every word, in any order');
assert.equal(applyFilter(runs, f({ text: 'rainy snow' }), true, names).length, 0);
console.log('✓ words: notes, places and shoes');

// ---- Together, with totals ----
const both = applyFilter(runs, f({ year: 2023, shoeId: 's1', band: 'mid' }), true, names);
assert.ok(both.every((r) => new Date(r.startedAt).getFullYear() === 2023 && r.shoeId === 's1' && r.distanceM >= 5000 && r.distanceM < 10000));
const t = totalsOf(both);
assert.equal(t.runs, both.length);
assert.equal(t.distanceM, both.reduce((a, r) => a + r.distanceM, 0));
assert.deepEqual(totalsOf([]), { runs: 0, distanceM: 0, durationS: 0 });
console.log('✓ together, with totals:', t.runs, 'runs');

// ---- What the sheet offers ----
const c = choicesFor(runs, 2017, true);
assert.deepEqual(c.years, [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015], 'newest year first');
assert.ok(c.months.length > 0 && c.months.every((m, i) => i === 0 || m > c.months[i - 1]));
assert.deepEqual(c.bands, ['short', 'mid', 'long', 'longest']);
assert.equal(c.places[0], 1, 'most-run place first');
assert.deepEqual(c.origins, ['recorded', 'imported', 'manual']);
assert.deepEqual(c.shoes, ['s1']);
assert.equal(c.plan, true);
const recordedOnly = runs.map((r) => ({ ...r, origin: 'recorded' as const, fromPlan: false }));
assert.deepEqual(choicesFor(recordedOnly, null, true).origins, [], 'nothing to choose when all came the same way');
assert.equal(choicesFor(recordedOnly, null, true).plan, false);
assert.deepEqual(choicesFor(runs, null, true).months, [], 'months only once a year is picked');
console.log('✓ the sheet offers only what would find a run');

// ---- Letting go of parts that point at nothing ----
assert.deepEqual(tidy(f({ year: 1999, month: 3, placeId: 9, shoeId: 'gone', band: 'mid' }), c), f({ band: 'mid' }));
assert.deepEqual(tidy(f({ year: 2017, placeId: 1 }), c), f({ year: 2017, placeId: 1 }));
console.log('✓ deleted places, shoes and empty years let go');

// ---- Quick with 300 runs ----
{
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) applyFilter(runs, f({ year: 2015 + (i % 10), text: 'cafe', band: 'mid' }), true, names);
  const ms = (performance.now() - t0) / 50;
  console.log(`   one filter pass over 300 runs: ${ms.toFixed(2)} ms`);
  assert.ok(ms < 20, `${ms} ms`);
}

console.log('run-filter: all good');
