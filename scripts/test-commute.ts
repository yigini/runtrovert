// npm run test:commute — Run to work, Run home: which runs were commutes, when
// the Run tab offers one and how far it says, and when the weekday notes go.
import assert from 'node:assert/strict';
import { AFTERNOON_NOTE, commuteNotes, commuteOf, DEFAULT_PACE_S, DETOUR, estimate, metres, MORNING_NOTE, offerFor, ready, roughMinutes, type Commute, type PastRun } from '../src/commute.ts';

const LAT = 52.37;
const LON = 4.89;
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((LAT * Math.PI) / 180));
/** A point `x` metres east and `y` metres north of the origin. */
const at = (x: number, y = 0) => ({ latitude: LAT + y * M_LAT, longitude: LON + x * M_LON });

const home = at(0);
const work = at(6000);
const c: Commute = { home, work, nudges: 'both' };

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
assert.equal(offerFor({ now: d(2026, 10, 29, 17), c, here: null, runs: [...runs, { startedAt: d(2026, 10, 29, 7), distanceM: 5000, durationS: 1500, dir: null }] }), null, 'already ran today');
assert.equal(
  offerFor({ now: d(2026, 10, 29, 17), c, here: null, runs: [...runs, { startedAt: d(2026, 10, 29, 7), distanceM: 7000, durationS: 2400, dir: 'toWork' }] })?.dir,
  'home',
  'ran to work this morning: the run home is still on',
);
assert.equal(offerFor({ now: d(2026, 10, 29, 8), c: { ...c, work: null }, here: null, runs }), null, 'not set up');

// Rough minutes: exact when short, to five once longer.
assert.equal(roughMinutes(9 * 60 + 20), 9);
assert.equal(roughMinutes(38 * 60), 40);
assert.equal(roughMinutes(20), 1);

// The weekday notes. Thursday 29 October 2026, 06:00; last run Tuesday evening.
const mon = d(2026, 11, 2, 0);
const tuesdayRun = { at: d(2026, 10, 27, 18), dir: null };
const notes = commuteNotes({ now: d(2026, 10, 29, 6), c, lastRun: tuesdayRun });
const slot = (day: number, t: { hour: number; minute: number }) => d(2026, day > 31 ? 11 : 10, day > 31 ? day - 31 : day, t.hour, t.minute);
assert.deepEqual(
  notes.map((n) => [n.at, n.dir]),
  [
    [slot(29, MORNING_NOTE), 'toWork'],
    [slot(29, AFTERNOON_NOTE), 'home'],
    [slot(30, MORNING_NOTE), 'toWork'],
    [slot(30, AFTERNOON_NOTE), 'home'],
    [slot(33, MORNING_NOTE), 'toWork'],
    [slot(33, AFTERNOON_NOTE), 'home'],
    [slot(34, MORNING_NOTE), 'toWork'],
    [slot(34, AFTERNOON_NOTE), 'home'],
    [slot(35, MORNING_NOTE), 'toWork'],
    [slot(35, AFTERNOON_NOTE), 'home'],
  ],
  'two a weekday, none at the weekend, a week ahead',
);
assert.ok(notes.every((n) => new Date(n.at).getHours() >= 7 && new Date(n.at).getHours() < 21), 'never in quiet hours');
// Already past this morning's: only the afternoon one today.
assert.equal(commuteNotes({ now: d(2026, 10, 29, 9), c, lastRun: tuesdayRun })[0].dir, 'home');
// Ran today: nothing more today, unless it was the run to work.
const ranLoop = commuteNotes({ now: d(2026, 10, 29, 9), c, lastRun: { at: d(2026, 10, 29, 7), dir: null } });
assert.equal(ranLoop[0].at, slot(30, MORNING_NOTE));
const ranIn = commuteNotes({ now: d(2026, 10, 29, 9), c, lastRun: { at: d(2026, 10, 29, 7), dir: 'toWork' } });
assert.deepEqual([ranIn[0].at, ranIn[0].dir], [slot(29, AFTERNOON_NOTE), 'home']);
// As picked.
assert.ok(commuteNotes({ now: d(2026, 10, 29, 6), c: { ...c, nudges: 'afternoon' }, lastRun: tuesdayRun }).every((n) => n.dir === 'home'));
assert.ok(commuteNotes({ now: d(2026, 10, 29, 6), c: { ...c, nudges: 'morning' }, lastRun: tuesdayRun }).every((n) => n.dir === 'toWork'));
assert.deepEqual(commuteNotes({ now: d(2026, 10, 29, 6), c: { ...c, nudges: 'off' }, lastRun: tuesdayRun }), []);
assert.deepEqual(commuteNotes({ now: d(2026, 10, 29, 6), c: { ...c, home: null }, lastRun: tuesdayRun }), [], 'not set up');
// Ten days away: quiet until the next run.
const away = commuteNotes({ now: d(2026, 10, 29, 6), c, lastRun: { at: d(2026, 10, 21, 8), dir: null } });
assert.ok(away.every((n) => n.at < d(2026, 10, 31, 0)), 'Thursday and Friday still under ten days, nothing after');
// With a plan: nothing on a rest day, only the afternoon on a session day.
const plan = new Map<number, 'rest' | 'session'>([[d(2026, 10, 29, 0), 'rest'], [d(2026, 10, 30, 0), 'session']]);
const planned = commuteNotes({ now: d(2026, 10, 29, 6), c, lastRun: tuesdayRun, plan });
assert.ok(!planned.some((n) => n.at < d(2026, 10, 30, 0)), 'rest day: none');
assert.deepEqual(planned.filter((n) => n.at < mon).map((n) => n.dir), ['home'], 'plan day: the afternoon one only');

console.log('commute ok');
