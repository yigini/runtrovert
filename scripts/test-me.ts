// npm run test:me — the Me tab's plain sums: lifetime totals, years, this
// week's days, the journey line, top places and runs to work. Also checks
// every language gives the journey line one name per distance.
import assert from 'node:assert/strict';
import { bestYear, commutesThisMonth, EARTH_KM, journey, JOURNEY_KM, lifetime, topPlaces, weekDays, years } from '../src/me.ts';
import { UI } from '../src/i18n/ui/index.ts';

const at = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h).getTime();
const run = (id: number, t: number, km: number, min: number) => ({ id, startedAt: t, distanceM: km * 1000, durationS: min * 60 });

// Lifetime: sums, the first run's date, nothing negative counted.
const runs = [run(1, at(2015, 3, 14), 5, 30), run(2, at(2023, 6, 1), 10, 55), run(3, at(2023, 7, 1), 12, 65), run(4, at(2026, 10, 27), 8, 44), run(5, at(2026, 10, 29), -1, 10)];
const life = lifetime(runs);
assert.equal(life.runs, 5);
assert.equal(life.distanceM, 35000);
assert.equal(life.durationS, (30 + 55 + 65 + 44 + 10) * 60);
assert.equal(life.firstAt, at(2015, 3, 14));
assert.deepEqual(lifetime([]), { runs: 0, distanceM: 0, durationS: 0, firstAt: null });

// Years: newest first, gaps left out, the biggest marked.
const ys = years(runs);
assert.deepEqual(ys.map((y) => y.year), [2026, 2023, 2015]);
assert.equal(ys[1].distanceM, 22000);
assert.equal(ys[1].runs, 2);
assert.equal(bestYear(ys), 2023);
assert.equal(bestYear([]), null);
assert.equal(bestYear([{ year: 2020, runs: 1, distanceM: 5 }, { year: 2021, runs: 1, distanceM: 5 }]), 2021, 'a tie goes to the later year');

// This week: Monday 26 Oct 2026 to Sunday 1 Nov; a dot per day with a run, nothing else.
const now = at(2026, 11, 1, 20);
assert.deepEqual(weekDays(runs, now), [false, true, false, true, false, false, false]);
assert.deepEqual(weekDays([run(9, at(2026, 11, 1, 7), 5, 30), run(10, at(2026, 10, 25, 9), 5, 30)], now), [false, false, false, false, false, false, true], 'last Sunday belongs to last week');

// Journey: never claims more than about the distance.
assert.deepEqual(journey(20_000), { kind: 'none' });
assert.deepEqual(journey(100_000), { kind: 'marathons', n: 2 });
assert.deepEqual(journey(320_000), { kind: 'trip', index: 0 }, 'within a tenth of Paris to London');
assert.deepEqual(journey(2_764_000), { kind: 'trip', index: 5 });
assert.deepEqual(journey(9_000_000), { kind: 'trip', index: 8 });
assert.deepEqual(journey(EARTH_KM * 1000 * 2), { kind: 'earth', n: 2 });
for (let i = 1; i < JOURNEY_KM.length; i++) assert.ok(JOURNEY_KM[i] > JOURNEY_KM[i - 1], 'journeys go shortest first');
for (const [l, s] of Object.entries(UI)) assert.equal(s!.me.journeys.length, JOURNEY_KM.length, `${l}: one name per journey`);

// Top places: by runs logged, ties by name, at most three.
const placeOf = new Map([[1, 10], [2, 10], [3, 11], [4, 12], [5, 12]]);
const places = [{ id: 10, name: 'River' }, { id: 11, name: 'Park' }, { id: 12, name: 'Canal' }, { id: 13, name: 'Hill' }];
assert.deepEqual(topPlaces(placeOf, places).map((p) => `${p.name}:${p.runs}`), ['Canal:2', 'River:2', 'Park:1']);

// Runs to work this month only.
const tags = new Map<number, 'toWork' | 'home'>([[4, 'toWork'], [5, 'home'], [2, 'toWork']]);
assert.deepEqual(commutesThisMonth(runs, tags, at(2026, 10, 30)), { toWork: 1, home: 1 });
assert.deepEqual(commutesThisMonth(runs, tags, now), { toWork: 0, home: 0 });

console.log('me: ok');

// The Me loop: one per day, a night set after dark, never a clip that isn't in the set.
import { bestBars, meFootage, ME_DAY_FOOTAGE, ME_NIGHT_FOOTAGE } from '../src/me.ts';
assert.equal(meFootage(at(2026, 11, 1, 9)), meFootage(at(2026, 11, 1, 18)), 'same loop all day');
assert.ok((ME_DAY_FOOTAGE as readonly string[]).includes(meFootage(at(2026, 11, 2, 12))));
assert.ok((ME_NIGHT_FOOTAGE as readonly string[]).includes(meFootage(at(2026, 11, 2, 23))));
assert.ok((ME_NIGHT_FOOTAGE as readonly string[]).includes(meFootage(at(2026, 11, 2, 3))));
const days = new Set([0, 1, 2].map((k) => meFootage(at(2026, 11, 3 + k, 12))));
assert.equal(days.size, 3, 'the day set takes turns');

// Bests as bars: quickest pace is the full bar, slowest still visible.
const bars = bestBars([{ key: '5k', m: 5000, seconds: 22 * 60 + 48 }, { key: '10k', m: 10000, seconds: 47 * 60 + 55 }, { key: 'full', m: 42195, seconds: 3 * 3600 + 58 * 60 }]);
assert.equal(bars[0].share, 1);
assert.ok(Math.abs(bars[2].share - 0.45) < 1e-9);
assert.ok(bars[1].share < 1 && bars[1].share > 0.45);
assert.deepEqual(bestBars([]), []);
assert.equal(bestBars([{ key: '5k', m: 5000, seconds: 1500 }])[0].share, 1);
console.log('me footage + bars: ok');
