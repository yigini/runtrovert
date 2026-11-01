// npm run test:around — shoes, the weekly goal, Tell someone and the widgets' words
// (src/shoes.ts, src/weekGoal.ts, src/tellSomeone.ts, src/widgetData.ts).
import assert from 'node:assert/strict';
import { addShoe, cleanBook, dueForReplacing, EMPTY_BOOK, giveDefault, parseWholeDistance, removeShoe, retireShoe, setRunShoe, totals, wear } from '../src/shoes.ts';
import { cleanGoal, goalLine, goalShare, NO_GOAL, roughDistance, weekOf, weekSoFar } from '../src/weekGoal.ts';
import { backBy, cleanTell, mapLink, NO_TELL, outMessage, wantsBack } from '../src/tellSomeone.ts';
import { widgetData } from '../src/widgetData.ts';

// ---- Shoes ------------------------------------------------------------------
let b = addShoe(EMPTY_BOOK, '  Blue trainers ', 120_000, 700_000, 1000);
const blue = b.shoes[0].id;
assert.equal(b.shoes[0].name, 'Blue trainers');
assert.equal(b.defaultId, blue, 'the first pair is the one new runs use');
b = addShoe(b, 'Trail pair', 0, 0, 2000);
const trail = b.shoes[1].id;
assert.notEqual(trail, blue);
assert.equal(b.defaultId, blue, 'a second pair does not take over');
assert.equal(b.shoes[1].limitM, 700_000, 'no limit given: the usual one');

b = giveDefault(b, 1);
b = giveDefault(b, 2);
b = setRunShoe(b, 3, trail);
b = giveDefault(b, 3); // already has a pair: left alone
assert.equal(b.runs['3'], trail);
const runs = [
  { id: 1, distanceM: 10_000 },
  { id: 2, distanceM: 5_000 },
  { id: 3, distanceM: 21_100 },
  { id: 4, distanceM: 8_000 }, // no shoes
];
let t = totals(b, runs);
assert.equal(t.get(blue)?.distanceM, 135_000);
assert.equal(t.get(blue)?.runs, 2);
assert.equal(t.get(trail)?.distanceM, 21_100);
// A deleted run simply stops counting.
assert.equal(totals(b, runs.slice(1)).get(blue)?.distanceM, 125_000);

// The replace note: past the distance, still in use, not put aside.
assert.equal(dueForReplacing(b, t).length, 0);
const worn = setRunShoe(b, 9, blue);
t = totals(worn, [...runs, { id: 9, distanceM: 600_000 }]);
assert.deepEqual(dueForReplacing(worn, t).map((s) => s.id), [blue]);
assert.equal(wear(worn.shoes[0], t.get(blue)!.distanceM), 1);
assert.equal(dueForReplacing({ ...worn, noted: [blue] }, t).length, 0, '"Not yet" keeps it quiet');
const retired = retireShoe(worn, blue, 5000);
assert.equal(dueForReplacing(retired, t).length, 0, 'put away: no note');
assert.equal(retired.defaultId, trail, 'the default moves to a pair still in use');
assert.equal(retireShoe(retired, blue, null).shoes[0].retiredAt, null, 'brought back');

// Removing a pair keeps its runs, without shoes.
const gone = removeShoe(b, blue);
assert.equal(gone.shoes.length, 1);
assert.equal(gone.runs['1'], undefined);
assert.equal(gone.runs['3'], trail);
assert.equal(gone.defaultId, trail);

// A broken saved value never throws.
assert.deepEqual(cleanBook(null), EMPTY_BOOK);
assert.deepEqual(cleanBook({ shoes: [{ id: 'x', name: 'A' } as never], runs: { 1: 'x', 2: 'nope' }, defaultId: 'nope' }).runs, { 1: 'x' });
assert.equal(parseWholeDistance('350', true), 350_000);
assert.equal(parseWholeDistance('200', false), 321_869);
assert.equal(parseWholeDistance('abc', true), null);
assert.equal(parseWholeDistance('', true), 0);

