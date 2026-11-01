# Health Connect

Android's own on-phone store for health and fitness data. Runtrovert uses it
for runs only, only when the runner switches it on, and never in the background.
Free: nothing here goes through `isUnlocked()`.

## What the runner sees

Settings › Privacy and data › **Health Connect** (shown on Android 9+ only; on
Android 9–13 Health Connect is an app from the Play Store, and the page offers it).

- **Add your runs** (off by default). Turning it on opens Health Connect's own
  permission screen for writing. From then on every saved run goes in.
- **Add the runs you already have** (shown once the switch is on).
- **Bring in runs from Health Connect**: asks for read access, then reads
  running sessions other apps saved (Samsung Health, Fitbit, Garmin Connect…)
  and keeps them like imported files. Only when pressed.
- **Open Health Connect**: where access is taken back.

If access is taken back in Health Connect, the switch turns itself off the
next time the page opens.

## What goes out

For runs recorded here or added by hand (`writesToHealth`), never for runs that
came from a file or from Health Connect itself:

| Health Connect record | From |
|---|---|
| `ExerciseSessionRecord`, type RUNNING, title "Run", pause segments | start, end, gaps in the track over 15 s |
| `DistanceRecord` | the run's distance (after any correction) |
| `ElevationGainedRecord` | the run's climb, when above 0 |
| `HeartRateRecord` (pieces of ≤1000 readings) | watch or strap heart rate, when there is any |

Never the route, notes, energy, busyness, places or anything a plan was told.
Recording method: actively recorded; "manual entry" for runs added by hand.
Each record has clientRecordId `runtrovert-run-<id>[-distance|-climb|-heart-N]`
and version = time of writing, so a correction replaces the earlier copy.
Deleting a run here deletes our records in its time span (Health Connect only
lets an app delete its own records, so another app's copy stays).

## What comes in

`ExerciseSessionRecord` of type RUNNING or RUNNING_TREADMILL from other apps
(our own are skipped), with distance and climb aggregated from the same app,
moving time = span minus pause/rest segments, heart rate from the same app.
No routes: reading other apps' routes needs a per-session consent screen, and
for a calm first version a run without a map is better than a dialog per run.
They go through `importParsed(…, 'health')`, so de-duplication against runs
already here, history and bests work as for files. "Brought in from Health
Connect (Samsung Health)" on the run.

Health Connect itself limits how far back an app can read (30 days before access
was first given, unless the runner allows more).

## Permissions (Play's Health apps declaration needs these listed)

`android.permission.health.` WRITE_EXERCISE, WRITE_DISTANCE,
WRITE_ELEVATION_GAINED, WRITE_HEART_RATE, READ_EXERCISE, READ_DISTANCE,
READ_ELEVATION_GAINED, READ_HEART_RATE. No route, no background read, no
history read, no steps, calories, sleep or anything medical.

The manifest also has the rationale activity Health Connect requires
(`HealthRationaleActivity`, opening runtrovert.app/privacy.html#health-connect)
and the Android 14 `VIEW_PERMISSION_USAGE` alias.

## Code

- `modules/runtrovert-health` (Kotlin, `androidx.health.connect:connect-client:1.1.0`).
- `src/health.ts` glue and hooks: new run saved (App.tsx), run added by hand
  (AddRunSheet), corrected or put back, deleted (RunDetailScreen).
- `src/healthShape.ts` pure half; `npm run test:health`.
- `src/components/HealthSettings.tsx` the page.

## Before the store

- Play Console › App content › Health apps: declare fitness only (running),
  list the permissions above with the reason for each, no medical claims.
- Privacy policy section "Health Connect" (site/privacy.html) with the Limited
  Use statement, which Play checks.
- Not mentioned in the store listing or site until the declaration is accepted.
