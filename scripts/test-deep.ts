// npm run test:deep — "Show me everything": the deep stats for one run and
// across months, on synthetic runs.
import assert from 'node:assert/strict';
import { deepMonths, deepRun, heartDrift, heartZones, splitShape, wobblePct, type DeepFact } from '../src/deepStats.ts';
import type { StatPoint } from '../src/runStats.ts';
import type { HeartSample } from '../src/heart.ts';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const DAY = 86400000;

/** Due east at `paces` s/km per km, one fix a second; `alt(m)` gives the height at m metres. */
function line(paces: number[], start: number, alt: (m: number) => number = () => 0): StatPoint[] {
  const lat = 52.37;
  let lon = 4.89;
  let ts = start;
  let m = 0;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const pts: StatPoint[] = [{ ts, lat, lon, alt: alt(0) }];
  for (const pace of paces) {
    const v = 1000 / pace;
    for (let s = 0; s < pace; s++) {
      ts += 1000;
      m += v;
      lon += v / mPerDegLon;
      pts.push({ ts, lat, lon, alt: alt(m) });
    }
  }
  return pts;
}

// Split shapes.
assert.equal(splitShape([300, 300, 300, 300])?.kind, 'even');
assert.equal(splitShape([330, 320, 300, 290])?.kind, 'negative');
assert.equal(splitShape([290, 300, 320, 340])?.kind, 'faded');
assert.equal(splitShape([300, 302, 299, 301, 270])?.kind, 'lateKick');
assert.equal(splitShape([300, 340, 270, 330, 280, 320])?.kind, 'wandering');
assert.equal(splitShape([300, 300]), null, 'too short for a shape');
near(wobblePct([300, 300, 300])!, 0, 0.001);
assert.ok(wobblePct([270, 330, 300])! > 7);

// An even 5 km with a faster third km: the steady stretch can't cross it, and the wobble names km 3.
{
  const start = Date.UTC(2026, 9, 20, 7);
  const pts = line([300, 300, 260, 300, 300], start);
  const r = deepRun({ points: pts, kmPaces: [300, 300, 260, 300, 300], heart: [], maxHr: null });
  assert.equal(r.wobble!.quickest, 3);
  assert.ok(r.steady != null, 'steady stretch');
  assert.ok(r.steady!.m >= 1700 && r.steady!.m <= 2100, `steady length ${r.steady!.m}`);
  near(r.steady!.pace, 300, 5, 'steady pace');
  assert.equal(r.grade, null, 'flat: nothing to compare');
  assert.equal(r.drift, null, 'no watch');
  assert.equal(r.zones, null, 'no watch');
}

// Up a hill for 2 km (slower), down for 2 km (quicker): the grade buckets see it.
{
  const start = Date.UTC(2026, 9, 20, 7);
  const alt = (m: number) => (m <= 2000 ? m * 0.05 : Math.max(0, 100 - (m - 2000) * 0.05));
  const pts = line([380, 380, 270, 270], start, alt);
  const r = deepRun({ points: pts, kmPaces: [380, 380, 270, 270], heart: [], maxHr: null });
  assert.ok(r.grade?.up && r.grade.down, 'both directions');
  assert.ok(r.grade!.up!.pace > r.grade!.down!.pace + 60, `up ${r.grade!.up!.pace} down ${r.grade!.down!.pace}`);
  assert.ok(r.grade!.up!.m >= 1200, 'mostly climbing first');
}

// Heart drift: same pace, heart 140 then 154 → about 9% decoupling. Zones from max 180.
{
  const start = Date.UTC(2026, 9, 20, 7);
  const paces = Array(6).fill(330); // 33 min
  const pts = line(paces, start);
  const end = pts[pts.length - 1].ts;
  const heart: HeartSample[] = [];
  for (let ts = start; ts <= end; ts += 5000) heart.push({ ts, bpm: ts - start < (end - start) / 2 ? 140 : 154 });
  const d = heartDrift(pts, heart)!;
  assert.ok(d, 'drift');
  assert.equal(d.firstBpm, 140);
  near(d.secondBpm, 154, 1);
  near(d.pct, 9.1, 0.8, 'decoupling');
  const z = heartZones(heart, 180)!;
  // 140/180 = 78% → zone 3 (index 2); 154/180 = 86% → zone 4 (index 3)
  near(z.seconds[2], (end - start) / 2000, 15);
  near(z.seconds[3], (end - start) / 2000, 15);
  assert.equal(heartZones(heart, null), null, 'no max, no zones');
  assert.equal(heartDrift(line([330, 330], start), heart), null, 'under 20 minutes');
}

