/**
 * Can you trust the numbers? Distance, climb and moving time on courses whose
 * true length and climb are known, with GPS error that looks like a real
 * phone's, plus two real Garmin runs replayed through the same code.
 *   npm run test:accuracy
 *
 * Drives the real filter (gps/kalman.ts), climb counter (gps/climb.ts) and
 * auto-pause rules (gps/moving.ts) the way tracking.ts does. Courses and error
 * models are in scripts/accuracy/courses.ts. Report:
 * /mnt/project-files/audit/data-accuracy.md (project files).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARO_RULE, ClimbCounter, GPS_RULE } from '../src/gps/climb.ts';
import { GpsFilter, haversineM, type RawFix } from '../src/gps/kalman.ts';
import { AUTO_PAUSE_AFTER_MS, autoPauseDue } from '../src/gps/moving.ts';
import { parseFit } from '../src/io/fit.ts';
import * as C from './accuracy/courses.ts';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const SEEDS = [1, 2, 3, 4, 5, 6];
const pct = (got: number, want: number) => ((got - want) / want) * 100;
const fmt = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;

/** Distance as tracking.ts adds it up: every credited filter step. */
function distanceOf(fixes: RawFix[]): number {
  const f = new GpsFilter();
  let d = 0;
  for (const r of fixes) {
    const o = f.push(r);
    if (o) d += o.stepM;
  }
  return d;
}

function meanErr(course: C.Course, noise: C.NoiseModel, o: C.SimOpts = {}): number {
  let e = 0;
  for (const seed of SEEDS) e += pct(distanceOf(C.simulate(course, noise, { ...o, seed }).fixes), course.lengthM);
  return e / SEEDS.length;
}

// ---- Distance --------------------------------------------------------------

const courses = [C.track400(), C.outAndBack(), C.cityBlocks(), C.windingPark()];
// Worst we accept, in percent either way. Open sky is what most runs get.
const LIMIT: Record<string, number> = { 'open sky': 2.5, 'city streets': 7, 'white noise 5 m': 5 };

for (const every of [1, 3]) {
  for (const noise of [C.OPEN_SKY, C.CITY, C.WHITE]) {
    test(`distance, ${noise.name}, a fix every ${every} s: every course within ±${LIMIT[noise.name]}%`, () => {
      const rows = courses.map((c) => ({ c, e: meanErr(c, noise, { everyS: every, stop: [300, 330] }) }));
      console.log(`     ${rows.map((r) => `${r.c.name}: ${fmt(r.e)}`).join(' · ')}`);
      for (const r of rows) assert.ok(Math.abs(r.e) <= LIMIT[noise.name], `${r.c.name} off by ${fmt(r.e)}`);
    });
  }
}

test('distance: nothing systematically short on bends (track and city blocks, open sky)', () => {
  for (const c of [C.track400(), C.cityBlocks()]) {
    const e = meanErr(c, C.OPEN_SKY);
    assert.ok(e > -1, `${c.name} reads ${fmt(e)}: the filter is cutting corners again`);
  }
});

// The filter before Nov 2026 added 18–37 m (open sky) and 37–79 m (city) here.
test('distance: standing still 5 minutes, auto-pause off: under 25 m open sky, 40 m city (auto-pause on adds 0)', () => {
  for (const noise of [C.OPEN_SKY, C.CITY]) {
    const still: C.Course = { name: 'still', lengthM: 0, gainM: 0, at: () => ({ x: 0, y: 0, z: 0 }) };
    for (const seed of SEEDS) {
      const sim = C.simulate(still, noise, { seed, stop: [0, 300] });
      const d = distanceOf(sim.fixes);
      assert.ok(d < (noise === C.CITY ? 40 : 25), `${noise.name}, seed ${seed}: ${d.toFixed(1)} m of wobble credited`);
    }
  }
});

