// npm run test:deep — the newer one-run deep stats (src/deepMore.ts) on synthetic runs:
// stops, corners, where the pace turned, hill price, heart catch-up, heart and pace, GPS.
import assert from 'node:assert/strict';
import { cellOf, cornersCost, deepMore, gpsSure, heartLag, heartPacePath, hillPrice, moving, paceTurn, runSummary, stopsCost, type MorePoint } from '../src/deepMore.ts';
import type { HeartSample } from '../src/heart.ts';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const START = Date.UTC(2026, 9, 20, 7);
const LAT = 45.46;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((LAT * Math.PI) / 180);

interface Sim {
  /** Seconds per km at `m` metres. */
  pace: (m: number) => number;
  metres: number;
  /** Where `m` metres along the route is, in metres east and north. */
  route?: (m: number) => [number, number];
  alt?: (m: number) => number;
  acc?: (m: number) => number | null;
  /** Stand still for `s` seconds at `atM` (no fixes stored, as tracking does). */
  stops?: Array<{ atM: number; s: number }>;
  /** No signal from `fromM` for `m` metres. */
  gaps?: Array<{ fromM: number; m: number }>;
  every?: number; // seconds between fixes
}

function run(sim: Sim): MorePoint[] {
  const route = sim.route ?? ((m: number) => [m, 0] as [number, number]);
  const pts: MorePoint[] = [];
  let ts = START;
  let m = 0;
  const stops = [...(sim.stops ?? [])];
  const push = () => {
    const [e, n] = route(m);
    if (sim.gaps?.some((g) => m > g.fromM && m < g.fromM + g.m)) return;
    pts.push({ ts, lat: LAT + n / M_LAT, lon: 9.19 + e / M_LON, alt: sim.alt ? sim.alt(m) : null, acc: sim.acc ? sim.acc(m) : 4 });
  };
  push();
  const dt = sim.every ?? 1;
  while (m < sim.metres) {
    if (stops.length && m >= stops[0].atM) {
      ts += stops.shift()!.s * 1000;
    }
    m += (1000 / sim.pace(m)) * dt;
    ts += dt * 1000;
    push();
  }
  return pts;
}

// ---- The moving track sees stops and gaps ----
{
  const pts = run({ pace: () => 300, metres: 3000, stops: [{ atM: 1500, s: 40 }], gaps: [{ fromM: 2200, m: 300 }] });
  const mv = moving(pts);
  assert.equal(mv.stops.length, 1, 'one stop');
  near(mv.stops[0].atM, 1500, 10, 'stop place');
  near(mv.stops[0].s, 41, 2, 'stop seconds');
  assert.equal(mv.gaps.length, 1, 'one gap');
  near(mv.gaps[0].m, 300, 10, 'gap metres');
  near(mv.t[mv.t.length - 1], 900, 10, 'moving time leaves the stop out');
}

// ---- R1: a stop at 1.5 km and a slow 150 m after it ----
{
  const pts = run({ pace: (m) => (m > 1500 && m < 1650 ? 420 : 300), metres: 4000, stops: [{ atM: 1500, s: 40 }] });
  const c = stopsCost(moving(pts))!;
  assert.ok(c, 'stops cost');
  assert.equal(c.stops.length, 1);
  near(c.standS, 41, 2, 'standing');
  near(c.restartS, 18, 4, 'getting back up to speed'); // 150 m at 420 instead of 300: 18 s
  assert.equal(stopsCost(moving(run({ pace: () => 300, metres: 4000 }))), null, 'no stops, nothing to say');
  assert.equal(stopsCost(moving(run({ pace: () => 300, metres: 4000, stops: [{ atM: 30, s: 20 }] }))), null, 'waiting at the start is not a stop');
}

// ---- R2: a 300 m square, run four times, slowing for each corner ----
{
  const side = 300;
  const corner = (m: number) => {
    const k = m % side;
    return Math.min(k, side - k);
  };
  const route = (m: number): [number, number] => {
    const lap = m % (4 * side);
    const s = Math.floor(lap / side);
    const k = lap - s * side;
    return [[k, side, side - k, 0][s], [0, k, side, side - k][s]];
  };
  const pts = run({ pace: (m) => (corner(m) < 20 ? 500 : 300), metres: 4800, route });
  const mv = moving(pts);
  const c = cornersCost(pts, mv)!;
  assert.ok(c, 'corners found');
  assert.ok(c.corners.length >= 12 && c.corners.length <= 16, `corners ${c.corners.length}`);
  for (const k of c.corners) near(k.turn, 90, 15, 'right angles');
  const mean = c.corners.reduce((a, k) => a + k.costS, 0) / c.corners.length;
  near(mean, 8, 3, 'each corner cost'); // 40 m at 500 instead of 300: 8 s
  const straight = run({ pace: () => 300, metres: 3000 });
  assert.equal(cornersCost(straight, moving(straight)), null, 'a straight line has no corners');
  const sparse = run({ pace: (m) => (corner(m) < 20 ? 500 : 300), metres: 4800, route, every: 3 });
  assert.equal(cornersCost(sparse, moving(sparse)), null, 'battery saver fixes are too far apart');
}

