// npm run test:places — Your places: telling one loop from another on the
// phone, the third-run offer, and the dated notes that become patterns.
import assert from 'node:assert/strict';
import { BUSY_LABEL, byMonth, HOME_HIDE_MS, homePlace, latestNote, MIN_ROUTE_M, offerLine, placeOffer, placeSummary, quietPatterns, routeSignature, sameLoop, similarity, STEP_M, thin, type PlacedVisit, type RoutePt, type RouteSig, type Visit } from '../src/places.ts';

const LAT = 52.37;
const LON = 4.89;
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((LAT * Math.PI) / 180));

/** Seeded noise so failures repeat. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** A loop around a park: a circle of `r` metres, one fix every 3 m-ish, with filtered GPS wander of up to ±`noise` m (slow drift plus a little jitter, as the Kalman filter leaves it). */
function circle(r: number, { cx = 0, cy = 0, start = 0, reverse = false, noise = 8, seed = 1, laps = 1 } = {}): RoutePt[] {
  const rand = rng(seed);
  const n = Math.round((2 * Math.PI * r * laps) / 3);
  const out: RoutePt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (reverse ? -1 : 1) * (i / n) * 2 * Math.PI * laps;
    const drift = Math.sin(i / 40 + seed) * noise;
    const x = cx + (r + drift) * Math.cos(a) + rand() * 2;
    const y = cy + (r + drift) * Math.sin(a) + rand() * 2;
    out.push({ lat: LAT + y * M_LAT, lon: LON + x * M_LON });
  }
  return out;
}

/** Straight out east for `m` metres and back. */
function outBack(m: number, { dy = 0, seed = 3 } = {}): RoutePt[] {
  const rand = rng(seed);
  const out: RoutePt[] = [];
  for (let x = 0; x <= m; x += 3) out.push({ lat: LAT + (dy + rand() * 2 + Math.sin(x / 120 + seed) * 6) * M_LAT, lon: LON + x * M_LON });
  for (let x = m; x >= 0; x -= 3) out.push({ lat: LAT + (dy + 6 + rand() * 2 + Math.sin(x / 120 + seed) * 6) * M_LAT, lon: LON + x * M_LON });
  return out;
}

const sig = (p: RoutePt[]) => {
  const s = routeSignature(p);
  assert.ok(s, 'route should be long enough');
  return s as RouteSig;
};

// ---- Signatures ----
{
  const s = sig(circle(800));
  const circ = 2 * Math.PI * 800;
  assert.ok(Math.abs(s.distanceM - circ) / circ < 0.12, `distance ${s.distanceM} vs ${circ}`);
  const expect = s.distanceM / STEP_M;
  assert.ok(Math.abs(s.pts.length - expect) <= 2, `points ${s.pts.length} vs ${expect}`);
  assert.equal(routeSignature(circle(50)), null, 'a 300 m wander is not a route');
  assert.equal(routeSignature([]), null);
  assert.equal(routeSignature([{ lat: LAT, lon: LON }]), null);
  assert.ok(MIN_ROUTE_M >= 400);
  console.log(`✓ signature: ${s.pts.length} points for ${s.distanceM} m`);
}

// ---- Same loop, different day ----
const park = sig(circle(800, { seed: 1 }));
{
  assert.ok(sameLoop(park, sig(circle(800, { seed: 2 }))), 'same loop, different GPS noise');
  assert.ok(sameLoop(park, sig(circle(800, { seed: 4, reverse: true }))), 'same loop, the other way round');
  assert.ok(sameLoop(park, sig(circle(800, { seed: 5, start: Math.PI }))), 'same loop, started from the far side');
  assert.ok(sameLoop(park, sig(circle(800, { seed: 6, cx: 15, noise: 12 }))), 'other side of the path, noisier phone');
  console.log('✓ the same loop is found whatever the direction, start or GPS wobble');
}

// ---- Not the same loop ----
{
  assert.ok(!sameLoop(park, sig(circle(800, { cx: 600 }))), 'an overlapping loop shifted 600 m');
  assert.ok(!sameLoop(park, sig(circle(400))), 'the small loop inside the park');
  assert.ok(!sameLoop(park, sig(circle(800, { cx: 5000 }))), 'a park across town');
  assert.equal(similarity(park, sig(circle(800, { cx: 5000 }))), 0, 'far away is ruled out before any maths');
  // The long run that does the park loop and then heads off: it contains the loop, but it is not it.
  const longer = sig([...circle(800, { seed: 7 }), ...outBack(3000).map((p) => ({ lat: p.lat, lon: p.lon + 800 * M_LON }))]);
  assert.ok(!sameLoop(park, longer), 'loop plus 6 km more is a different run');
  // Two laps of the park still cover the same ground, but are twice as long: kept apart.
  assert.ok(!sameLoop(park, sig(circle(800, { laps: 2, seed: 8 }))), 'two laps is a different run');
  assert.ok(!sameLoop(sig(outBack(2500)), sig(outBack(2500, { dy: 200 }))), 'parallel street 200 m away');
  assert.ok(sameLoop(sig(outBack(2500)), sig(outBack(2500, { dy: 10, seed: 9 }))), 'same out-and-back');
  console.log('✓ nearby, nested, longer and doubled routes stay apart');
}