test('distance: a phone that gives no speed (null) still reads within ±3% in open sky', () => {
  for (const c of courses) {
    let e = 0;
    for (const seed of SEEDS) {
      const fixes = C.simulate(c, C.OPEN_SKY, { seed }).fixes.map((f) => ({ ...f, speed: null }));
      e += pct(distanceOf(fixes), c.lengthM) / SEEDS.length;
    }
    assert.ok(Math.abs(e) <= 3, `${c.name}: ${fmt(e)}`);
  }
});

// ---- Real runs ---------------------------------------------------------------

const REAL = [
  { file: 'scripts/samples/real/garmin-run-4.8km-5s.fit', distTol: 3.5, climbTol: 10 },
  { file: 'scripts/samples/real/garmin-fenix2-run-9km-1s.fit', distTol: 2, climbTol: 15 },
];

for (const r of REAL) {
  test(`real Garmin run (${r.file.split('/').pop()}): distance and climb agree with the watch`, () => {
    const run = parseFit(new Uint8Array(readFileSync(r.file))).runs[0];
    assert.ok(run && run.distanceM && run.elevationGainM != null, 'file should parse with the watch totals');
    let ours = 0;
    let naive = 0;
    const climb = new ClimbCounter(BARO_RULE);
    for (const seg of run.segments) {
      ours += distanceOf(seg.map((p) => ({ lat: p.lat, lon: p.lon, acc: 5, alt: p.alt, speed: null, ts: p.ts })));
      for (let i = 1; i < seg.length; i++) naive += haversineM(seg[i - 1].lat, seg[i - 1].lon, seg[i].lat, seg[i].lon);
      for (const p of seg) if (p.alt != null) climb.push(p.alt, p.ts);
    }
    const de = pct(ours, run.distanceM!);
    const ce = pct(climb.gainM, run.elevationGainM!);
    console.log(`     watch ${run.distanceM!.toFixed(0)} m · ours ${ours.toFixed(0)} m (${fmt(de)}) · straight lines ${naive.toFixed(0)} m · climb watch ${run.elevationGainM} m, ours ${climb.gainM.toFixed(0)} m (${fmt(ce)})`);
    assert.ok(Math.abs(de) <= r.distTol, `distance off by ${fmt(de)}`);
    assert.ok(Math.abs(ce) <= r.climbTol, `climb off by ${fmt(ce)}`);
  });
}

// ---- Climb -----------------------------------------------------------------

function climbOf(course: C.Course, noise: C.NoiseModel, source: 'baro' | 'gps', everyS = 1): number {
  let g = 0;
  for (const seed of SEEDS) {
    const sim = C.simulate(course, noise, { seed, everyS });
    const c = new ClimbCounter(source === 'baro' ? BARO_RULE : GPS_RULE);
    if (source === 'baro') sim.baroAlt.forEach((a, i) => c.push(a, C.T0 + i * 1000));
    else sim.fixes.forEach((f) => c.push(f.alt!, f.ts));
    g += c.gainM / SEEDS.length;
  }
  return g;
}

test('climb, barometer: flat reads flat, 180 m of hills within 10%', () => {
  for (const noise of [C.OPEN_SKY, C.CITY]) {
    const flat = climbOf(C.outAndBack(), noise, 'baro');
    const hills = climbOf(C.hilly(), noise, 'baro');
    console.log(`     ${noise.name}: flat ${flat.toFixed(0)} m · hills ${hills.toFixed(0)} of 180 m`);
    assert.ok(flat < 3, `flat run shows ${flat.toFixed(0)} m`);
    assert.ok(Math.abs(pct(hills, 180)) <= 10, `hills read ${hills.toFixed(0)} m`);
  }
});

test('climb, barometer: a sudden jump in the sensor is not a hill', () => {
  const c = new ClimbCounter(BARO_RULE);
  for (let i = 0; i < 600; i++) c.push(100 + (i >= 300 ? 40 : 0), C.T0 + i * 1000);
  assert.ok(c.gainM < 1, `a 40 m step in 1 s counted ${c.gainM.toFixed(0)} m`);
});

