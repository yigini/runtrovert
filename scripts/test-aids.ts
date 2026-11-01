// npm run test:aids — run aids during a run (src/runAids.ts): alert timing,
// interval voice cues, what the voice says, and the treadmill sums.
import assert from 'node:assert/strict';
import {
  ALERT_HOLD_MS,
  ALERT_REPEAT_MS,
  cleanHeart,
  cleanPace,
  DEFAULT_VOICE_SAYS,
  intervalDue,
  isDefaultVoice,
  learnStride,
  PaceWindow,
  RangeWatch,
  rescaleSplits,
  spokenFields,
  stepDelta,
  stretchPace,
  treadmillStride,
  TREADMILL_DEFAULT_STRIDE_M,
} from '../src/runAids.ts';

let checks = 0;
const ok = (v: unknown, msg?: string) => {
  assert.ok(v, msg);
  checks++;
};
const eq = (a: unknown, b: unknown, msg?: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// ---- RangeWatch: quiet until 20 s out, then at most every 2 minutes.
{
  const w = new RangeWatch();
  const t0 = 1_000_000;
  eq(w.push(350, t0, 300, 390), null, 'inside');
  eq(w.push(420, t0 + 1000, 300, 390), null, 'just went out');
  eq(w.push(420, t0 + 1000 + ALERT_HOLD_MS - 1, 300, 390), null, 'not yet 20 s');
  eq(w.push(420, t0 + 1000 + ALERT_HOLD_MS, 300, 390), 'above', 'fires after the hold');
  eq(w.push(420, t0 + 1000 + ALERT_HOLD_MS + 5000, 300, 390), null, 'not again straight away');
  eq(w.push(420, t0 + 1000 + ALERT_HOLD_MS + ALERT_REPEAT_MS, 300, 390), 'above', 'again after two minutes');
  // Back inside resets the hold; going out again needs 20 s and the quiet period.
  eq(w.push(350, t0 + 200_000, 300, 390), null);
  eq(w.push(280, t0 + 201_000, 300, 390), null);
  eq(w.push(280, t0 + 201_000 + ALERT_HOLD_MS, 300, 390), null, 'still inside the 2-minute quiet');
  eq(w.push(280, t0 + 1000 + ALERT_HOLD_MS + 2 * ALERT_REPEAT_MS, 300, 390), 'below', 'below fires once quiet is over');
  // A missing value (no heart reading) never fires and resets.
  const h = new RangeWatch();
  eq(h.push(null, 0, 120, 160), null);
  eq(h.push(170, 1000, 120, 160), null);
  eq(h.push(null, 10_000, 120, 160), null);
  eq(h.push(170, 25_000, 120, 160), null, 'the gap restarted the hold');
  eq(h.push(170, 45_000, 120, 160), 'above');
  // Flicking in and out never fires.
  const f = new RangeWatch();
  let fired = 0;
  for (let i = 0; i < 300; i++) if (f.push(i % 10 < 5 ? 400 : 350, i * 1000, 300, 390)) fired++;
  eq(fired, 0, 'a flicker is never 20 s out');
}

// ---- PaceWindow: pace from distance and clock, not GPS speed.
{
  const p = new PaceWindow();
  eq(p.secPerKm(), null);
  for (let s = 0; s <= 60; s++) p.push(s * 1000, s * (1000 / 330), s); // 5:30 /km
  const v = p.secPerKm()!;
  ok(Math.abs(v - 330) < 0.5, `5:30 /km read as ${v}`);
  p.reset();
  p.push(0, 0, 0);
  p.push(10_000, 30, 10);
  eq(p.secPerKm(), null, 'too little to tell');
}

// ---- Ranges stay sane.
eq(cleanPace({ on: true, fastS: 400, slowS: 380 }), { on: true, fastS: 400, slowS: 410 });
eq(cleanPace({ on: false, fastS: 10, slowS: 99999 }), { on: false, fastS: 150, slowS: 900 });
eq(cleanPace({ on: true, fastS: 900, slowS: 900 }), { on: true, fastS: 890, slowS: 900 });
eq(cleanHeart({ on: true, low: 170, high: 150 }), { on: true, low: 170, high: 180 });
eq(cleanHeart({ on: true, low: 205, high: 210 }), { on: true, low: 200, high: 210 });

// ---- Voice: what is said, in a fixed order; empty falls back to the old sentence.
eq(spokenFields([]), DEFAULT_VOICE_SAYS);
eq(spokenFields(['heart', 'distance']), ['distance', 'heart']);
ok(isDefaultVoice('split', ['time', 'pace', 'distance']), 'same fields any order is the default');
ok(!isDefaultVoice('min5', DEFAULT_VOICE_SAYS));
ok(!isDefaultVoice('split', ['distance', 'pace', 'time', 'heart']));

// ---- Interval cues: due on whole intervals, never a burst.
eq(intervalDue('split', { distanceM: 0, durationS: 0 }, 5000, 1500, 1000), null, 'split speaks from the split');
eq(intervalDue('half', { distanceM: 0, durationS: 0 }, 499, 150, 1000), null);
eq(intervalDue('half', { distanceM: 0, durationS: 0 }, 503, 151, 1000), { distanceM: 500, durationS: 151 });
eq(intervalDue('half', { distanceM: 500, durationS: 151 }, 1720, 500, 1000), { distanceM: 1500, durationS: 500 }, 'a long gap: one cue, mark on the last whole half');
eq(intervalDue('min5', { distanceM: 0, durationS: 0 }, 900, 299, 1000), null);
eq(intervalDue('min5', { distanceM: 0, durationS: 0 }, 900, 301, 1000), { distanceM: 900, durationS: 300 });
eq(intervalDue('min10', { distanceM: 900, durationS: 300 }, 2000, 899, 1000), null);
eq(intervalDue('min10', { distanceM: 900, durationS: 300 }, 2000, 901, 1000), { distanceM: 2000, durationS: 900 });
const mile = 1609.344;
eq(intervalDue('half', { distanceM: 0, durationS: 0 }, 805, 240, mile), { distanceM: mile / 2, durationS: 240 }, 'miles: half a mile');
eq(stretchPace(0, 0, 500, 160, 1000), 320);
eq(stretchPace(0, 0, 10, 5, 1000), null, 'too short to say');

// ---- Treadmill.
eq(treadmillStride(null), TREADMILL_DEFAULT_STRIDE_M);
eq(treadmillStride({ outdoor: 1.12 }), 1.12, 'GPS-calibrated outdoor stride first time');
eq(treadmillStride({ outdoor: 1.12, treadmill: 1.01 }), 1.01, 'a treadmill-learned stride wins');
eq(treadmillStride({ outdoor: 7 }), TREADMILL_DEFAULT_STRIDE_M, 'nonsense ignored');
eq(learnStride(5000, 5200), 1.04);
eq(learnStride(100, 200), null, 'too few steps');
eq(learnStride(5000, 50_000), null, 'a typo (wrong unit)');
eq(stepDelta(100, 160), { add: 60, last: 160 });
eq(stepDelta(1200, 40), { add: 40, last: 40 }, 'watch restarted from zero');

// Splits redrawn on the treadmill's distance: steps said 4.8 km, treadmill 5.0 km.
{
  const unit = 1000;
  const steps = [1, 2, 3, 4].map((i) => ({ index: i, distanceM: 1000, durationS: 300, atDistanceM: i * 1000, atDurationS: i * 300 }));
  const out = rescaleSplits(steps, 4800, 5000, 1440, unit);
  eq(out.length, 5);
  eq(out.map((s) => s.index), [1, 2, 3, 4, 5]);
  eq(out[out.length - 1].atDurationS, 1440, 'the last km ends with the run');
  ok(out.every((s) => s.distanceM === unit));
  const sum = Math.round(out.reduce((n, s) => n + s.durationS, 0) * 10) / 10;
  eq(sum, 1440, 'durations add up to the run');
  ok(Math.abs(out[0].durationS - 288) < 0.2, `even pace scaled: ${out[0].durationS}`);
  // Shorter on the treadmill: fewer splits.
  eq(rescaleSplits(steps, 4800, 3500, 1440, unit).length, 3);
  // No step counter: even pace over the time.
  const flat = rescaleSplits([], 0, 3000, 900, unit);
  eq(flat.map((s) => s.atDurationS), [300, 600, 900]);
  eq(rescaleSplits(steps, 4800, 0, 1440, unit), []);
}

console.log(`${checks} checks, 0 failure(s)`);
