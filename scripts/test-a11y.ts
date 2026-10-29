// npm run test:a11y — what screen readers say for distances, times and paces.
import assert from 'node:assert/strict';
import { spokenDistance, spokenDuration, spokenPace, spokenRun } from '../src/a11y.ts';

assert.equal(spokenDistance(4210), '4.21 kilometres');
assert.equal(spokenDistance(1609.344, false), '1.00 miles');

assert.equal(spokenDuration(0), '0 seconds');
assert.equal(spokenDuration(40), '40 seconds');
assert.equal(spokenDuration(60), '1 minute');
assert.equal(spokenDuration(26 * 60 + 5), '26 minutes 5 seconds');
assert.equal(spokenDuration(3600 + 2 * 60 + 1), '1 hour 2 minutes 1 second');
assert.equal(spokenDuration(2 * 3600), '2 hours');

assert.equal(spokenPace(1000, 332), '5 minutes 32 seconds per kilometre');
assert.equal(spokenPace(1609.344, 480, false), '8 minutes per mile');
assert.equal(spokenPace(20, 100), 'no pace yet');
assert.equal(spokenPace(1000, 5), 'no pace yet');

assert.equal(spokenRun({ distanceM: 5000, durationS: 1500 }), '5.00 kilometres, 25 minutes, average 5 minutes per kilometre');

console.log('a11y: ok');
