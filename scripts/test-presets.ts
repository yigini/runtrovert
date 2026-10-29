// npm run test:presets — which run layout you get, and when it stays silent.
import assert from 'node:assert/strict';
import { PRESETS, dayKey, effectivePreset, presetInfo, silentRun } from '../src/presets.ts';
import { advance, createWorkout, leftClock, stepFeel, stepName } from '../src/training/workout.ts';

// Never picked: the plan on a plan day, Just run otherwise (the old behaviour).
assert.equal(effectivePreset(null, true), 'plan');
assert.equal(effectivePreset(null, false), 'just');

// The last choice wins.
assert.equal(effectivePreset('clear', true), 'clear');
assert.equal(effectivePreset('just', true), 'just');
assert.equal(effectivePreset('plan', true), 'plan');

// My plan with nothing to follow today runs as Just run.
assert.equal(effectivePreset('plan', false), 'just');

// Silence: Clear my head always, the others only on the day the switch was set.
const now = new Date(2026, 9, 29, 18, 30).getTime();
assert.equal(dayKey(now), '2026-10-29');
assert.equal(silentRun('clear', null, now), true);
assert.equal(silentRun('just', null, now), false);
assert.equal(silentRun('just', '2026-10-29', now), true);
assert.equal(silentRun('plan', '2026-10-28', now), false);

// The chips fit on one line; the sheet uses the full name.
assert.deepEqual(PRESETS.map((p) => p.chip), ['Clear my head', 'Just run', 'My plan']);
assert.equal(presetInfo('plan').name, 'Follow my plan');

// The Follow my plan block card.
const steps = [
  { kind: 'warm' as const, effort: 'easy' as const, durationS: 600, label: 'Easy. Full sentences.' },
  { kind: 'hard' as const, effort: 'threshold' as const, durationS: 480, label: 'Comfortably hard' },
  { kind: 'run' as const, effort: 'easy' as const, distanceM: 1200, label: 'Easy. Full sentences.' },
];
assert.equal(stepName(steps[0]), 'Warm up');
assert.equal(stepName(steps[1]), 'Comfortably hard');
assert.equal(stepName(steps[2]), 'Easy');
assert.equal(stepFeel(steps[0]), 'Full sentences.');
assert.equal(stepFeel(steps[1]), 'Short sentences only.');
const w = createWorkout(steps);
assert.equal(leftClock(advance(w, 300, 348).view), '4:12');
assert.equal(leftClock(advance(w, 2550, 1080).view), '1.2 km'); // the distance block starts
assert.equal(leftClock(advance(w, 3000, 1300).view), '750 m');

console.log('presets: ok');
