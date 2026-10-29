// npm run test:progress — bests, baselines, the finish-screen line, share lines
// and the trimmed share route, all checked against synthetic runs.
import assert from 'node:assert/strict';
import { bestEfforts, compare, fiveKEquivalent, trends, youVsYou, type RunFacts, type TimedPoint } from '../src/progress.ts';
import { candidates, lineCount, pickLine, type ShareFacts } from '../src/shareLines.ts';
import { routePath, trimEnds } from '../src/shareShape.ts';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const DAY = 86400000;

/** A straight-ish run heading east at `paces` s/km per segment, one fix a second. */
function run(segments: Array<{ m: number; pace: number; pauseS?: number }>, start = Date.UTC(2026, 9, 1, 7)): TimedPoint[] {
  const pts: TimedPoint[] = [];
  let lat = 48.85, lon = 2.33, ts = start;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  pts.push({ ts, lat, lon });
  for (const s of segments) {
    if (s.pauseS) {
      ts += s.pauseS * 1000;
      pts.push({ ts, lat: lat + 0.000005, lon }); // standing at the lights, a few metres of drift
      continue;
    }
    const v = 1000 / s.pace;
    const n = Math.round(s.m / v);
    for (let i = 0; i < n; i++) {
      ts += 1000;
      lon += v / mPerDegLon;
      lat += Math.sin(ts / 60000) * 0.000002; // a little wobble
      pts.push({ ts, lat, lon });
    }
  }
  return pts;
}

// ---- Efforts --------------------------------------------------------------------
{
  const e = bestEfforts(run([{ m: 6000, pace: 330 }]));
  near(e['1k']!, 330, 3, '1k');
  near(e['5k']!, 1650, 8, '5k');
  assert.equal(e['10k'], undefined);
  near(e.mile!, 531, 4, 'mile');
}
{
  // A two-minute stop in the middle doesn't count against the 5 km.
  const e = bestEfforts(run([{ m: 3000, pace: 330 }, { m: 0, pace: 330, pauseS: 120 }, { m: 3000, pace: 330 }]));
  near(e['5k']!, 1650, 12, '5k with pause');
}
{
  // A fast kilometre in the middle is found.
  const e = bestEfforts(run([{ m: 2000, pace: 360 }, { m: 1000, pace: 280 }, { m: 2000, pace: 360 }]));
  near(e['1k']!, 280, 4, 'fast km');
}
{
  // A GPS jump of 2 km in one second is ignored, not a world record.
  const pts = run([{ m: 3000, pace: 330 }]);
  pts.splice(500, 0, { ts: pts[499].ts + 500, lat: pts[499].lat, lon: pts[499].lon + 0.03 });
  const e = bestEfforts(pts);
  near(e['1k']!, 330, 4, 'glitch');
}

// ---- Comparison and the finish line --------------------------------------------
function facts(id: number, daysAgo: number, km: number, pace: number, extra: Partial<RunFacts> = {}): RunFacts {
  const now = Date.UTC(2026, 9, 29, 7);
  const efforts: RunFacts['efforts'] = {};
  if (km >= 1) efforts['1k'] = Math.round(pace * 0.97);
  if (km >= 5) efforts['5k'] = Math.round(pace * 5);
  if (km >= 10) efforts['10k'] = Math.round(pace * 10.1);
  return { id, startedAt: now - daysAgo * DAY, distanceM: km * 1000, durationS: km * pace, elevationGainM: 20, moodBefore: 3, moodAfter: 4, efforts, ...extra };
}
const history = [facts(1, 40, 5, 345), facts(2, 30, 6, 340), facts(3, 20, 5, 338), facts(4, 10, 7, 342), facts(5, 5, 5, 336)];
{
  const today = facts(6, 0, 5.2, 330);
  const c = compare(today, history);
  assert.ok(c.best && c.best.key === '5k', 'new 5k best');
  near(c.best!.marginS!, 30, 1);
  const y = youVsYou(c)!;
  assert.match(y.title, /New 5 km best/);
  assert.match(y.detail, /30 s quicker/);
}
{
  const c = compare(facts(6, 0, 10.5, 350), history);
  assert.equal(c.best?.key, '10k');
  assert.equal(c.best?.marginS, null);
  assert.equal(youVsYou(c)!.title, 'Your first 10 km.');
  assert.equal(c.longest, 'ever');
}
{
  // An ordinary run: no line at all.
  const c = compare(facts(6, 0, 5, 345), history);
  assert.equal(c.best, null);
  assert.equal(youVsYou(c), null);
}
{
  // Three weeks off.
  const c = compare(facts(6, -16, 4, 360), history);
  assert.equal(c.gapDays, 21);
  assert.match(youVsYou(c)!.detail, /3 weeks/);
}
{
  // Quicker than usual but no best (short run).
  const c = compare(facts(6, 0, 3, 325, { efforts: {} }), history);
  assert.ok(c.baselineDeltaS! < -10, `delta ${c.baselineDeltaS}`);
  assert.match(youVsYou(c)!.title, /quicker than your usual/);
}
{
  // Slow but recharged: still a good run.
  const c = compare(facts(6, 0, 4, 380, { efforts: {}, moodBefore: 2, moodAfter: 3 }), history);
  assert.equal(youVsYou(c)!.title, 'Slower than usual. Good run.');
}

