// npm run test:commute — Run to work, Run home: which runs were commutes, when
// the Run tab offers one and how far it says, and when the evening note goes.
import assert from 'node:assert/strict';
import { commuteOf, DEFAULT_PACE_S, DETOUR, estimate, metres, nextNoteAt, NOTE_HOUR, NOTE_MINUTE, offerFor, ready, roughMinutes, type Commute, type PastRun } from '../src/commute.ts';

const LAT = 52.37;
const LON = 4.89;
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((LAT * Math.PI) / 180));
/** A point `x` metres east and `y` metres north of the origin. */
const at = (x: number, y = 0) => ({ latitude: LAT + y * M_LAT, longitude: LON + x * M_LON });

const home = at(0);
const work = at(6000);
const c: Commute = { home, work, noteDay: null };

// Setting up: both points, a runnable distance apart.
assert.ok(ready(c));
assert.ok(!ready({ ...c, work: null }));
assert.ok(!ready({ ...c, work: at(600) }), 'too close to be a run');
assert.ok(!ready({ ...c, work: at(40000) }), 'too far for an everyday run');
assert.ok(Math.abs(metres(home, work) - 6000) < 5);

// Which way a run went, from where it started and ended.
assert.equal(commuteOf(at(100, 50), at(5900, -80), c), 'toWork');
assert.equal(commuteOf(at(6200), at(-150), c), 'home');
assert.equal(commuteOf(at(100), at(200), c), null, 'a loop from home is not a commute');
assert.equal(commuteOf(at(100), at(3000), c), null, 'half way is not a commute');
assert.equal(commuteOf(at(900), at(6000), c), null, 'starting 900 m from home is too far out');
assert.equal(commuteOf(null, at(6000), c), null);
assert.equal(commuteOf(at(0), at(6000), { ...c, home: null }), null);

// How long: the straight line plus streets at the default pace, with nothing to go by.
const guess = estimate('toWork', c as Commute & { home: typeof home; work: typeof work }, []);
assert.equal(guess.known, false);
assert.ok(Math.abs(guess.distanceM - 6000 * DETOUR) < 10);
assert.ok(Math.abs(guess.durationS - 6 * DETOUR * DEFAULT_PACE_S) < 5);

// … at the runner's own pace once there are runs …
const d = (y: number, m: number, day: number, h: number, min = 0) => new Date(y, m - 1, day, h, min).getTime();
const loops: PastRun[] = [1, 2, 3].map((i) => ({ startedAt: d(2026, 10, i, 18), distanceM: 5000, durationS: 1500, dir: null }));
const own = estimate('toWork', c as Commute & { home: typeof home; work: typeof work }, loops);
assert.ok(Math.abs(own.durationS - 6 * DETOUR * 300) < 5, '5:00/km from their loops');

// … and the middle of their real commutes once there are some, that way only.
const commutes: PastRun[] = [
  { startedAt: d(2026, 10, 5, 8), distanceM: 7100, durationS: 2400, dir: 'toWork' },
  { startedAt: d(2026, 10, 6, 8), distanceM: 7300, durationS: 2600, dir: 'toWork' },
  { startedAt: d(2026, 10, 7, 8), distanceM: 7200, durationS: 2500, dir: 'toWork' },
  { startedAt: d(2026, 10, 7, 18), distanceM: 9000, durationS: 3600, dir: 'home' },
];
const known = estimate('toWork', c as Commute & { home: typeof home; work: typeof work }, [...loops, ...commutes]);
assert.deepEqual(known, { distanceM: 7200, durationS: 2500, known: true });
assert.equal(estimate('home', c as Commute & { home: typeof home; work: typeof work }, commutes).distanceM, 9000);

// The offer. Thursday 29 October 2026.
const runs = [...loops, ...commutes];
const morning = offerFor({ now: d(2026, 10, 29, 7, 30), c, here: at(50), runs });
assert.equal(morning?.dir, 'toWork');
assert.deepEqual(morning?.goal, work);
assert.equal(morning?.distanceM, 7200);
const afternoon = offerFor({ now: d(2026, 10, 29, 17), c, here: at(6100), runs });
assert.equal(afternoon?.dir, 'home');
assert.deepEqual(afternoon?.goal, home);
assert.equal(offerFor({ now: d(2026, 10, 29, 12), c, here: null, runs }), null, 'nothing at midday');
assert.equal(offerFor({ now: d(2026, 10, 29, 22), c, here: null, runs }), null, 'nothing at night');
assert.equal(offerFor({ now: d(2026, 10, 31, 8), c, here: home, runs }), null, 'nothing on a Saturday');
assert.equal(offerFor({ now: d(2026, 11, 1, 8), c, here: home, runs }), null, 'nothing on a Sunday');
assert.equal(offerFor({ now: d(2026, 10, 29, 8), c, here: at(20000, 3000), runs }), null, 'not from somewhere else');
assert.equal(offerFor({ now: d(2026, 10, 29, 8), c, here: work, runs }), null, 'already at work in the morning');
assert.equal(offerFor({ now: d(2026, 10, 29, 8), c, here: null, runs })?.dir, 'toWork', 'unknown whereabouts: go by the clock');
assert.equal(offerFor({ now: d(2026, 10, 29, 17), c, here: null, runs: [...runs, { startedAt: d(2026, 10, 29, 7), distanceM: 7000, durationS: 2400, dir: 'toWork' }] }), null, 'already ran today');
assert.equal(offerFor({ now: d(2026, 10, 29, 8), c: { ...c, work: null }, here: null, runs }), null, 'not set up');

// Rough minutes: exact when short, to five once longer.
assert.equal(roughMinutes(9 * 60 + 20), 9);
assert.equal(roughMinutes(38 * 60), 40);
assert.equal(roughMinutes(20), 1);

// The note: 19:30 the evening before the chosen day, the next one only.
const thursdayNoon = d(2026, 10, 29, 12);
const fri = nextNoteAt(5, thursdayNoon);
assert.equal(fri, d(2026, 10, 29, NOTE_HOUR, NOTE_MINUTE), 'Thursday evening, for Friday');
const tue = nextNoteAt(2, thursdayNoon);
assert.equal(tue, d(2026, 11, 2, NOTE_HOUR, NOTE_MINUTE), 'Monday evening, for Tuesday');
assert.equal(nextNoteAt(5, d(2026, 10, 29, 20)), d(2026, 11, 5, NOTE_HOUR, NOTE_MINUTE), 'missed this week: next week');
assert.equal(nextNoteAt(1, thursdayNoon), d(2026, 11, 1, NOTE_HOUR, NOTE_MINUTE), 'Sunday evening, for Monday');
assert.equal(nextNoteAt(null, thursdayNoon), null);

console.log('commute ok');
