import { mkdirSync, writeFileSync } from 'node:fs';

// Writes the sample files test-io.ts reads: GPX the way Strava and Garmin
// write it, a planned route, a ride, and a FIT file shaped like a watch's
// (big-endian definitions, compressed timestamps, developer fields, a timer
// pause, a cycling session after the run). Deterministic, so re-running gives
// the same files.  Run: node --experimental-strip-types scripts/make-io-samples.ts

const DIR = new URL('./samples/', import.meta.url);
mkdirSync(DIR, { recursive: true });

// A 5 km loop: a point every 3 seconds at about 5:30/km, with a two-minute stop at 2.4 km.
const START = Date.UTC(2026, 9, 12, 6, 31, 0);
const LAT0 = 52.52;
const LON0 = 13.405;
interface P {
  ts: number;
  lat: number;
  lon: number;
  alt: number;
}
function loop(): P[][] {
  const speed = 1000 / 330; // m/s
  const circ = 5000;
  const r = circ / (2 * Math.PI);
  const segs: P[][] = [[], []];
  let t = START;
  for (let d = 0, i = 0; d <= circ; d += speed * 3, i++) {
    const a = (d / circ) * 2 * Math.PI;
    const lat = LAT0 + (r * Math.sin(a)) / 111320;
    const lon = LON0 + (r * (1 - Math.cos(a))) / (111320 * Math.cos((LAT0 * Math.PI) / 180));
    const alt = 34 + 12 * Math.sin(a * 2) + (i % 7 === 0 ? 0.4 : 0);
    const seg = d < 2400 ? 0 : 1;
    if (seg === 1 && segs[1].length === 0) t += 120000; // the stop
    segs[seg].push({ ts: t, lat, lon, alt });
    t += 3000;
  }
  return segs;
}
const segs = loop();
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// Strava: one trkseg, heart rate in extensions, type as a word.
const strava = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx creator="StravaGPX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
  ` <metadata>\n  <time>${iso(START)}</time>\n </metadata>`,
  ' <trk>',
  '  <name>Morning Run &amp; coffee</name>',
  '  <type>running</type>',
  '  <trkseg>',
  ...segs.flat().map((p, i) => `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">\n    <ele>${p.alt.toFixed(1)}</ele>\n    <time>${iso(p.ts)}</time>\n    <extensions>\n     <gpxtpx:TrackPointExtension>\n      <gpxtpx:hr>${140 + (i % 9)}</gpxtpx:hr>\n     </gpxtpx:TrackPointExtension>\n    </extensions>\n   </trkpt>`),
  '  </trkseg>',
  ' </trk>',
  '</gpx>',
].join('\n');
writeFileSync(new URL('strava-run.gpx', DIR), strava);

// Garmin Connect export with a namespace prefix, lon before lat, two segments, milliseconds in the times.
const garmin = [
  "<?xml version='1.0' encoding='UTF-8'?>",
  "<gpx:gpx xmlns:gpx='http://www.topografix.com/GPX/1/1' version='1.1' creator='Garmin Connect'>",
  '<gpx:trk><gpx:name>Berlin Running</gpx:name><gpx:type>running</gpx:type>',
  ...segs.map((s) => `<gpx:trkseg>${s.map((p) => `<gpx:trkpt lon='${p.lon.toFixed(7)}' lat='${p.lat.toFixed(7)}'><gpx:ele>${p.alt.toFixed(1)}</gpx:ele><gpx:time>${new Date(p.ts).toISOString()}</gpx:time></gpx:trkpt>`).join('')}</gpx:trkseg>`),
  '</gpx:trk></gpx:gpx>',
].join('\n');
writeFileSync(new URL('garmin-two-pieces.gpx', DIR), garmin);

// A planned route from a mapping app: no times, so not a run.
writeFileSync(
  new URL('planned-route.gpx', DIR),
  `<?xml version="1.0"?>\n<gpx version="1.1" creator="Komoot" xmlns="http://www.topografix.com/GPX/1/1"><rte><name>Canal loop</name>${segs[0]
    .filter((_, i) => i % 60 === 0)
    .map((p) => `<rtept lat="${p.lat}" lon="${p.lon}"/>`)
    .join('')}</rte></gpx>\n`,
);

// A ride: same shape, but a bike.
writeFileSync(
  new URL('ride.gpx', DIR),
  strava.replace('<type>running</type>', '<type>cycling</type>').replace('Morning Run &amp; coffee', 'Commute'),
);

// ---- A watch-style FIT file ---------------------------------------------------

