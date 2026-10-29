import { GpsFilter, haversineM, type RawFix } from '../src/gps/kalman.ts';

// Deterministic RNG
let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function gauss() {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

// True path: 5 km loop around a circle, 3 m/s, 1 Hz fixes.
const lat0 = 41.9, lon0 = 12.5;
const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const totalM = 5000, speed = 3.0;
const R = totalM / (2 * Math.PI);

function truePos(t: number) {
  const s = Math.min(t * speed, totalM);
  const a = (s / totalM) * 2 * Math.PI;
  return { lat: lat0 + (R * Math.sin(a)) / mPerDegLat, lon: lon0 + (R * Math.cos(a)) / mPerDegLon };
}

function run(label: string, opts: { noiseM: number; stopAt?: [number, number]; tunnel?: [number, number]; outliers?: number; everyS?: number }) {
  const f = new GpsFilter();
  let naiveDist = 0, filtDist = 0, dropped = 0, n = 0;
  let prevRaw: { lat: number; lon: number } | null = null;
  const T = Math.ceil(totalM / speed) + (opts.stopAt ? opts.stopAt[1] - opts.stopAt[0] : 0);
  let moveT = 0;
  for (let t = 0; t <= T; t++) {
    let stopped = false;
    if (opts.stopAt && t >= opts.stopAt[0] && t < opts.stopAt[1]) stopped = true;
    if (!stopped) moveT++;
    if (opts.tunnel && t >= opts.tunnel[0] && t < opts.tunnel[1]) continue; // no fixes at all
    if (opts.everyS && t % opts.everyS !== 0) continue; // battery saver: sparser fixes
    const p = truePos(moveT);
    const acc = Math.max(3, opts.noiseM * (0.6 + rnd() * 0.8));
    let lat = p.lat + (gauss() * acc * 0.5) / mPerDegLat;
    let lon = p.lon + (gauss() * acc * 0.5) / mPerDegLon;
    let reportedAcc = acc;
    if (opts.outliers && rnd() < opts.outliers) {
      lat += (gauss() * 60) / mPerDegLat;
      lon += (gauss() * 60) / mPerDegLon;
      reportedAcc = acc; // chip lies: still claims good accuracy
    }
    const raw: RawFix = { lat, lon, acc: reportedAcc, alt: null, speed: stopped ? 0.2 : speed + gauss() * 0.3, ts: 1_700_000_000_000 + t * 1000 };
    if (prevRaw) naiveDist += haversineM(prevRaw.lat, prevRaw.lon, raw.lat, raw.lon);
    prevRaw = raw;
    const out = f.push(raw);
    n++;
    if (!out) { dropped++; continue; }
    filtDist += out.stepM;
  }
  const err = (d: number) => `${d.toFixed(0)} m (${(((d - totalM) / totalM) * 100).toFixed(1)}%)`;
  console.log(`${label.padEnd(34)} truth 5000 m | naive ${err(naiveDist).padEnd(18)} | filtered ${err(filtDist).padEnd(18)} | dropped ${dropped}/${n}`);
}

run('clean (5 m accuracy)', { noiseM: 5 });
run('urban (12 m accuracy)', { noiseM: 12 });
run('urban + 30 s stop at crossing', { noiseM: 12, stopAt: [400, 430] });
run('urban + 2% outliers', { noiseM: 12, outliers: 0.02 });
run('urban + tunnel 20 s (GPS silent)', { noiseM: 12, tunnel: [800, 820] });
run('bad (25 m) + stop + outliers', { noiseM: 25, stopAt: [400, 430], outliers: 0.02 });
run('saver: 3 s fixes, clean', { noiseM: 5, everyS: 3 });
run('saver: 3 s fixes, urban', { noiseM: 12, everyS: 3 });
run('saver: 3 s fixes, urban + stop', { noiseM: 12, everyS: 3, stopAt: [400, 430] });
