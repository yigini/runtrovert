// npm run test:deep — deep stats across months (src/deepLong.ts) on synthetic runs.
import assert from 'node:assert/strict';
import { durability, followLight, hillMonths, loopsSettling, newStreets, sweetSpot, type LongFact } from '../src/deepLong.ts';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const DAY = 86400000;
const NOW = new Date(2026, 10, 20, 12).getTime(); // 20 Nov 2026

let id = 0;
function fact(daysAgo: number, f: Partial<LongFact> = {}): LongFact {
  return {
    id: ++id,
    startedAt: NOW - daysAgo * DAY,
    distanceM: 8000,
    durationS: 8 * 330,
    elevationGainM: 0,
    moodBefore: null,
    moodAfter: null,
    placeId: null,
    heldM: null,
    upS: null,
    lat: 45.46,
    lon: 9.19,
    cells: [],
    ...f,
  };
}

// ---- M1 durability: 6.5 km in June rising to 9 km in November ----
{
  const runs: LongFact[] = [];
  for (let k = 0; k < 6; k++) for (let j = 0; j < 4; j++) runs.push(fact(150 - k * 30 + j * 3, { heldM: 6500 + k * 500 + j * 50 }));
  const d = durability(runs, NOW)!;
  assert.ok(d, 'durability');
  assert.ok(d.last > d.first, 'rising');
  near(d.last - d.first, 2500, 300, 'by about 2.5 km');
  assert.equal(durability(runs.slice(0, 5), NOW), null, 'too few months');
}

// ---- M2 hill price falling ----
{
  const runs: LongFact[] = [];
  for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) runs.push(fact(140 - k * 30 + j, { upS: 14 - k }));
  const h = hillMonths(runs, NOW)!;
  assert.ok(h);
  near(h.first, 14, 0.01);
  near(h.last, 10, 0.01);
}

// ---- M3 new streets: same loop for months, then a new area in one month ----
{
  const loop = Array.from({ length: 100 }, (_, i) => `1000:${2000 + i}`);
  const fresh = Array.from({ length: 100 }, (_, i) => `5000:${2000 + i}`);
  const runs: LongFact[] = [];
  for (let d = 200; d >= 0; d -= 7) runs.push(fact(d, { cells: d > 60 && d < 80 ? fresh : loop }));
  const s = newStreets(runs, NOW)!;
  assert.ok(s, 'new streets');
  assert.ok(s.best && s.best.share > 0.2, `best month ${s.best?.share}`);
  const total = s.months.reduce((a, m) => a + m.newM, 0);
  near(total, 8000, 400, 'one run of new streets, the rest known');
  // A street one cell over counts as the same street (GPS wobble).
  const wobble = loop.map((c) => c.replace('1000:', '1001:'));
  const runs2 = [...runs.filter((r) => r.cells === loop), fact(1, { cells: wobble })];
  const s2 = newStreets(runs2, NOW)!;
  assert.equal(s2.months[5].newM, 0, 'wobble is not new');
}

// ---- M4 following the light: mornings in Milan through a year ----
{
  const runs: LongFact[] = [];
  for (let d = 360; d >= 0; d -= 7) {
    const t = new Date(NOW - d * DAY);
    t.setUTCHours(6, 0, 0, 0); // 7:00 in a Milan winter, before sunrise
    runs.push({ ...fact(0), startedAt: t.getTime(), durationS: 40 * 60 });
  }
  const l = followLight(runs, NOW)!;
  assert.ok(l, 'light');
  assert.equal(l.runs.length, runs.length);
  assert.ok(l.inDark > 5 && l.inLight > 5, `light ${l.inLight} dark ${l.inDark}`); 
  assert.equal(l.weeks.length, 53);
  assert.ok(l.weeks.every((w) => w.sunrise != null && w.sunset != null && w.sunrise < w.sunset));
  assert.equal(followLight(runs.slice(0, 10), NOW), null, 'too few runs');
}

// ---- M5 sweet spot: 30–45 min at usual effort lifts most ----
{
  const runs: LongFact[] = [];
  for (let i = 0; i < 12; i++) runs.push(fact(i * 5, { durationS: 40 * 60, distanceM: 40 * 60 / 0.33, moodBefore: 2, moodAfter: 4 }));
  for (let i = 0; i < 6; i++) runs.push(fact(i * 5 + 2, { durationS: 75 * 60, distanceM: (75 * 60) / 0.3, moodBefore: 3, moodAfter: 2 }));
  for (let i = 0; i < 4; i++) runs.push(fact(i * 5 + 3, { durationS: 20 * 60, distanceM: (20 * 60) / 0.36, moodBefore: 3, moodAfter: 3 }));
  const s = sweetSpot(runs, NOW)!;
  assert.ok(s, 'sweet spot');
  assert.equal(s.best?.length, 'mid');
  assert.equal(s.best?.effort, 'usual');
  near(s.best!.lift, 2, 0.01);
  assert.equal(s.cells.longer.harder.lift, -1, 'long and hard leaves you lower');
  assert.equal(sweetSpot(runs.slice(0, 10), NOW), null, 'too few answers');
}

// ---- M6 loop settling: spread shrinks ----
{
  const runs: LongFact[] = [];
  for (let k = 0; k < 4; k++) {
    const spread = 120 - k * 30;
    for (let j = 0; j < 3; j++) runs.push(fact(100 - k * 30 + j, { placeId: 7, distanceM: 5000, durationS: 1500 + (j - 1) * (spread / 2) }));
  }
  runs.push(fact(5, { placeId: 7, distanceM: 9000, durationS: 2700 })); // a longer run from the same place isn't the loop
  const l = loopsSettling(runs, [{ id: 7, name: 'River loop', distanceM: 5000 }], NOW);
  assert.equal(l.length, 1);
  assert.equal(l[0].firstSpread, 120);
  assert.equal(l[0].lastSpread, 30);
  assert.ok(l[0].months.every((m) => m.times.every((t) => t < 1700)), 'the 9 km run is left out');
}

console.log('deep stats (months): all good');
