// npm run test:quick — quick workouts outside a plan (src/training/quick.ts).
import assert from 'node:assert/strict';
import { clampSpec, isQuick, QUICK_PRESETS, quickMinutes, quickSession, quickSteps, quickTitle } from '../src/training/quick.ts';
import { advance, createWorkout } from '../src/training/workout.ts';

// Run 3, walk 1, six times: 5 warm-up, 6 runs, 5 walks between, 5 cool-down.
const rw = QUICK_PRESETS.runWalk;
const steps = quickSteps(rw);
assert.equal(steps.length, 1 + 6 + 5 + 1);
assert.equal(steps[0].kind, 'warm');
assert.equal(steps.filter((s) => s.kind === 'run').length, 6);
assert.equal(steps.filter((s) => s.kind === 'walk').length, 5);
assert.equal(steps[steps.length - 1].kind, 'cool');
assert.equal(quickMinutes(rw), 5 + 18 + 5 + 5);
assert.equal(quickTitle(rw), 'Run 3 min, walk 1 min, 6 times');

// Hard running gets a warm-up even when asked for none; values snap to the steppers.
const hard = clampSpec({ workS: 170, effort: 'hard', restS: 0, rest: 'jog', reps: 99, warmMin: 0, coolMin: 7 });
assert.equal(hard.warmMin, 5);
assert.equal(hard.workS, 180);
assert.equal(hard.reps, 20);
assert.ok([5, 10].includes(hard.coolMin));
assert.ok(quickSteps(hard).every((s) => s.kind !== 'jog' && s.kind !== 'walk'), 'no break: no rest steps');
assert.equal(quickTitle({ ...hard, reps: 1 }), 'Hard 3 min, 1 time');

// Every preset is a valid guided session the step runner can finish.
for (const [k, spec] of Object.entries(QUICK_PRESETS)) {
  const s = quickSession(spec, Date.UTC(2026, 10, 1, 8));
  assert.ok(isQuick(s), k);
  assert.ok(!s.done && !s.skipped);
  assert.ok(s.steps.every((st) => (st.durationS ?? 0) > 0 && st.label), k);
  const w = createWorkout(s.steps);
  let t = 0;
  let v = advance(w, 0, 0, 0).view;
  while (!v.finished && t < 4 * 3600) {
    t += 5;
    v = advance(w, t * 3, t, t * 1000).view;
  }
  assert.ok(v.finished, `${k} finishes`);
  assert.ok(Math.abs(t - quickMinutes(spec) * 60) <= 60, `${k} takes about its minutes`);
}
assert.equal(quickSession(QUICK_PRESETS.tempo, 0).hard, true);
assert.equal(quickSession(QUICK_PRESETS.runWalk, 0).kind, 'runwalk');
assert.ok(!isQuick({ id: 'w1d2' } as never));

console.log('quick: ok');
