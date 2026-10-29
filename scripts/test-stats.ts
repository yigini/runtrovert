// npm run test:stats — the run stats page: pace and elevation series, halves,
// steadiness, the sun maths and the small odd facts, on synthetic runs.
import assert from 'node:assert/strict';
import { estimateSteps, runStats, sunLine, sunTimes, type StatPoint } from '../src/runStats.ts';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const MIN = 60000;

/** A run heading east then back west, one fix a second, at `paces` s/km per km, climbing `climb` m on the way out. */
function outAndBack(paces: number[], start: number, climb = 0): StatPoint[] {
  const pts: StatPoint[] = [];
  const lat = 52.37;
  let lon = 4.89;
  let ts = start;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const half = paces.length / 2;
  pts.push({ ts, lat, lon, alt: 0 });
  paces.forEach((pace, km) => {
    const dir = km < half ? 1 : -1;
    const v = 1000 / pace;
    for (let s = 0; s < pace; s++) {
      ts += 1000;
      lon += (dir * v) / mPerDegLon;
      const along = km < half ? km * 1000 + s * v : (paces.length - km) * 1000 - s * v;
      pts.push({ ts, lat, lon, alt: (climb * along) / (half * 1000) });
    }
  });
  return pts;
}

// Even 5:00/km for 4 km: steady, flat halves, pace series around 300.
{
  const start = Date.UTC(2026, 9, 20, 12);
  const pts = outAndBack([300, 300, 300, 300], start, 20);
  const s = runStats({ startedAt: start, endedAt: start + 1200 * 1000, distanceM: 4000, durationS: 1200, elevationGainM: 20 }, pts, [300, 300, 300, 300]);
  assert.ok(s.pace.length > 20, 'pace series');
  for (const p of s.pace) near(p.v, 300, 6, 'pace');
  near(s.avgPace!, 300, 0.5, 'avg');
  assert.equal(s.steadiness?.word, 'Metronome');
  near(s.halves!.firstS, 600, 5, 'first half');
  near(s.halves!.secondS, 600, 5, 'second half');
  near(s.highM!, 20, 3, 'high point');
  near(s.lowM!, 0, 3, 'low point');
  assert.ok(s.loopM != null && s.loopM < 20, 'back where it began');
  near(s.furthestM!, 2000, 30, 'furthest');
  assert.equal(s.stoppedS, null, 'no standing');
  assert.ok(s.corners != null && s.corners <= 2, 'one turnaround');
  assert.equal(s.floors, 7);
}

// Negative split, fastest stretch near the end, standing time counted.
{
  const start = Date.UTC(2026, 9, 20, 12);
  const pts = outAndBack([360, 340, 300, 270], start);
  const s = runStats({ startedAt: start, endedAt: start + (1270 + 120) * 1000, distanceM: 4000, durationS: 1270, elevationGainM: 0 }, pts, [360, 340, 300, 270]);
  assert.ok(s.halves!.secondS < s.halves!.firstS, 'negative split');
  assert.ok(s.fastest!.d > 3000, `fastest late ${s.fastest!.d}`);
  near(s.fastest!.pace, 270, 4, 'fastest pace');
  assert.equal(s.stoppedS, 120);
  assert.ok(s.steadiness!.spread >= 20, 'not even');
}

// Too short for charts: nothing invented.
{
  const start = Date.UTC(2026, 9, 20, 12);
  const pts: StatPoint[] = [{ ts: start, lat: 52.37, lon: 4.89, alt: null }, { ts: start + 6000, lat: 52.37, lon: 4.89, alt: null }];
  const s = runStats({ startedAt: start, endedAt: start + 6000, distanceM: 0, durationS: 6, elevationGainM: 0 }, pts);
  assert.equal(s.pace.length, 0);
  assert.equal(s.elevation.length, 0);
  assert.equal(s.avgPace, null);
  assert.equal(s.steps, null);
  assert.equal(s.halves, null);
  assert.equal(s.corners, null);
}

// Sunrise and sunset: Amsterdam on 29 Oct 2026, solar noon about 11:24 UTC, day about 9 h 48 min.
{
  const { sunrise, sunset } = sunTimes(Date.UTC(2026, 9, 29, 12), 52.37, 4.89);
  near(sunrise!, Date.UTC(2026, 9, 29, 6, 28), 10 * MIN, 'sunrise');
  near(sunset!, Date.UTC(2026, 9, 29, 16, 16), 10 * MIN, 'sunset');
  const polar = sunTimes(Date.UTC(2026, 11, 21, 12), 78.2, 15.6);
  assert.equal(polar.sunrise, null, 'polar night');
}

// The sun line and dark minutes.
{
  const sun = { sunrise: Date.UTC(2026, 9, 29, 6, 20), sunset: Date.UTC(2026, 9, 29, 16, 10) };
  assert.match(sunLine(sun.sunset - 20 * MIN, sun.sunset + 10 * MIN, sun), /through the sunset/);
  assert.match(sunLine(sun.sunset + 3 * 3600000, sun.sunset + 4 * 3600000, sun), /3 h after sunset/);
  assert.match(sunLine(sun.sunset - 50 * MIN, sun.sunset - 14 * MIN, sun), /Finished 14 min before sunset/);
  const start = sun.sunset + 30 * MIN;
  const pts = outAndBack([300, 300], start);
  const s = runStats({ startedAt: start, endedAt: start + 600000, distanceM: 2000, durationS: 600, elevationGainM: 0 }, pts, [], sun);
  near(s.light!.darkS, 600, 2, 'all in the dark');
  // A saved sunset from another day is ignored in favour of the maths.
  const s2 = runStats({ startedAt: start, endedAt: start + 600000, distanceM: 2000, durationS: 600, elevationGainM: 0 }, pts, [], { sunrise: sun.sunrise - 86400000 * 3, sunset: sun.sunset - 86400000 * 3 });
  near(s2.light!.sunset, sunTimes(start, 52.37, 4.89).sunset!, 1000, 'computed sunset');
}

// Steps grow with time and a little with speed.
{
  near(estimateSteps(5000, 1800)!, 30 * 150, 200, 'jog cadence');
  assert.ok(estimateSteps(5000, 1200)! / 20 > estimateSteps(5000, 1800)! / 30, 'faster, quicker feet');
}

console.log('stats ok');
