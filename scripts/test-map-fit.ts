// npm run test:mapfit — checks the finish map frames the route, not the world.
import assert from 'node:assert/strict';
import { boundsFor, fitBounds } from '../src/mapFit.ts';

const close = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// A ~1.6 km loop around a park in Paris.
const loop = [
  { latitude: 48.8462, longitude: 2.3371 },
  { latitude: 48.8490, longitude: 2.3352 },
  { latitude: 48.8475, longitude: 2.3330 },
  { latitude: 48.8448, longitude: 2.3360 },
  { latitude: 48.8462, longitude: 2.3371 },
];
const b = boundsFor(loop)!;
assert.deepEqual(b, [2.333, 48.8448, 2.3371, 48.849]);

// Phone-sized view, no padding: a park loop lands around zoom 15-16, centred.
const plain = fitBounds(b, 400, 500);
assert.ok(plain.zoom > 14.5 && plain.zoom < 16.5, `zoom ${plain.zoom}`);
close(plain.center[0], (2.333 + 2.3371) / 2, 1e-6);
close(plain.center[1], (48.8448 + 48.849) / 2, 1e-4);

// Text over the top of the map: the camera centre moves north, so the route sits lower.
const padded = fitBounds(b, 400, 500, { top: 160, right: 24, bottom: 24, left: 24 });
assert.ok(padded.zoom < plain.zoom);
assert.ok(padded.center[1] > plain.center[1], 'centre should move north');

// Route fits inside the clear area: project corners back to pixels and check.
function toPx(lon: number, lat: number, c: [number, number], z: number) {
  const w = 512 * 2 ** z;
  const px = (l: number) => ((l + 180) / 360) * w;
  const s = (a: number) => Math.sin((a * Math.PI) / 180);
  const py = (a: number) => (0.5 - Math.log((1 + s(a)) / (1 - s(a))) / (4 * Math.PI)) * w;
  return [px(lon) - px(c[0]) + 200, py(lat) - py(c[1]) + 250];
}
const [l, t] = toPx(b[0], b[3], padded.center, padded.zoom);
const [r, bt] = toPx(b[2], b[1], padded.center, padded.zoom);
assert.ok(l >= 24 - 0.5 && r <= 376 + 0.5, `x ${l}..${r}`);
assert.ok(t >= 160 - 0.5 && bt <= 476 + 0.5, `y ${t}..${bt}`);

// A run that never moved (one point) gets a street-level zoom, never zoom 0.
const one = fitBounds(boundsFor([loop[0]])!, 400, 500);
assert.equal(one.zoom, 16.5);
close(one.center[1], 48.8462, 1e-6);

// No usable points: nothing to fit.
assert.equal(boundsFor([]), null);

// Tiny view or huge padding never drives zoom to the world view.
assert.ok(fitBounds(b, 120, 120, { top: 200, right: 200, bottom: 200, left: 200 }).zoom > 12);

console.log('map fit ok', { plain, padded });
