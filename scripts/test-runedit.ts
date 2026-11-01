// npm run test:runedit — runs typed in or corrected by hand (src/runEdit.ts).
import assert from 'node:assert/strict';
import { checkCorrection, checkEntry, defaultMinutes, distanceField, durationField, entryStart, parseDistance, parseDuration } from '../src/runEdit.ts';

// Distance: dots, commas, units; miles.
assert.equal(parseDistance('5', true), 5000);
assert.equal(parseDistance('5,25', true), 5250);
assert.equal(parseDistance(' 10.5 km', true), 10500);
assert.equal(parseDistance('.8', true), 800);
assert.equal(parseDistance('3.1', false), 4989);
for (const bad of ['', 'abc', '-3', '0', '5.2.1', '1e3', '12345']) assert.equal(parseDistance(bad, true), null, bad);

// Time: minutes, m:ss, h:mm:ss, 1h05.
assert.equal(parseDuration('45'), 2700);
assert.equal(parseDuration('28:30'), 1710);
assert.equal(parseDuration('28.30'), 1710);
assert.equal(parseDuration('1:05:00'), 3900);
assert.equal(parseDuration('1h05'), 3900);
assert.equal(parseDuration('1 h 5'), 3900);
assert.equal(parseDuration('2h'), 7200);
for (const bad of ['', '28:75', '1:60:00', 'soon', '28:3']) assert.equal(parseDuration(bad), null, bad);

// Fields read back exactly what they show.
assert.equal(parseDistance(distanceField(5123, true), true), 5120);
assert.equal(parseDuration(durationField(1710)), 1710);
assert.equal(durationField(3725), '1:02:05');
assert.equal(durationField(65), '1:05');

// Checks.
const now = new Date(2026, 10, 1, 12, 0).getTime();
const start = new Date(2026, 10, 1, 7, 0).getTime();
assert.equal(checkEntry({ startedAt: start, distanceM: 5000, durationS: 1800 }, now), null);
assert.equal(checkEntry({ startedAt: start, distanceM: null, durationS: 1800 }, now), 'distance');
assert.equal(checkEntry({ startedAt: start, distanceM: 50, durationS: 1800 }, now), 'distance');
assert.equal(checkEntry({ startedAt: start, distanceM: 5000, durationS: null }, now), 'duration');
assert.equal(checkEntry({ startedAt: start, distanceM: 50000, durationS: 1800 }, now), 'tooFast', '50 km in 30 min');
assert.equal(checkEntry({ startedAt: start, distanceM: 500, durationS: 3600 }, now), 'tooSlow');
assert.equal(checkEntry({ startedAt: now - 10 * 60_000, distanceM: 5000, durationS: 1800 }, now), 'future');
const other = { startedAt: start + 10 * 60_000, endedAt: start + 40 * 60_000 };
assert.equal(checkEntry({ startedAt: start, distanceM: 5000, durationS: 1800 }, now, [other]), 'overlap');
assert.equal(checkEntry({ startedAt: start - 3600_000, distanceM: 5000, durationS: 1800 }, now, [other]), null, 'back to back is fine');
assert.equal(checkCorrection(5000, 1800), null);
assert.equal(checkCorrection(50000, 1800), 'tooFast');
assert.equal(checkCorrection(42195, 4 * 3600), null, 'a slow marathon');

// Days and times.
assert.equal(entryStart(now, 0, 7 * 60), start);
assert.equal(new Date(entryStart(now, 1, 0)).getDate(), 31);
assert.equal(defaultMinutes(new Date(2026, 10, 1, 7, 44).getTime()), 7 * 60 + 30);

console.log('runedit: ok');