const FIT_EPOCH_S = 631065600;
const fit = (ms: number) => Math.round(ms / 1000) - FIT_EPOCH_S;
const SEMI = 2 ** 31 / 180;
const bytes: number[] = [];
const u8 = (v: number) => bytes.push(v & 0xff);
const u16 = (v: number, be: boolean) => (be ? bytes.push((v >> 8) & 0xff, v & 0xff) : bytes.push(v & 0xff, (v >> 8) & 0xff));
const u32 = (v: number, be: boolean) => {
  const b = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  bytes.push(...(be ? b : b.reverse()));
};
const s32 = (v: number, be: boolean) => u32(v >>> 0, be);
function def(local: number, global: number, be: boolean, fields: Array<[number, number, number]>, dev: Array<[number, number, number]> = []) {
  u8(0x40 | (dev.length ? 0x20 : 0) | local);
  u8(0);
  u8(be ? 1 : 0);
  u16(global, be);
  u8(fields.length);
  for (const f of fields) bytes.push(...f);
  if (dev.length) {
    u8(dev.length);
    for (const f of dev) bytes.push(...f);
  }
}
// file_id (little-endian): activity, Garmin (1), serial, created
def(0, 0, false, [
  [0, 1, 0x00],
  [1, 2, 0x84],
  [3, 4, 0x8c],
  [4, 4, 0x86],
  [8, 16, 0x07], // product name string: read past, not used
]);
u8(0);
u8(4);
u16(1, false);
u32(3999123456, false);
u32(fit(START), false);
for (const c of 'Forerunner 265\0\0') u8(c.charCodeAt(0));
// An unknown message (device_info-ish, global 23) the reader must skip by size.
def(1, 23, false, [
  [253, 4, 0x86],
  [2, 2, 0x84],
  [27, 1, 0x02],
]);
u8(1);
u32(fit(START), false);
u16(3113, false);
u8(1);
// event: timer start
def(2, 21, false, [
  [253, 4, 0x86],
  [0, 1, 0x00],
  [1, 1, 0x00],
]);
const event = (ms: number, type: number) => {
  u8(2);
  u32(fit(ms), false);
  u8(0);
  u8(type);
};
event(START, 0);
// record, big-endian, with one developer field (2 bytes) after the normal ones.
def(
  3,
  20,
  true,
  [
    [253, 4, 0x86],
    [0, 4, 0x85],
    [1, 4, 0x85],
    [78, 4, 0x86],
    [5, 4, 0x86],
  ],
  [[0, 2, 0]],
);
// record without its own timestamp, for compressed headers.
def(4, 20, false, [
  [0, 4, 0x85],
  [1, 4, 0x85],
  [2, 2, 0x84],
]);
let cum = 0;
let prev: P | null = null;
let n = 0;
let lastFull = 0;
const flat = segs.flat();
for (const p of flat) {
  if (prev && p.ts - prev.ts < 10000) {
    const dx = (p.lat - prev.lat) * 111320;
    const dy = (p.lon - prev.lon) * 111320 * Math.cos((p.lat * Math.PI) / 180);
    cum += Math.hypot(dx, dy);
  }
  if (prev && p.ts - prev.ts > 10000) {
    event(prev.ts + 3000, 4); // stopped
    event(p.ts, 0); // started again
  }
  const t = fit(p.ts);
  // Every 10th point uses a compressed timestamp header: 2 bits of local type, 5 bits of
  // seconds since the last full timestamp. Local 3 is redefined without a timestamp for it.
  if (n % 10 === 5 && t - lastFull < 31) {
    bytes.push(0x40 | 3, 0, 0, 20 & 0xff, 0, 3, 0, 4, 0x85, 1, 4, 0x85, 2, 2, 0x84);
    u8(0x80 | (3 << 5) | (t & 0x1f));
    s32(Math.round(p.lat * SEMI), false);
    s32(Math.round(p.lon * SEMI), false);
    u16(Math.round((p.alt + 500) * 5), false);
    // Put the full record definition back on local 3.
    def(
      3,
      20,
      true,
      [
        [253, 4, 0x86],
        [0, 4, 0x85],
        [1, 4, 0x85],
        [78, 4, 0x86],
        [5, 4, 0x86],
      ],
      [[0, 2, 0]],
    );
  } else {
    u8(3);
    u32(t, true);
    s32(Math.round(p.lat * SEMI), true);
    s32(Math.round(p.lon * SEMI), true);
    u32(Math.round((p.alt + 500) * 5), true);
    u32(Math.round(cum * 100), true);
    u16(0xbeef, true); // developer data
    lastFull = t;
  }
  prev = p;
  n++;
}
const last = flat[flat.length - 1];
event(last.ts, 4);
// session: running, then a short cycling session the reader must leave out.
def(5, 18, false, [
  [253, 4, 0x86],
  [2, 4, 0x86],
  [7, 4, 0x86],
  [8, 4, 0x86],
  [9, 4, 0x86],
  [22, 2, 0x84],
  [5, 1, 0x00],
]);
const moving = (flat.length - 2) * 3000;
u8(5);
u32(fit(last.ts), false);
u32(fit(START), false);
u32(last.ts - START, false);
u32(moving, false);
u32(Math.round(5012.4 * 100), false); // the watch's own distance
u16(41, false);
u8(1);
u8(5);
u32(fit(last.ts + 3600000), false);
u32(fit(last.ts + 600000), false);
u32(1800000, false);
u32(1800000, false);
u32(1500000, false);
u16(20, false);
u8(2); // cycling

function crc(data: number[]): number {
  const T = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
  let c = 0;
  for (const b of data) {
    let t = T[c & 0xf];
    c = (c >> 4) & 0x0fff;
    c = c ^ t ^ T[b & 0xf];
    t = T[c & 0xf];
    c = (c >> 4) & 0x0fff;
    c = c ^ t ^ T[(b >> 4) & 0xf];
  }
  return c;
}
const header = [12, 0x20, 0x54, 0x08, bytes.length & 0xff, (bytes.length >> 8) & 0xff, (bytes.length >> 16) & 0xff, (bytes.length >>> 24) & 0xff, 0x2e, 0x46, 0x49, 0x54];
const file = [...header, ...bytes];
const c = crc(file);
file.push(c & 0xff, c >> 8);
writeFileSync(new URL('watch-run.fit', DIR), Uint8Array.from(file));
console.log('samples written to scripts/samples/');
