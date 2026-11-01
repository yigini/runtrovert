import { readFileSync } from 'node:fs';
import { parseRoutes } from '../src/io/route';
import { withYear } from '../src/when';
import { AROUND_KM, MAX_TILES, boxAround, boxOfPath, roughMb, tileCount } from '../src/mapArea';
import { NEAR_ROUTE_M, RouteWatch, distanceToRoute, metres, nearest, pathLength, roughDistance, simplify, type Pt } from '../src/routeFollow';

// Following a route and saving its map. Run: npm run test:routes
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}

// A 2 km straight line north, then 1 km east: an L.
const M_LAT = 1 / 111_195; // degrees per metre north
const lat0 = 45;
const M_LON = 1 / (111_195 * Math.cos((lat0 * Math.PI) / 180));
const at = (north: number, east: number): Pt => ({ lat: lat0 + north * M_LAT, lon: 9 + east * M_LON });
const L: Pt[] = [];
for (let n = 0; n <= 2000; n += 10) L.push(at(n, 0));
for (let e = 10; e <= 1000; e += 10) L.push(at(2000, e));

// ---- Geometry --------------------------------------------------------------------
check(Math.abs(pathLength(L) - 3000) < 5, `length of the L (${pathLength(L).toFixed(0)})`);
check(Math.abs(nearest(at(500, 30), L).m - 30) < 0.5, 'beside the first leg: 30 m');
check(Math.abs(nearest(at(2050, 500), L).m - 50) < 0.5, 'beside the second leg: 50 m');
check(nearest(at(1000, 0), L).m < 0.5, 'on the line: 0');
const s = simplify(L, 3);
check(s.length === 3, `a straight L simplifies to its three corners (${s.length})`);
check(Math.abs(pathLength(s) - 3000) < 5, 'and keeps its length');
const wiggle = L.map((p, i) => ({ lat: p.lat + (i % 2 ? 2 : -2) * M_LAT, lon: p.lon }));
check(simplify(wiggle, 4).length < 10, 'GPS wobble under the tolerance goes');

// ---- Off and back -------------------------------------------------------------------
/** Runs the watch along positions, one a second, and returns the events with their times. */
function runAlong(watch: RouteWatch, points: Pt[], acc = 6, t0 = 0): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  points.forEach((p, i) => {
    const ev = watch.push(p, acc, t0 + i * 1000);
    if (ev) out.push([i, ev]);
  });
  return out;
}
const leg = (from: number, to: number, east = 0, step = 3) => {
  const out: Pt[] = [];
  for (let n = from; n <= to; n += step) out.push(at(n, east));
  return out;
};

let w = new RouteWatch(s);
check(runAlong(w, leg(0, 2000)).length === 0, 'running the route: not a buzz');

// Walking to the start from 400 m away: still nothing, until joined.
w = new RouteWatch(s);
const approach = Array.from({ length: 130 }, (_, i) => at(-400 + i * 3, 200 - i * 1.6));
check(runAlong(w, approach).length === 0, 'running to the start is not "off"');

// On it, then a wrong turn west for a long way.
w = new RouteWatch(s);
const wrong = [...leg(0, 600), ...Array.from({ length: 200 }, (_, i) => at(600, -(i + 1) * 3))];
const ev = runAlong(w, wrong);
const offAt = ev.find(([, e]) => e === 'off');
check(!!offAt, 'a wrong turn buzzes');
// 45 m at 3 m/s is 15 s past the turn; three fixes and ten seconds after that, within ~30 s.
check(!!offAt && offAt[0] - 201 >= 15 && offAt[0] - 201 <= 30, `soon, not at once (${offAt ? offAt[0] - 201 : '-'} s after the turn)`);
check(ev.filter(([, e]) => e === 'remind').length >= 1, 'and reminds while still off');
check(w.isOff && (w.offByM ?? 0) > 300, `knows how far off (${w.offByM})`);

// Off, then back.
w = new RouteWatch(s);
const detour = [...leg(0, 600), ...Array.from({ length: 40 }, (_, i) => at(600, -(i + 1) * 3)), ...Array.from({ length: 40 }, (_, i) => at(600, -120 + (i + 1) * 3)), ...leg(603, 900)];
const ev2 = runAlong(w, detour).map(([, e]) => e);
check(ev2.join(',') === 'off,back', `off, then one tap back (${ev2})`);
check(w.offByM == null, 'on it again: no distance shown');

// Never reminded more than twice, however long.
w = new RouteWatch(s);
const far = [...leg(0, 300), ...Array.from({ length: 900 }, (_, i) => at(300, -(i + 1) * 3))];
check(runAlong(w, far).filter(([, e]) => e === 'remind').length === 2, 'two reminders, then quiet');

// One bad fix 80 m out (under a bridge) is not off.
w = new RouteWatch(s);
const glitch = leg(0, 900);
glitch[150] = at(450, 80);
glitch[151] = at(453, 80);
check(runAlong(w, glitch).length === 0, 'a bad fix or two is not a wrong turn');