// ---- Weekly goal --------------------------------------------------------------
// Thursday 5 Nov 2026, 18:00 local. The week runs Monday 2 to Monday 9.
const thu = new Date(2026, 10, 5, 18).getTime();
const { start, end } = weekOf(thu);
assert.equal(new Date(start).getDay(), 1);
assert.equal(new Date(start).getDate(), 2);
assert.equal(end - start > 6.9 * 864e5 && end - start < 7.1 * 864e5, true);
const week = [
  { startedAt: new Date(2026, 10, 1, 9).getTime(), distanceM: 9000, durationS: 3000 }, // Sunday before: not this week
  { startedAt: new Date(2026, 10, 3, 7).getTime(), distanceM: 6000, durationS: 2100 },
  { startedAt: new Date(2026, 10, 5, 7).getTime(), distanceM: 8200, durationS: 2700 }, // added by hand counts the same
];
const so = weekSoFar(week, thu);
assert.equal(so.runs, 2);
assert.equal(so.distanceM, 14_200);
const g = cleanGoal({ on: true, kind: 'time', minutes: 120 });
assert.equal(goalLine(g, so, true), '1 h 20 of 2 h this week');
assert.equal(goalLine({ ...g, kind: 'distance', distanceM: 20_000 }, so, true), '14 km of 20 km this week');
assert.equal(goalLine({ ...g, kind: 'distance', distanceM: 10_000 }, so, true), '14 km this week', 'reached: just the number, no cheer');
assert.equal(goalLine(NO_GOAL, so, true), null, 'off: nothing at all');
assert.equal(goalShare(g, { distanceM: 0, durationS: 0, runs: 0 }), 0);
assert.equal(roughDistance(4200, true), '4.2 km');
assert.equal(roughDistance(16_093, false), '10 mi');
assert.equal(cleanGoal(null).on, false, 'off by default');
// Never a word about a missed week or a streak, in any line it can say.
for (const s of [goalLine(g, { distanceM: 0, durationS: 0, runs: 0 }, true), goalLine(g, so, true)]) assert.ok(!/streak|miss|behind|only/i.test(s ?? ''), s ?? '');

// ---- Tell someone ---------------------------------------------------------------
assert.equal(cleanTell(null).on, false, 'off by default');
assert.equal(NO_TELL.told, null);
const at = new Date(2026, 10, 5, 18, 2).getTime();
const back = backBy(at, 45);
assert.equal(new Date(back).getMinutes(), 50, 'rounded up to five minutes');
const msg = outMessage('Park loop', back, { latitude: 45.464211, longitude: 9.190311 });
assert.ok(msg.startsWith('Out for a run near Park loop, back by '));
assert.ok(msg.includes('https://www.openstreetmap.org/?mlat=45.46421&mlon=9.19031#map=17/45.46421/9.19031'));
assert.ok(!outMessage(null, back, null).includes('http'), 'no place unless asked');
assert.equal(mapLink({ latitude: 1, longitude: 2 }).includes('utm'), false);
const told = { ...NO_TELL, on: true, told: { at, backBy: back } };
assert.equal(wantsBack(told, { id: 7, startedAt: at + 3 * 60_000 }), true);
assert.equal(wantsBack({ ...told, backFor: 7 }, { id: 7, startedAt: at + 3 * 60_000 }), false, 'once per run');
assert.equal(wantsBack(told, { id: 8, startedAt: at + 13 * 3600_000 }), false, 'a run the next day is not the one they were told about');
assert.equal(wantsBack(told, { id: 2, startedAt: at - 3 * 3600_000 }), false, 'an older run never asks');
assert.equal(wantsBack(NO_TELL, { id: 7, startedAt: at }), false);

// ---- Widgets --------------------------------------------------------------------
const wd = widgetData(week, null, true, thu);
assert.equal(wd.lastTitle, 'Last run');
assert.ok(wd.lastValue.startsWith('8.20 km · 45:00 · '), wd.lastValue);
assert.equal(wd.weekValue, '14 km · 2 runs');
assert.equal(wd.weekZero, 'Nothing yet');
assert.equal(wd.weekEnd, end);
assert.equal(widgetData([], null, true, thu).lastValue, 'No runs yet');
assert.equal(widgetData(week, g, true, thu).weekValue, '1 h 20 of 2 h');
assert.equal(widgetData(week, g, true, thu).weekZero, '0 min of 2 h');

console.log('around: ok');
