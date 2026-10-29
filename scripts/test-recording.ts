/**
 * Run recording you can trust: GPS gaps filled from steps without counting
 * them twice, and runs rebuilt from background fixes after the app is killed.
 *
 * Drives the real filter (kalman.ts), gap fill (gapFill.ts) and replay
 * (replay.ts) through a simulated run, the same way tracking.ts does.
 *   npm run test:recording
 */
import assert from 'node:assert/strict';
import { GapFill } from '../src/gps/gapFill.ts';
import { GpsFilter, type RawFix } from '../src/gps/kalman.ts';
import { replayFixes } from '../src/gps/replay.ts';

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

// ---- A simulated runner ----------------------------------------------------

let seed = 7;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function gauss() {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

const lat0 = 51.5, lon0 = -0.1;
const mLat = 111320, mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const T0 = 1_800_000_000_000;
const SPEED = 3; // m/s
const CADENCE = 2.8; // steps/s → true stride ≈ 1.07 m

type Course = (s: number) => { x: number; y: number }; // metres along → metres east/north

const straight: Course = (s) => ({ x: s, y: 0 });
/** Out along x, a hairpin, back along y = 40: an out-and-back through an underpass. */
const hairpin = (turnAt: number): Course => (s) => {
  if (s <= turnAt) return { x: s, y: 0 };
  const a = Math.min((s - turnAt) / (Math.PI * 20), 1) * Math.PI;
  if (s - turnAt <= Math.PI * 20) return { x: turnAt + 20 * Math.sin(a), y: 20 - 20 * Math.cos(a) };
  return { x: turnAt - (s - turnAt - Math.PI * 20), y: 40 };
};

interface Sim {
  course: Course;
  seconds: number;
  noiseM: number;
  tunnel?: [number, number]; // seconds with no GPS at all
  pedometer?: boolean;
}

function truthM(sim: Sim) {
  let d = 0;
  let prev = sim.course(0);
  for (let t = 1; t <= sim.seconds; t++) {
    const p = sim.course(t * SPEED);
    d += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return d;
}

function fixAt(sim: Sim, t: number): RawFix {
  const p = sim.course(t * SPEED);
  const acc = Math.max(3, sim.noiseM * (0.6 + rnd() * 0.8));
  return {
    lat: lat0 + (p.y + gauss() * acc * 0.5) / mLat,
    lon: lon0 + (p.x + gauss() * acc * 0.5) / mLon,
    acc,
    alt: null,
    speed: SPEED + gauss() * 0.3,
    ts: T0 + t * 1000,
  };
}

/** tracking.ts's pipeline: onFixes() for each fix, then tick() once a second. */
function record(sim: Sim, legacy = false): { distanceM: number; filledM: number } {
  seed = 7;
  const filter = new GpsFilter();
  const gap = new GapFill();
  let distanceM = 0;
  let stepsTotal = 0;
  let legacyFilled = 0;
  gap.breakTrack(T0);
  for (let t = 0; t <= sim.seconds; t++) {
    const now = T0 + t * 1000;
    if (sim.pedometer !== false) {
      stepsTotal += CADENCE;
      gap.setSteps(Math.floor(stepsTotal));
    }
    const inTunnel = sim.tunnel && t >= sim.tunnel[0] && t < sim.tunnel[1];
    if (!inTunnel) {
      const fix = filter.push(fixAt(sim, t));
      if (fix) {
        if (legacy) {
          // Before: every filter step credited in full, on top of the fill.
          distanceM += fix.stepM;
          if (fix.stepM > 0) gap.onFix({ ...fix, stepM: fix.stepM });
        } else {
          const closes = gap.gapOpen;
          const credit = gap.onFix(fix);
          if (fix.stepM > 0 || closes) distanceM += credit;
        }
      }
    }
    if (sim.pedometer !== false && gap.due(now)) {
      const m = gap.fill(now, gap.pendingSteps);
      if (m > 0) {
        if (legacy) {
          legacyFilled += m;
          // The old code never reset the filter and never reconciled.
          (gap as any).openFillM = 0;
        } else filter.reset();
        distanceM += m;
      }
    }
  }
  return { distanceM, filledM: legacy ? legacyFilled : gap.filledM };
}

const pct = (d: number, truth: number) => ((d - truth) / truth) * 100;

// ---- Gap fill --------------------------------------------------------------

test('no tunnel: steps change nothing (same as the filter alone)', () => {
  const sim: Sim = { course: straight, seconds: 1000, noiseM: 8 };
  const withSteps = record(sim).distanceM;
  const gpsOnly = record({ ...sim, pedometer: false }).distanceM;
  assert.ok(Math.abs(withSteps - gpsOnly) < 0.5, `with steps ${withSteps.toFixed(1)} vs GPS only ${gpsOnly.toFixed(1)}`);
});

test('straight 60 s tunnel: counted once, within 3%', () => {
  const sim: Sim = { course: straight, seconds: 1000, noiseM: 8, tunnel: [400, 460] };
  const truth = truthM(sim);
  const now = record(sim);
  const before = record(sim, true);
  console.log(`     truth ${truth.toFixed(0)} m · now ${now.distanceM.toFixed(0)} m (${pct(now.distanceM, truth).toFixed(1)}%) · before ${before.distanceM.toFixed(0)} m (${pct(before.distanceM, truth).toFixed(1)}%)`);
  assert.ok(now.filledM > 100, `the steps should have filled the tunnel (filled ${now.filledM.toFixed(0)} m)`);
  assert.ok(Math.abs(pct(now.distanceM, truth)) < 3, `off by ${pct(now.distanceM, truth).toFixed(1)}%`);
  assert.ok(before.distanceM - truth > 120, 'the old pipeline should show the double count this fixes');
});

test('hairpin inside the tunnel: steps beat the straight line', () => {
  const sim: Sim = { course: hairpin(1200), seconds: 900, noiseM: 8, tunnel: [380, 440] };
  const truth = truthM(sim);
  const now = record(sim);
  console.log(`     truth ${truth.toFixed(0)} m · now ${now.distanceM.toFixed(0)} m (${pct(now.distanceM, truth).toFixed(1)}%)`);
  assert.ok(Math.abs(pct(now.distanceM, truth)) < 3, `off by ${pct(now.distanceM, truth).toFixed(1)}%`);
});

test('tunnel without a pedometer: the straight line still bridges it', () => {
  const sim: Sim = { course: straight, seconds: 1000, noiseM: 8, tunnel: [400, 460], pedometer: false };
  const truth = truthM(sim);
  const d = record(sim).distanceM;
  assert.ok(Math.abs(pct(d, truth)) < 3, `off by ${pct(d, truth).toFixed(1)}%`);
});

test('short stride guess: the straight line tops up what steps missed', () => {
  const gap = new GapFill();
  gap.breakTrack(T0);
  gap.onFix({ lat: lat0, lon: lon0, ts: T0, stepM: 0 });
  gap.setSteps(100);
  const filled = gap.fill(T0 + 30_000, gap.pendingSteps); // 100 × 0.95 m = 95 m
  assert.ok(gap.gapOpen);
  const credit = gap.onFix({ lat: lat0, lon: lon0 + 150 / mLon, ts: T0 + 31_000, stepM: 0 });
  assert.ok(Math.abs(filled + credit - 150) < 0.5, `gap total ${(filled + credit).toFixed(1)} m, want 150`);
  assert.ok(!gap.gapOpen);
});

test('steps taken while paused are never credited', () => {
  const gap = new GapFill();
  gap.breakTrack(T0);
  gap.onFix({ lat: lat0, lon: lon0, ts: T0, stepM: 0 });
  gap.breakTrack(T0 + 1000); // pause
  gap.setSteps(400); // walking about during the pause
  gap.breakTrack(T0 + 120_000); // resume
  assert.equal(gap.due(T0 + 121_000), false);
  assert.equal(gap.pendingSteps, 0);
});

// ---- Replay after the app was killed ---------------------------------------

function fixesAlong(fromS: number, toS: number, sim: Sim): RawFix[] {
  seed = 11;
  const out: RawFix[] = [];
  for (let t = fromS; t <= toS; t++) out.push(fixAt(sim, t));
  return out;
}

test('replay: background fixes after the last save are recovered', () => {
  const sim: Sim = { course: straight, seconds: 600, noiseM: 6 };
  const p = sim.course(300 * SPEED);
  const last = { lat: lat0 + p.y / mLat, lon: lon0 + p.x / mLon, ts: T0 + 300_000, acc: 5 };
  const r = replayFixes(last, fixesAlong(301, 600, sim));
  const want = 300 * SPEED;
  console.log(`     recovered ${r.distanceM.toFixed(0)} m of ${want} m, ${r.points.length} points`);
  assert.ok(Math.abs(r.distanceM - want) / want < 0.03, `recovered ${r.distanceM.toFixed(0)} m`);
  assert.equal(r.lastMovingTs, T0 + 600_000);
  assert.ok(r.points.length > 150, `${r.points.length} points`);
});

test('replay: standing still after the kill adds no time and no distance', () => {
  const still: Sim = { course: () => ({ x: 900, y: 0 }), seconds: 0, noiseM: 6 };
  const last = { lat: lat0, lon: lon0 + 900 / mLon, ts: T0 + 300_000, acc: 5 };
  const fixes = fixesAlong(301, 500, still).map((f) => ({ ...f, speed: 0.1 }));
  const r = replayFixes(last, fixes);
  assert.ok(r.distanceM < 15, `wobble credited ${r.distanceM.toFixed(1)} m`);
  assert.ok(r.lastMovingTs == null || r.lastMovingTs < T0 + 320_000, 'time should stop where the movement did');
});

test('replay: fixes from before the last save are ignored', () => {
  const sim: Sim = { course: straight, seconds: 600, noiseM: 6 };
  const last = { lat: lat0, lon: lon0 + 900 / mLon, ts: T0 + 300_000, acc: 5 };
  const r = replayFixes(last, fixesAlong(100, 300, sim));
  assert.equal(r.distanceM, 0);
  assert.equal(r.points.length, 0);
});

test('replay: nothing buffered, nothing changes', () => {
  const r = replayFixes(null, []);
  assert.equal(r.distanceM, 0);
  assert.equal(r.lastMovingTs, null);
});

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall recording tests passed');
