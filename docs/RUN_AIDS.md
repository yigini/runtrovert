# Run aids: lock-screen buttons, alerts, voice cues, treadmill

Four things that help during a run. All free (single-run things), all on the
phone, nothing sent anywhere. Settings stay calm: two rows under
Settings → During a run, one quiet line on Home.

| Piece | Where | Code |
| --- | --- | --- |
| Rules (pure, tested) | — | `src/runAids.ts`, `npm run test:aids` |
| Voice and alerts during a run | — | `src/runCues.ts` (fed by `tracking.tick()` and each split) |
| Lock-screen buttons | live run notification | `src/runNotify.ts`, handler in `src/tracking.ts` |
| Treadmill | Home line, run, finish | `src/tracking.ts` (`indoorTick`, `settleDistance`), `IndoorSteps` in `src/gps/sensors.ts` |
| Settings pages | During a run → What the voice says / Pace and heart alerts | `src/components/RunAidsSettings.tsx` |
| Strings | group `runAids` in `src/i18n/ui/*.ts` (8 languages) | |

## 1. Pause and Lap on the lock screen (Android)

The silent live note ("4.21 km · 23:10") now carries buttons: **Pause** and
**Lap** while recording, **Resume** while paused or auto-paused. Two
notification categories (`run-live`, `run-live-paused`) because Android can't
relabel a button in place; the note is reposted on every status change and
right after a lap, so the buttons and the lap count ("3 laps") are always
current. Buttons don't open the app (`opensAppToForeground: false`); the
response listener in runNotify.ts hands them to tracking, which calls the same
`pauseRun` / `resumeRun` / `lap` as the screen. Ignored while the finish screen
is up. Needs "Lock screen and watch" on (the default) and notification
permission, like the note itself.

**Check on the phone:** lock the screen mid-run, tap Pause, Resume, Lap. The
watch app's own buttons are unchanged.

## 2. Pace and heart-rate alerts

Settings → During a run → Pace and heart alerts. Both off by default.

- **Pace:** "Quicker than" and "Slower than" in the runner's unit (stored as
  seconds per km), ± 5 s steps, at least 10 s apart.
- **Heart rate:** "Below" and "Above" in bpm, ± 5 steps. Needs the watch app
  or a strap; with no fresh reading (15 s) it never fires.

Rules (`RangeWatch`): out of range for **20 s** before anything, then at most
**once every 2 minutes** while still out; back inside says nothing. Pace is
read from the run's own distance and clock over the last 40 s (`PaceWindow`),
not the jumpy GPS speed, and pace alerts wait for the first 90 s. A long-short
buzz (not the split's two taps or the pause's three), plus one short sentence
with cues on Voice. They buzz even with cues on Silent (the runner asked for
them), but never on a quiet run (Clear my head, Run in silence today), and
stand aside during a guided session (plan or quick workout), which has its own
ranges and "could be easier" word.

## 3. Richer voice cues

Settings → During a run → What the voice says (spoken only with cues on Voice).

- **How often:** each km/mile (as before), each half, every 5 or every 10 min.
- **What it says:** distance, pace of that stretch, average pace, total time,
  heart rate. Always spoken in that order; at least one stays on.

Default is exactly the old sentence ("3 kilometres. 5 40 per kilometre. 17 05
total."), through the old code path. Splits are recorded the same whatever is
said, and each km still gives its two taps. Interval marks only move by whole
intervals, so a long stop or a slow tick gives one cue, not a burst; a run
picked back up after the app was killed starts counting from where it is.

## 4. Treadmill

Home, under Start: "On a treadmill?" turns it on ("Treadmill, no GPS · Run
outside"); remembered for next time, and Start reads "Start treadmill run". A
route to follow always runs outside.

- **No location at all:** no GPS service, no map, no permission prompt for
  location. Only the step counter ("physical activity"); without it the run
  still records time and asks for the distance at the end.
- **Live distance = steps × stride.** The stride is one learned on an earlier
  treadmill run, else the one GPS calibrated on an outdoor run (saved at the
  end of every outdoor run with enough steps), else 0.95 m. Kept under the
  settings key `stride` ({ outdoor, treadmill }).
- **Auto-pause** after 12 s without steps (step counters report in batches),
  resumes with the next steps. Steps while paused are dropped.
- Screen stays on during a treadmill run (Android only counts steps reliably
  with the app open; the phone sits on the console anyway).
- **Finish:** "What did the treadmill say?" with the step estimate. A typed
  number becomes the run's distance, its km splits are redrawn on it
  (`rescaleSplits`, same clock, scaled distance), and the stride it implies
  teaches the next treadmill run. Empty keeps the step distance.
- The run is marked under the settings key `indoorRuns` ({ steps, strideM } by
  run id), so a backup carries it; the run page says "Treadmill run, distance
  from steps". No route, so no places, stories or route bests.
- Crash recovery keeps it a treadmill run (snapshot `indoor`, `indoorSteps`).

## Not done / later

- iOS lock-screen buttons need a Live Activity (WATCHES.md step 2).
- A dedicated "health" foreground service for treadmill runs with the screen
  off (today the screen is kept on instead).
- Incline / treadmill speed entry; voice cue for laps beyond the existing one.