// ---- Thinned copies still match ----
{
  const t = thin(park);
  assert.ok(t.pts.length < park.pts.length * 0.6);
  assert.ok(sameLoop(t, sig(circle(800, { seed: 11 }))), 'a thinned "Not now" copy still recognises the loop');
  console.log('✓ thinned copies still match');
}

// ---- The offer on the third run ----
{
  const today = sig(circle(800, { seed: 20 }));
  const one = [{ runId: 1, sig: sig(circle(800, { seed: 21 })) }];
  const two = [...one, { runId: 2, sig: sig(circle(800, { seed: 22, reverse: true })) }];
  const others = [{ runId: 9, sig: sig(circle(800, { cx: 4000 })) }, { runId: 8, sig: sig(outBack(2000)) }];
  assert.deepEqual(placeOffer(today, [...one, ...others], [], []), { kind: 'none' }, 'second run: not yet');
  assert.deepEqual(placeOffer(today, [...two, ...others], [], []), { kind: 'offer', earlier: [1, 2] }, 'third run: offer');
  assert.deepEqual(placeOffer(today, [...two, ...others], [{ id: 5, sig: park }], []), { kind: 'place', placeId: 5 }, 'already a place: log it there');
  assert.deepEqual(placeOffer(today, [...two], [{ id: 6, sig: sig(circle(800, { cx: 4000 })) }], []), { kind: 'offer', earlier: [1, 2] }, 'another place elsewhere does not count');
  assert.deepEqual(placeOffer(today, two, [], [thin(park)]), { kind: 'none' }, '"Not now" is remembered');
  assert.deepEqual(placeOffer(null, two, [], []), { kind: 'none' }, 'no route, nothing to say');
  assert.equal(offerLine(2), 'Third time on this loop. Keep it as a place?');
  assert.equal(offerLine(5), '6 runs on this loop now. Keep it as a place?');
  console.log('✓ the prompt comes on the third run of a loop, once');
}

// ---- Matching cost: a year of runs on a phone ----
{
  const past = Array.from({ length: 300 }, (_, i) => ({ runId: i, sig: sig(circle(600 + (i % 7) * 150, { seed: 100 + i, cx: (i % 5) * 300 })) }));
  const t0 = performance.now();
  placeOffer(sig(circle(800, { seed: 99 })), past, [], []);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `300 runs took ${ms.toFixed(0)} ms`);
  console.log(`✓ 300 past runs checked in ${ms.toFixed(0)} ms`);
}

// ---- Words ----
{
  for (const label of Object.values(BUSY_LABEL)) {
    assert.ok(!/empty|safe/i.test(label), `label "${label}" must not promise anything`);
  }
  console.log('✓ busyness labels never say empty or safe');
}

// ---- Summary (free) ----
{
  const v = [
    { at: Date.UTC(2026, 8, 2, 17), busy: 'empty' as const, note: null, distanceM: 5000, durationS: 1600 },
    { at: Date.UTC(2026, 9, 1, 17), busy: 'some' as const, note: 'fog', distanceM: 5100, durationS: 1530 },
    { at: Date.UTC(2026, 9, 9, 17), busy: null, note: null, distanceM: 2000, durationS: 500 }, // cut short: no pace best
  ];
  const s = placeSummary(v, 5000);
  assert.equal(s.count, 3);
  assert.equal(s.since, v[0].at);
  assert.equal(s.last?.at, v[2].at);
  assert.equal(Math.round(s.bestPace ?? 0), 300);
  console.log('✓ place summary: count, since, quickest full loop');
}

