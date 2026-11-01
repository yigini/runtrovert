// npm run test:workout-file — plan sessions as FIT workout files (src/io/fitWorkout.ts, src/training/workoutFile.ts).
import assert from 'node:assert/strict';
import { fitCrc } from '../src/io/fit.ts';
import { foldRepeats, workoutFileName, writeFitWorkout, type WorkoutStepIn } from '../src/io/fitWorkout.ts';
import { intervals, threshold, easyRun, paceSetFor, toSession } from '../src/training/sessions.ts';
import { quickSession, QUICK_PRESETS } from '../src/training/quick.ts';
import { pacesFor } from '../src/training/paces.ts';
import { hasWorkoutFile, sessionWorkout, sessionWorkoutFile } from '../src/training/workoutFile.ts';

/** Just enough FIT reading to check what we wrote: every data message as {global, fields by number}. */
function decode(bytes: Uint8Array): Array<{ global: number; f: Record<number, number | string> }> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(bytes[0], 14);
  assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), '.FIT');
  const len = v.getUint32(4, true);
  assert.equal(bytes.length, 14 + len + 2, 'size in header');
  assert.equal(v.getUint16(12, true), fitCrc(bytes, 0, 12), 'header crc');
  assert.equal(v.getUint16(14 + len, true), fitCrc(bytes, 0, 14 + len), 'file crc');
  const defs = new Map<number, { global: number; fields: Array<[number, number, number]> }>();
  const out: Array<{ global: number; f: Record<number, number | string> }> = [];
  let at = 14;
  while (at < 14 + len) {
    const h = bytes[at++];
    const local = h & 0x0f;
    if (h & 0x40) {
      at++; // reserved
      assert.equal(bytes[at++], 0, 'little-endian');
      const global = v.getUint16(at, true);
      at += 2;
      const n = bytes[at++];
      const fields: Array<[number, number, number]> = [];
      for (let k = 0; k < n; k++, at += 3) fields.push([bytes[at], bytes[at + 1], bytes[at + 2]]);
      defs.set(local, { global, fields });
      continue;
    }
    const d = defs.get(local);
    assert.ok(d, 'data before definition');
    const f: Record<number, number | string> = {};
    for (const [num, size, base] of d.fields) {
      if (base === 0x07) {
        const raw = bytes.subarray(at, at + size);
        f[num] = new TextDecoder().decode(raw.subarray(0, raw.indexOf(0)));
      } else f[num] = size === 1 ? bytes[at] : size === 2 ? v.getUint16(at, true) : v.getUint32(at, true);
      at += size;
    }
    out.push({ global: d.global, f });
  }
  return out;
}

const DAY = Date.UTC(2026, 10, 2);
const runner = { easyPaceSPerKm: 390 } as never;

// Intervals 5 × 3 min: warm, (hard, jog) × 4, hard, cool → folds to warm, hard, jog, repeat ×4, hard, cool.
const p = paceSetFor(runner, pacesFor(45), '10k');
const iv = toSession(intervals(5, 3), 'w2d3', DAY, p);
assert.ok(hasWorkoutFile(iv));
const w = sessionWorkout({ session: iv, paces: p, heart: null, goal: '10k', createdAt: DAY });
assert.equal(w.steps.length, 11);
const folded = foldRepeats(w.steps);
assert.equal(folded.length, 6);
assert.deepEqual(folded[3], { repeatFrom: 1, times: 4 });

const file = sessionWorkoutFile({ session: iv, paces: p, heart: null, goal: '10k', createdAt: DAY });
assert.match(file.name, /^runtrovert-2026-11-0[12]-intervals-5-3-min\.fit$/);
const msgs = decode(file.bytes);
assert.equal(msgs[0].global, 0);
assert.equal(msgs[0].f[0], 5, 'file type workout');
assert.equal(msgs[1].global, 26);
assert.equal(msgs[1].f[4], 1, 'sport running');
assert.equal(msgs[1].f[6], 6, 'number of steps');
assert.equal(msgs[1].f[8], iv.title);
const steps = msgs.filter((m) => m.global === 27);
assert.equal(steps.length, 6);
steps.forEach((s, i) => assert.equal(s.f[254], i, 'message index'));
assert.equal(steps[0].f[7], 2, 'warm-up intensity');
assert.equal(steps[0].f[1], 0, 'timed');
assert.equal(steps[0].f[2], 600000, '10 min in ms');
assert.equal(steps[1].f[3], 0, 'hard step has a speed target');
const lo = (steps[1].f[5] as number) / 1000;
const hi = (steps[1].f[6] as number) / 1000;
const interval = 1000 / p.interval;
assert.ok(lo < interval && interval < hi, 'band around interval pace');
assert.equal(steps[2].f[7], 4, 'jog is recovery');
assert.equal(steps[2].f[3], 2, 'jog has no target');
assert.equal(steps[3].f[1], 6, 'repeat step');
assert.equal(steps[3].f[2], 1);
assert.equal(steps[3].f[4], 4);
assert.equal(steps[5].f[7], 3, 'cool-down intensity');

// No paces from a race: heart rate ranges when the runner set them up, otherwise no target.
const th = toSession(threshold(2, 8, 2, p), 'w3d2', DAY, p);
const withHeart = decode(sessionWorkoutFile({ session: th, paces: null, heart: { maxHr: 190, restHr: 50 } as never, goal: '10k', createdAt: DAY }).bytes).filter((m) => m.global === 27);
const hardHr = withHeart.find((m) => m.f[7] === 0)!;
assert.equal(hardHr.f[3], 1, 'heart rate target');
assert.ok((hardHr.f[5] as number) > 200 && (hardHr.f[6] as number) > (hardHr.f[5] as number), 'bpm + 100');
const bare = decode(sessionWorkoutFile({ session: th, paces: null, heart: null, goal: '10k', createdAt: DAY }).bytes).filter((m) => m.global === 27);
assert.ok(bare.filter((m) => m.f[1] !== 6).every((m) => m.f[3] === 2), 'open targets');

// Walks never get a target; a quick run-walk folds into one repeat.
const rw = quickSession(QUICK_PRESETS.runWalk, DAY);
const rwSteps = decode(sessionWorkoutFile({ session: rw, paces: p, heart: null, goal: 'none', createdAt: DAY }).bytes).filter((m) => m.global === 27);
assert.ok(rwSteps.some((m) => m.f[1] === 6 && m.f[4] === 5), 'run, walk × 5');
assert.ok(rwSteps.filter((m) => m.f[7] === 4).every((m) => m.f[3] === 2), 'walk has no target');

// A single easy run: one step, nothing folded.
const easy = toSession(easyRun(40), 'w1d1', DAY, p);
assert.equal(foldRepeats(sessionWorkout({ session: easy, paces: null, heart: null, goal: 'none', createdAt: DAY }).steps).length, easy.steps.length);

// Rest days and strength have no file.
assert.ok(!hasWorkoutFile({ ...easy, kind: 'rest', steps: [] }));

// Long names are cut on a character boundary; file names stay plain.
const long = writeFitWorkout({ name: 'Ç'.repeat(60), createdAt: DAY, steps: [{ name: 'ğ'.repeat(40), intensity: 'active', durationS: 60, target: null } as WorkoutStepIn] });
const lm = decode(long);
assert.ok((lm[1].f[8] as string).length > 0 && !(lm[1].f[8] as string).includes('�'));
assert.equal(workoutFileName('Eşik 2 × 8 dk', DAY).replace(/\d{4}-\d\d-\d\d/, 'D'), 'runtrovert-D-esik-2-8-dk.fit');

console.log('workout file: ok');
