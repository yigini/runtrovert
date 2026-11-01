# Workout files for Garmin, Coros and other watches

A plan session or a quick workout can be saved as a FIT **workout** file
(file type 5), the format Garmin, Coros, Suunto, Wahoo and others load so the
watch guides the steps itself: warm-up, reps, recoveries, cool-down, with a
buzz at each change.

Free, always: it is a way of taking your own things out of the app. The line
only shows where the session itself is open, so a plan's sessions after week 1
stay behind the unlock exactly as their guided version does (`planSessionOpen`).

## Where

- Train → a session → under the steps: "Save it for a Garmin, Coros or other watch".
- Train → Quick workout → under Start.

One quiet line. A tap explains how to load the file, then opens the share sheet.

## What is in the file

- `file_id` (type workout, manufacturer "development"), `workout` (sport
  running, name = the session title, step count), one `workout_step` per step.
- Time steps in ms, distance steps in cm. No size means "until lap press".
- Back-to-back identical blocks of one to four steps fold into a
  "repeat until steps complete" step: Intervals 5 × 3 min becomes warm-up,
  hard, jog, repeat × 4, hard, cool-down. Keeps long sessions under the step
  limits some watches have.
- Targets: the plan's pace when it has paces from a race (±3%, ±7% on easy
  running so a hill doesn't make it nag); otherwise the heart rate range from
  Settings when there is one; otherwise none. Walks, strides and recovery jogs
  never get a target.
- Intensity: warm-up, cool-down, recovery (jogs and walks), active.

Code: `src/io/fitWorkout.ts` (pure writer, folding), `src/training/workoutFile.ts`
(session → steps and targets), `src/components/WorkoutFileLink.tsx`.
Test: `npm run test:workout-file`. Checked against Garmin's own FIT SDK decoder
(`@garmin/fitsdk`): file and header CRCs valid, every message read without errors.

## Getting it onto the watch

- **Garmin**: connect the watch by USB and copy the file into `GARMIN/NewFiles`;
  it shows under Training → Workouts. Garmin Connect's phone app does not import
  workout files, so the share sheet can't send it there directly.
- **Coros, Suunto, Polar, Wahoo, Garmin without a cable**: through a planning
  app that syncs workouts to the watch, such as intervals.icu (free), which
  imports .fit workouts.

Not yet checked on a real watch. If a model refuses the file, the likely
suspects are the step name length (cut to 31 bytes) and the repeat step.