// ---- Patterns (the unlock) ----
{
  // Local-time dates: the patterns read the phone's own clock.
  const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h, 10).getTime();
  const sundays = [4, 11, 18, 25].map((d) => at(2026, 9, d, 8)); // Sundays in Oct 2026, 08:10
  const tuesdays = [6, 13, 20, 27].map((d) => at(2026, 9, d, 18)); // Tuesdays, 18:10
  const visits: Visit[] = [
    ...sundays.slice(1).map((t) => ({ at: t, busy: 'empty' as const, note: null })),
    { at: sundays[0], busy: 'some', note: null },
    ...tuesdays.map((t, i) => ({ at: t, busy: i === 0 ? ('some' as const) : ('crowded' as const), note: null })),
    { at: at(2026, 9, 8, 18), busy: null, note: 'no rating' },
  ];
  const lines = quietPatterns(visits);
  assert.ok(lines.length >= 2, JSON.stringify(lines));
  assert.ok(lines.some((l) => l.text === 'You noted hardly anyone on three of your four Sunday mornings here.'), JSON.stringify(lines));
  assert.ok(lines.some((l) => l.text === 'You found it busy on three of your four Tuesday evenings here.'), JSON.stringify(lines));
  assert.ok(!lines.some((l) => /weekend mornings/.test(l.text)), 'the Sunday line replaces the weekend one');
  for (const l of lines) assert.ok(!/\bempty\b|\bsafe\b|always|guarantee/i.test(l.text), l.text);
  assert.deepEqual(quietPatterns(visits.slice(0, 2)), [], 'two notes are not a pattern');
  // More than six notes: only the last six count, and the line says "last".
  const many: Visit[] = Array.from({ length: 9 }, (_, i) => ({ at: at(2026, 7, 2 + i * 7, 8), busy: i < 3 ? 'crowded' : 'empty', note: null })); // Sundays from 2 Aug
  const m = quietPatterns(many);
  assert.equal(m[0].text, 'You noted hardly anyone on all of your last six Sunday mornings here.');
  assert.equal(m[0].of, 6);
  console.log('✓ patterns: counts and dates, never a score or a promise');
  for (const l of lines) console.log(`   ${l.text}`);
}

// ---- One place on the home screen, and the runner's own words ----
{
  const t = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h, 15).getTime();
  // Saturday 31 Oct 2026, 9:15: a weekend morning.
  const now = t(2026, 9, 31, 9);
  const v = (placeId: number, at: number, note: string | null = null): PlacedVisit => ({ placeId, at, busy: null, note });
  // Place 1: last Saturday morning, once. Place 2: two weekday mornings. Place 3: evenings only.
  const visits = [v(1, t(2026, 9, 24, 9), 'Leaves everywhere'), v(2, t(2026, 9, 27, 8)), v(2, t(2026, 9, 28, 10)), v(3, t(2026, 9, 24, 19)), v(3, t(2026, 9, 17, 19))];
  assert.equal(homePlace([1, 2, 3], [visits[0]], now), 1, 'one run here on this weekday at this time is enough');
  assert.equal(homePlace([2], visits, now), 2, 'or two at this time on any day');
  assert.equal(homePlace([3], visits, now), null, 'evenings are not this morning');
  assert.equal(homePlace([2], visits.slice(1, 2), now), null, 'one weekday morning is not enough for a Saturday');
  // Most often wins; this weekday counts double, so place 1 (2 pts) ties place 2 (2 pts) and the newer run wins.
  assert.equal(homePlace([1, 2, 3], visits, now), 2);
  assert.equal(homePlace([1, 2, 3], [...visits, v(1, t(2026, 9, 17, 9))], now), 1, 'two Saturday mornings beat two weekday mornings');
  // Already run today, or hidden: not shown.
  assert.equal(homePlace([1], [visits[0], v(1, t(2026, 9, 31, 7))], now), null, 'already run today');
  assert.equal(homePlace([1], [visits[0]], now, { 1: now + HOME_HIDE_MS }), null, 'hidden for a week');
  assert.equal(homePlace([1], [visits[0]], now, { 1: now - 1 }), 1, 'back after the week');
  assert.equal(homePlace([], visits, now), null, 'a forgotten place never shows');
  // The runner's latest note, not the app's words.
  assert.equal(latestNote([...visits, v(2, t(2026, 9, 29, 8), '  ')])?.note, 'Leaves everywhere');
  assert.equal(latestNote([v(1, 1)]), null);
  // The log in months, newest first.
  const months = byMonth([v(1, t(2026, 8, 3, 9)), v(1, t(2026, 9, 24, 9)), v(1, t(2026, 9, 2, 9))]);
  assert.deepEqual(months.map((m) => [m.month, m.visits.length]), [[9, 2], [8, 1]]);
  assert.ok(months[0].visits[0].at > months[0].visits[1].at);
  console.log('✓ home place: one place from your own runs, hideable; latest note is yours; log by month');
}

console.log('places: all good');
