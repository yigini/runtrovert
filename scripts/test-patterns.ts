// npm run test:patterns — Your runs: the free month summary, the run list's
// sections, and energy patterns counted from the runner's own check-ins.
import assert from 'node:assert/strict';
import { energyPatterns, groupRuns, lift, LIFT_MIN, monthSummary, placesBack, shortWeekday, timeOfDay, TITLES, type PatternRun } from '../src/patterns.ts';
import type { Mood } from '../src/types.ts';

const DAY = 86400000;
/** Local time, so weekdays and hours mean what they say wherever this runs. */
const at = (y: number, m: number, d: number, h = 8) => new Date(y, m, d, h).getTime();
const NOW = at(2026, 9, 29, 21); // Thursday 29 Oct 2026

let nextId = 1;
function run(startedAt: number, before: Mood | null, after: Mood | null, distanceM = 5000, placeId: number | null = null): PatternRun {
  return { id: nextId++, startedAt, distanceM, durationS: distanceM * 0.33, moodBefore: before, moodAfter: after, placeId };
}

const FORBIDDEN = /\bscore\b|because|makes you|caused?|better for you|should|healthier|\bsafe\b|\bempty\b|always/i;
function clean(text: string) {
  assert.ok(!FORBIDDEN.test(text.replace("No score, just your answers counted.", "")), `wording: ${text}`);
}

// ---- Month summary ----
{
  const runs = [run(at(2026, 9, 1, 7), null, null, 5000), run(at(2026, 9, 28, 18), 2, 4, 6200), run(at(2026, 8, 30, 18), 3, 3, 9000)];
  const m = monthSummary(runs, NOW);
  assert.equal(m.runs, 2, 'only October counts');
  assert.equal(m.distanceM, 11200);
  assert.equal(monthSummary([], NOW).runs, 0);
  console.log('✓ month summary: this calendar month only');
}

// ---- Sections ----
{
  const runs = [
    run(at(2026, 9, 28, 18), null, null), // Wed this week
    run(at(2026, 9, 26, 8), null, null), // Mon this week
    run(at(2026, 9, 21, 18), null, null), // Wed last week
    run(at(2026, 9, 3, 9), null, null), // earlier in October
    run(at(2026, 8, 12, 9), null, null), // September
    run(at(2025, 11, 30, 9), null, null), // last year
  ];
  const g = groupRuns(runs, NOW);
  assert.deepEqual(
    g.map((x) => [x.title, x.data.length]),
    [
      ['This week', 2],
      ['Last week', 1],
      ['October', 1],
      ['September', 1],
      ['December 2025', 1],
    ],
  );
  assert.ok(g[0].data[0].startedAt > g[0].data[1].startedAt, 'newest first');
  assert.deepEqual(groupRuns([], NOW), []);
  console.log('✓ sections: this week, last week, then months');
}

// ---- Lift (the free one) ----
{
  // Ten rated runs, newest last in the dots: 7 up, 2 same, 1 down, plus older ones that don't count.
  const pairs: Array<[Mood, Mood]> = [[2, 4], [3, 4], [3, 3], [2, 3], [1, 3], [4, 3], [2, 5], [3, 3], [2, 4], [3, 4]];
  const runs = pairs.map(([b, a], i) => run(at(2026, 8, 30) + i * 3 * DAY, b, a));
  runs.push(run(at(2026, 7, 1), 4, 1), run(at(2026, 7, 2), 4, 1)); // older, outside the last ten
  runs.push(run(at(2026, 9, 28), 3, null)); // no after answer: not counted
  const l = lift(runs);
  assert.equal(l.ready, true);
  assert.equal(l.line, 'You had more energy after 7 of your last 10 runs.');
  assert.deepEqual(l.changes, ['up', 'up', 'same', 'up', 'up', 'down', 'up', 'same', 'up', 'up']);
  assert.ok(l.detail.startsWith('7 more, 2 the same, 1 less.'), l.detail);
  assert.ok(l.detail.includes('30 Sep to 27 Oct'), l.detail);
  clean(l.line);
  clean(l.detail);

  // Honest when it went the other way.
  const flat = lift(Array.from({ length: 6 }, (_, i) => run(at(2026, 9, 1 + i), 3, i < 4 ? 3 : 4)));
  assert.equal(flat.line, 'Your energy stayed the same after 4 of your last 6 runs.');
  const low = lift(Array.from({ length: 5 }, (_, i) => run(at(2026, 9, 1 + i), 4, i < 3 ? 2 : 5)));
  assert.equal(low.line, 'You had less energy after 3 of your last 5 runs.');
  const tie = lift(Array.from({ length: 6 }, (_, i) => run(at(2026, 9, 1 + i), 3, i < 3 ? 4 : 2)));
  assert.equal(tie.line, 'You had more energy after 3 of your last 6 runs.', 'a tie leads with more');

  // Too few: says what it waits for, no guess.
  const few = lift([run(at(2026, 9, 1), 2, 4), run(at(2026, 9, 2), 2, 4)]);
  assert.equal(few.ready, false);
  assert.ok(few.line.includes(String(LIFT_MIN)));
  assert.equal(few.detail, '2 runs so far.');
  assert.equal(lift([]).detail, 'None yet.');
  console.log('✓ lift:', l.line);
}