// Across months.
{
  const now = new Date(2026, 9, 30, 12).getTime();
  const runs: DeepFact[] = [];
  let id = 1;
  const add = (daysAgo: number, hour: number, pace: number, extra: Partial<DeepFact> = {}) => {
    const d = new Date(now - daysAgo * DAY);
    d.setHours(hour, 0, 0, 0);
    runs.push({
      id: id++,
      startedAt: d.getTime(),
      distanceM: 5000,
      durationS: pace * 5,
      elevationGainM: 0,
      moodBefore: 2,
      moodAfter: 4,
      tempC: null,
      windKmh: null,
      placeId: null,
      kmPaces: [pace + 10, pace, pace, pace, pace - 10],
      ...extra,
    });
  };
  // Mornings quicker than evenings; warm runs slower than mild; every second run at place 7.
  for (let i = 0; i < 12; i++) add(3 + i * 4, 7, 300, { tempC: 12, windKmh: 10, placeId: i % 2 ? 7 : null });
  for (let i = 0; i < 12; i++) add(5 + i * 4, 19, 330, { tempC: 22, windKmh: 25, placeId: i % 2 ? 7 : null });
  // Place 7 in another quarter, half a year ago.
  for (let i = 0; i < 3; i++) add(170 + i * 3, 7, 310, { placeId: 7 });

  const m = deepMonths(runs, [{ id: 7, name: 'The canal' }], now);
  const morning = m.dayPart.find((g) => g.key === 'morning')!;
  const evening = m.dayPart.find((g) => g.key === 'evening')!;
  assert.ok(morning.pace! < evening.pace!, 'morning quicker');
  assert.equal(morning.lift, 2, 'energy lift');
  const mild = m.heat.find((g) => g.key === 'mild')!;
  const warm = m.heat.find((g) => g.key === 'warm')!;
  assert.ok(mild.pace! < warm.pace!, 'warm slower');
  assert.equal(m.wind.length, 2);
  assert.equal(m.places.length, 1, 'one place over two quarters');
  assert.equal(m.places[0].name, 'The canal');
  assert.ok(m.places[0].quarters.length >= 2);
  assert.equal(m.year.weeks.length, 52);
  assert.ok(m.year.weeks.every((w) => w.length === 7));
  assert.equal(m.year.days, runs.length, 'one run a day');
  near(m.year.minutes, runs.reduce((a, r) => a + r.durationS / 60, 0), 3);
  assert.ok(m.firstLast && m.firstLast.pct < 0, 'finishes quicker than it starts');
  assert.equal(m.wobble.length, 6);
  assert.deepEqual(m.recovery, [], 'every gap alike: nothing to compare');
  // Recovery: four days in a row, then a run every five days.
  {
    const rs: DeepFact[] = [];
    const mk = (daysAgo: number, moodAfter: number) =>
      rs.push({ ...runs[0], id: 100 + rs.length, startedAt: now - daysAgo * DAY, moodBefore: 3, moodAfter });
    for (const d of [60, 55, 50, 45, 40]) mk(d, 5);
    for (const d of [4, 3, 2, 1]) mk(d, 3);
    const rec = deepMonths(rs, [], now).recovery;
    assert.deepEqual(rec.map((g) => g.key), ['next', 'long']);
    assert.equal(rec[0].lift, 0);
    near(rec[1].lift!, 1.6, 0.001, 'four 5-day gaps and the 36-day one');
  }
  // Too little: no groups at all rather than one lonely bar.
  const thin = deepMonths(runs.slice(0, 2), [], now);
  assert.deepEqual(thin.dayPart, []);
  assert.deepEqual(thin.heat, []);
  assert.equal(thin.firstLast, null);
}

console.log('deep stats ok');