// Poor GPS widens the line: 60 m out with 40 m accuracy is not off.
w = new RouteWatch(s);
check(runAlong(w, [...leg(0, 300), ...leg(303, 900, 60)], 40).length === 0, 'with poor GPS, 60 m is within the noise');
w = new RouteWatch(s);
check(runAlong(w, [...leg(0, 300), ...leg(303, 900, 60)], 5).some(([, e]) => e === 'off'), 'with good GPS, 60 m to the side is off');

// A path of one point follows nothing.
check(new RouteWatch([at(0, 0)]).push(at(500, 500), 5, 0) === null, 'no line, no buzz');

// ---- Route files ---------------------------------------------------------------------
const planned = parseRoutes(readFileSync(new URL('./samples/planned-route.gpx', import.meta.url), 'utf8'));
check(planned.length === 1 && planned[0].path.length >= 2 && planned[0].distanceM > 100, `a planned GPX route, no times (${planned.length})`);
const run = parseRoutes(readFileSync(new URL('./samples/strava-run.gpx', import.meta.url), 'utf8'));
check(run.length === 1 && Math.abs(run[0].distanceM - 5000) < 80 && run[0].name === 'Morning Run & coffee', `a recorded run is a route too (${run[0]?.distanceM.toFixed(0)})`);
check(run[0].path.length < 200, `kept light (${run[0].path.length} points)`);
const komoot = `<?xml version="1.0"?><gpx version="1.1" creator="komoot"><metadata><name>Hill loop</name></metadata><trk><name>Hill loop</name><trkseg>${L.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>10</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;
const k = parseRoutes(komoot);
check(k.length === 1 && k[0].name === 'Hill loop' && k[0].path.length === 3, 'Komoot track without times');
const rte = `<gpx><rte><name>To the lake</name>${L.slice(0, 50).map((p) => `<rtept lat="${p.lat}" lon="${p.lon}"/>`).join('')}</rte></gpx>`;
check(parseRoutes(rte)[0]?.name === 'To the lake', 'GPX <rte> with self-closing points');
const course = `<TrainingCenterDatabase><Courses><Course><Name>Park</Name><Track>${L.slice(0, 60).map((p) => `<Trackpoint><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position></Trackpoint>`).join('')}</Track></Course></Courses></TrainingCenterDatabase>`;
check(parseRoutes(course)[0]?.name === 'Park', 'TCX course');
check(parseRoutes('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>').length === 0, 'one point is not a route');
check(parseRoutes('hello').length === 0, 'not a route file');

// ---- Saved map areas ------------------------------------------------------------------
const box = boxAround(45, 9);
check(Math.abs(metres({ lat: box[1], lon: 9 }, { lat: box[3], lon: 9 }) - AROUND_KM * 2000) < 50, 'around here: the box is the size it says');
check(tileCount(box) < 300 && roughMb(box) <= 15, `around here is small (${tileCount(box)} tiles, ~${roughMb(box)} MB)`);
const rb = boxOfPath(L)!;
check(rb[0] < 9 && rb[2] > at(0, 1000).lon && rb[3] > at(2000, 0).lat, 'a route box holds the route and some');
check(tileCount([-10, 35, 30, 60]) > MAX_TILES, 'half of Europe is too big');
check(boxOfPath([]) === null, 'no route, no box');


// ---- Far from the route --------------------------------------------------------------
{
  const route: Pt[] = [{ lat: 45.4642, lon: 9.19 }, { lat: 45.4742, lon: 9.19 }]; // 1.1 km north-south, made up
  const beside = distanceToRoute({ lat: 45.4692, lon: 9.2 }, route); // ~780 m east of the middle
  check(beside > 700 && beside < 850 && beside <= NEAR_ROUTE_M, `beside the route counts as near (${beside.toFixed(0)} m)`);
  const rome = distanceToRoute({ lat: 41.9028, lon: 12.4964 }, route);
  check(rome > 470_000 && rome < 490_000 && rome > NEAR_ROUTE_M, `another city is far (${(rome / 1000).toFixed(0)} km)`);
  check(roughDistance(rome, true) === '477 km' || /^4\d\d km$/.test(roughDistance(rome, true)), `said roughly (${roughDistance(rome, true)})`);
  check(roughDistance(1_234_567, true) === '1 235 km', `thousands spaced (${roughDistance(1_234_567, true)})`);
  check(roughDistance(3400, true) === '3.4 km' && roughDistance(3400, false) === '2.1 mi', 'short ones keep a decimal');
  check(distanceToRoute({ lat: 0, lon: 0 }, []) === Infinity, 'no route, never near');
}


// ---- Dates from other years say the year ------------------------------------------------
{
  const now = new Date(2026, 10, 1);
  check(withYear(new Date(2015, 7, 11).getTime(), { day: 'numeric', month: 'short' }, now).year === 'numeric', 'a run from 2015 shows its year');
  check(withYear(new Date(2026, 7, 11), { day: 'numeric', month: 'short' }, now).year === undefined, 'this year needs no year');
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('routes: all good');