// ---- Trends ---------------------------------------------------------------------
{
  near(fiveKEquivalent(3000, 10000), 3000 * Math.pow(0.5, 1.06), 0.01);
  const now = Date.UTC(2026, 9, 29, 12);
  const unrated = { moodBefore: null, moodAfter: null };
  const old = [facts(11, 70, 5, 360, unrated), facts(12, 60, 5, 358, unrated), facts(13, 50, 5, 355, unrated)];
  const tr = trends([...old, ...history], now);
  assert.ok(tr.fitness && tr.fitness.before && tr.fitness.now < tr.fitness.before, 'fitter');
  assert.ok(tr.pace && tr.pace.before && tr.pace.now < tr.pace.before, 'quicker usual');
  assert.equal(tr.rhythm.length, 12);
  assert.equal(tr.week.bars.length, 6);
  assert.equal(tr.recharge, null, 'needs 8 rated runs');
  const tr2 = trends([...old, ...history, facts(21, 3, 5, 340), facts(22, 2, 5, 340), facts(23, 1, 5, 340)], now);
  assert.ok(tr2.recharge && Math.abs(tr2.recharge.avg - 1) < 1e-9);
  assert.equal(tr2.recharge!.best, null, 'all mornings: nothing to compare');
}

// ---- Share lines ----------------------------------------------------------------
const skies = ['clear', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'] as const;
let total = 0;
const all = new Set<string>();
for (let i = 0; i < 400; i++) {
  const sky = skies[i % skies.length];
  const hour = [5, 7, 12, 18, 21][i % 5];
  const startedAt = Date.UTC(2026, 9, 20 + (i % 7), hour);
  const cmp = compare(facts(100 + i, 0, [2, 5.4, 10.6, 13][i % 4], 330 - (i % 3) * 10, { startedAt, moodBefore: 1 + (i % 3), moodAfter: 3 + (i % 3) }), i % 9 === 0 ? [] : history.map((h) => ({ ...h, startedAt: startedAt - (Date.UTC(2026, 9, 29, 7) - h.startedAt) - (i % 11 === 0 ? 20 * DAY : 0) })));
  const f: ShareFacts = {
    runId: 100 + i,
    startedAt,
    distanceM: [2, 5.4, 10.6, 13][i % 4] * 1000,
    durationS: 2000 + i,
    climbM: (i % 6) * 40,
    km: i % 10 !== 0,
    metric: i % 10 !== 0,
    quiet: (['crowded', 'some', 'empty', null] as const)[i % 4],
    weather: i % 8 === 7 ? null : { sky, tempC: [-4, 8, 15, 29][i % 4], feelsC: [-7, 6, 15, 31][i % 4], windKmh: (i % 5) * 9, isDay: hour > 6 && hour < 19, sunrise: startedAt - (hour - 7) * 3600000, sunset: startedAt + (18 - hour) * 3600000 },
    cmp,
  };
  const n = lineCount(f);
  assert.ok(n >= 4, 'always a few lines to choose from');
  for (const p of candidates(f)) {
    for (const l of p.lines) {
      assert.ok(!/undefined|NaN|null|\{|\}/.test(l), `bad line: ${l}`);
      assert.ok(l.length <= 110, `too long (${l.length}): ${l}`);
      assert.ok(/[.!?]$/.test(l), `no full stop: ${l}`);
      all.add(l.replace(/[\d.,:°−-]+/g, '#'));
    }
  }
  // Stable for the same run, cycles through everything with taps.
  assert.deepEqual(pickLine(f), pickLine(f));
  const seen = new Set<string>();
  for (let k = 0; k < n; k++) seen.add(pickLine(f, k).line);
  assert.equal(seen.size, n);
  if (f.cmp.best && f.cmp.best.marginS != null) assert.equal(pickLine(f).tone, 'mint', 'a best leads');
  total += n;
}
console.log(`share lines: ${all.size} distinct templates, ${(total / 400).toFixed(1)} choices per run on average`);

// ---- Share route ----------------------------------------------------------------
{
  const pts = run([{ m: 4000, pace: 330 }]).map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const t = trimEnds(pts)!;
  const R = 6371000, rad = Math.PI / 180;
  const m = (a: typeof t[0], b: typeof t[0]) => R * Math.hypot((b.latitude - a.latitude) * rad, (b.longitude - a.longitude) * rad * Math.cos(a.latitude * rad));
  near(m(pts[0], t[0]), 300, 5, 'start trimmed');
  near(m(pts[pts.length - 1], t[t.length - 1]), 300, 5, 'end trimmed');
  assert.ok(trimEnds(pts.slice(0, 300)) === null, 'too short to draw');
  const d = routePath(pts, 1000, 600, 40)!;
  const nums = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    assert.ok(nums[i] >= 39.9 && nums[i] <= 960.1, `x ${nums[i]}`);
    assert.ok(nums[i + 1] >= 0 && nums[i + 1] <= 600, `y ${nums[i + 1]}`);
  }
  assert.ok(nums.length / 2 <= 401);
}

console.log('progress ok');