test('climb, GPS only (no barometer): flat under 80 m per 5 km, hills between −35% and +10%', () => {
  for (const every of [1, 3]) {
    for (const noise of [C.OPEN_SKY, C.CITY]) {
      const flat = climbOf(C.outAndBack(), noise, 'gps', every);
      const hills = climbOf(C.hilly(), noise, 'gps', every);
      console.log(`     ${noise.name}, every ${every} s: flat ${flat.toFixed(0)} m · hills ${hills.toFixed(0)} of 180 m`);
      assert.ok(flat < 80, `flat run shows ${flat.toFixed(0)} m`);
      assert.ok(pct(hills, 180) >= -35 && pct(hills, 180) <= 10, `hills read ${hills.toFixed(0)} m`);
    }
  }
});

// ---- Moving time -----------------------------------------------------------

/** tracking.ts's clock: fixes move lastMovementTs, tick() pauses with autoPauseDue. */
function movingTime(fixes: RawFix[], endS: number): { movingS: number; distanceM: number } {
  const f = new GpsFilter();
  let status: 'running' | 'autopaused' = 'running';
  let acc = 0;
  let segStart = C.T0;
  let lastFixTs = 0;
  let lastMove = C.T0;
  let d = 0;
  let i = 0;
  for (let t = 0; t <= endS; t++) {
    const now = C.T0 + t * 1000;
    while (i < fixes.length && fixes[i].ts <= now) {
      const o = f.push(fixes[i++]);
      if (!o) continue;
      lastFixTs = o.ts;
      const moved = o.speed >= 0.9 || o.stepM > 0;
      if (moved) lastMove = o.ts;
      if (status === 'autopaused') {
        if (!moved) continue;
        status = 'running';
        segStart = now;
        lastMove = now;
      }
      d += o.stepM;
    }
    if (status === 'running' && autoPauseDue(now, lastFixTs, lastMove)) {
      const before = acc;
      acc += (now - segStart) / 1000;
      assert.ok(acc >= before, 'the clock went backwards');
      f.reset();
      status = 'autopaused';
    }
  }
  if (status === 'running') acc += (C.T0 + endS * 1000 - segStart) / 1000;
  return { movingS: acc, distanceM: d };
}

test('moving time: a 60 s stop at lights comes off the clock, all but the ~6 s wait', () => {
  const c = C.outAndBack();
  const sim = C.simulate(c, C.OPEN_SKY, { seed: 3, stop: [600, 660] });
  const { movingS } = movingTime(sim.fixes, sim.durationS);
  const truth = c.lengthM / 3.3;
  console.log(`     moving ${movingS.toFixed(0)} s, truth ${truth.toFixed(0)} s, elapsed ${sim.durationS} s`);
  const wait = AUTO_PAUSE_AFTER_MS / 1000;
  assert.ok(movingS - truth >= 0 && movingS - truth <= wait + 3, `moving ${movingS.toFixed(0)} s against ${truth.toFixed(0)} s`);
});

test('moving time: no fixes for 30 s (tunnel, held-back updates) does not pause the clock', () => {
  const c = C.outAndBack();
  const sim = C.simulate(c, C.OPEN_SKY, { seed: 4, tunnel: [600, 630] });
  const { movingS } = movingTime(sim.fixes, sim.durationS);
  const truth = c.lengthM / 3.3;
  assert.ok(Math.abs(movingS - truth) <= 2, `moving ${movingS.toFixed(0)} s against ${truth.toFixed(0)} s`);
  assert.equal(autoPauseDue(C.T0 + 20_000, C.T0 + 2_000, C.T0 + 2_000), false);
});

test('pace: average pace on the track is within 3% (one run, same as distance)', () => {
  const c = C.track400();
  const sim = C.simulate(c, C.OPEN_SKY, { seed: 2 });
  const { movingS, distanceM } = movingTime(sim.fixes, sim.durationS);
  const truePace = (c.lengthM / 3.3 / c.lengthM) * 1000;
  const ours = (movingS / distanceM) * 1000;
  console.log(`     true ${truePace.toFixed(1)} s/km · ours ${ours.toFixed(1)} s/km`);
  assert.ok(Math.abs(pct(ours, truePace)) <= 3, `pace off by ${fmt(pct(ours, truePace))}`);
});

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall accuracy checks passed');