// ---- Shorter weekday runs ----
{
  const runs: PatternRun[] = [];
  // Weekdays in October: four short runs (3 km), three up; four long runs (8 km), one up.
  const weekdays = [1, 2, 5, 6, 7, 8, 9, 12].map((d) => at(2026, 9, d, 18)); // Thu 1 Oct … all Mon–Fri
  weekdays.forEach((t, i) => {
    const short = i % 2 === 0;
    const up = short ? i !== 6 : i === 1;
    runs.push(run(t, 2, up ? 4 : 2, short ? 3000 : 8000));
  });
  runs.push(run(at(2026, 9, 3, 9), 2, 2, 3000), run(at(2026, 9, 4, 9), 2, 2, 3000)); // weekend: not counted
  const s = shortWeekday(runs, NOW);
  assert.equal(s.ready, true, s.line);
  assert.equal(s.line, 'Your shorter weekday runs more often ended with more energy.');
  assert.deepEqual(s.rows, [
    { label: 'Under 5.5 km', value: 'more energy after 3 of 4' },
    { label: '5.5 km or more', value: 'more energy after 1 of 4' },
  ]);
  clean(s.line);
  clean(s.detail);

  // Same share on both sides → about as often.
  const even = runs.slice(0, 8).map((r, i) => ({ ...r, moodAfter: (i < 4 ? 4 : 2) as Mood }));
  even.forEach((r, i) => (r.distanceM = i % 2 ? 8000 : 3000));
  assert.equal(shortWeekday(even, NOW).line, 'Shorter and longer weekday runs ended with more energy about as often.');

  // All the same length: nothing to compare.
  const same = runs.slice(0, 8).map((r) => ({ ...r, distanceM: 5000 }));
  assert.equal(shortWeekday(same, NOW).ready, false);
  // Too few, and runs older than the look-back don't count.
  assert.equal(shortWeekday(runs.slice(0, 5), NOW).ready, false);
  assert.equal(shortWeekday(runs, NOW + 400 * DAY).detail, 'None yet.');
  console.log('✓ shorter weekday runs:', s.line);
}

// ---- Places you go back to ----
{
  const places = [
    { id: 1, name: 'Canal loop' },
    { id: 2, name: 'Park circle' },
    { id: 3, name: 'Hill' },
  ];
  const runs: PatternRun[] = [];
  for (let i = 0; i < 5; i++) runs.push(run(at(2026, 9, 1 + i * 3), 2, i < 4 ? 4 : 2, 5000, 1));
  for (let i = 0; i < 3; i++) runs.push(run(at(2026, 9, 2 + i * 3), null, null, 4000, 2));
  for (let i = 0; i < 2; i++) runs.push(run(at(2026, 9, 3 + i * 3), 2, 4, 4000, 3)); // only twice: not named
  runs.push(run(at(2026, 9, 20), 2, 4, 4000, 99)); // a forgotten place
  const p = placesBack(runs, places, NOW);
  assert.equal(p.ready, true);
  assert.equal(p.line, 'You went back to Canal loop most: 5 runs since 1 Oct.');
  assert.deepEqual(p.rows, [
    { label: 'Canal loop', value: '5 runs, more energy after 4 of 5' },
    { label: 'Park circle', value: '3 runs' },
  ]);
  clean(p.line);
  const none = placesBack(runs.filter((r) => r.placeId === 3), places, NOW);
  assert.equal(none.ready, false);
  assert.equal(none.detail, '2 runs in one place so far.');
  console.log('✓ places:', p.line);
}

// ---- Time of day ----
{
  const runs: PatternRun[] = [];
  for (let i = 0; i < 6; i++) runs.push(run(at(2026, 9, 1 + i, 19), 2, i < 5 ? 4 : 3)); // evenings: 5 of 6 high
  for (let i = 0; i < 4; i++) runs.push(run(at(2026, 9, 10 + i, 7), 3, i < 1 ? 5 : 3)); // mornings: 1 of 4
  for (let i = 0; i < 2; i++) runs.push(run(at(2026, 9, 20 + i, 13), 3, 5)); // middays: too few to compare
  const t = timeOfDay(runs, NOW);
  assert.equal(t.line, 'Your evening runs most often ended on Good or Recharged: 5 of 6.');
  assert.deepEqual(t.rows, [
    { label: 'Morning', value: 'Good or Recharged after 1 of 4' },
    { label: 'Evening', value: 'Good or Recharged after 5 of 6' },
  ]);
  clean(t.line);
  clean(t.detail);
  assert.equal(timeOfDay(runs.slice(0, 6), NOW).ready, false, 'one time of day is not a comparison');
  const close = runs.slice(0, 10).map((r) => ({ ...r, moodAfter: 4 as Mood }));
  assert.equal(timeOfDay(close, NOW).line, 'Your runs ended on Good or Recharged about as often at any time of day.');
  console.log('✓ time of day:', t.line);
}

// ---- All together ----
{
  const p = energyPatterns([], [], NOW);
  assert.equal(p.first.key, 'lift', 'the free one comes first');
  assert.deepEqual(p.more.map((x) => x.key), ['shortWeekday', 'places', 'timeOfDay']);
  for (const i of [p.first, ...p.more]) {
    assert.equal(i.ready, false);
    assert.equal(i.title, TITLES[i.key]);
    clean(i.line);
  }
  console.log('✓ patterns: first free, the rest wait quietly for enough runs');
}

console.log('patterns: all good');