// ---- R3: held 5:00 to 7 km, then 12 s/km slower each km ----
{
  const fade = run({ pace: (m) => (m < 7000 ? 300 : 300 + ((m - 7000) / 1000) * 12), metres: 11000 });
  const t = paceTurn(moving(fade))!;
  assert.equal(t.kind, 'faded');
  if (t.kind === 'faded') {
    near(t.atM, 7000, 600, 'where it turned');
    near(t.holdPace, 300, 4, 'held pace');
    near(t.endPace, 348, 8, 'pace at the end');
  }
  const even = paceTurn(moving(run({ pace: (m) => 300 + Math.sin(m / 300) * 6, metres: 9000 })))!;
  assert.equal(even.kind, 'held', 'even run held');
  const quicker = paceTurn(moving(run({ pace: (m) => 320 - (m / 1000) * 3, metres: 9000 })))!;
  assert.equal(quicker.kind, 'held', 'getting quicker is not a fade');
  assert.equal(paceTurn(moving(run({ pace: () => 300, metres: 4000 }))), null, 'under 5 km');
}

// ---- R4: 11 s/km per 1% up, 5 s/km back per 1% down ----
{
  // Up 5% from 1 to 2.5 km, down 5% from 2.5 to 4 km, flat either side.
  const alt = (m: number) => (m < 1000 ? 0 : m < 2500 ? (m - 1000) * 0.05 : m < 4000 ? 75 - (m - 2500) * 0.05 : 0);
  const pace = (m: number) => {
    const g = m < 1000 || m >= 4000 ? 0 : m < 2500 ? 5 : -5;
    return 300 + (g > 0 ? g * 11 : g * 5);
  };
  const pts = run({ pace, metres: 5000, alt });
  const h = hillPrice(pts, moving(pts), 75)!;
  assert.ok(h, 'hill price');
  near(h.upS!, 11, 2.5, 'up');
  near(h.downS!, 5, 2, 'down');
  near(h.flatPace, 300, 5, 'flat');
  assert.equal(hillPrice(pts, moving(pts), 10), null, 'too little climbing');
}

// ---- R5 + R6: surges every 3 minutes, heart follows 20 s later ----
{
  const pace = (m: number) => (Math.floor(m / 400) % 3 === 1 ? 250 : 330);
  const pts = run({ pace, metres: 6000 });
  const mv = moving(pts);
  const speedAt = (ts: number) => {
    let i = pts.findIndex((p) => p.ts >= ts);
    if (i < 1) i = 1;
    const a = pts[i - 1];
    const b = pts[i];
    return Math.hypot((b.lat - a.lat) * M_LAT, (b.lon - a.lon) * M_LON) / ((b.ts - a.ts) / 1000);
  };
  const heart: HeartSample[] = [];
  let bpm = 140;
  for (let ts = START; ts <= pts[pts.length - 1].ts; ts += 1000) {
    const target = 140 + (speedAt(ts - 20_000) - 3) * 30;
    bpm += (target - bpm) * 0.15;
    if ((ts - START) % 2000 === 0) heart.push({ ts, bpm: Math.round(bpm) });
  }
  const lag = heartLag(mv, heart)!;
  assert.ok(lag, 'heart lag found');
  near(lag.lagS, 24, 8, 'lag seconds');
  assert.equal(heartLag(mv, heart.slice(0, 20)), null, 'too little heart data');
  const path = heartPacePath(mv, heart)!;
  assert.ok(path.length >= 20, 'heart and pace path');
  assert.ok(path.every((p) => p.bpm > 100 && p.pace > 200), 'sane values');
}

// ---- R7: good then poor, with a tunnel ----
{
  const pts = run({ pace: () => 300, metres: 6000, acc: (m) => (m < 3000 ? 3 : 14), gaps: [{ fromM: 4000, m: 400 }] });
  const g = gpsSure(pts, moving(pts))!;
  assert.ok(g, 'gps');
  near(g.share.good, 0.5, 0.06, 'good share');
  near(g.share.gap, 400 / 6000, 0.03, 'gap share');
  near(g.gapM, 400, 15, 'gap metres');
  assert.ok(g.pieces.includes('gap'));
  assert.equal(g.pieces[0], 'good');
  assert.equal(g.pieces[g.pieces.length - 1], 'poor');
  const noAcc = run({ pace: () => 300, metres: 2000, acc: () => null });
  assert.equal(gpsSure(noAcc, moving(noAcc)), null, 'imported runs have no accuracy');
}

// ---- Everything at once, and the per-run summary ----
{
  const pts = run({ pace: (m) => (m < 7000 ? 300 : 300 + ((m - 7000) / 1000) * 12), metres: 11000 });
  const all = deepMore(pts, [], 0);
  assert.equal(all.lag, null);
  assert.equal(all.turn?.kind, 'faded');
  const empty = deepMore([], [], 0);
  assert.equal(empty.turn, null);
  const s = runSummary(pts, 0);
  near(s.heldM!, 7000, 600, 'summary held');
  assert.equal(s.upS, null);
  assert.ok(s.cells.length >= 200 && s.cells.length <= 300, `cells ${s.cells.length}`);
  assert.equal(s.lat, 45.46);
  const [a, b] = cellOf(45.46, 9.19);
  const [c, d] = cellOf(45.46 + 400 / M_LAT, 9.19);
  near(c - a, 10, 1, 'about 40 m a cell');
  near(b, d, 2, 'same longitude');
}

console.log('deep stats (more): all good');
