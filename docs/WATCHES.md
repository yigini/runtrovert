# Watches: Wear OS and Apple Watch

Same rules as the phone app: no account, no cloud, no server. Phone and watch talk
directly over the platform's own Bluetooth link (Wearable Data Layer on Android,
WatchConnectivity on iOS). Nothing goes through us, because there is no "us".

## Step 1: notifications (shipped in this change, no watch app)

Both watches mirror phone notifications by default, so the run notes are already
watch support:

- **A note at each km/mile** ("Km 3 · 5:42 /km", "3.00 km in 17:20."), with a
  short double buzz. One note replaces the last.
- **Android lock screen:** a silent ongoing notification with distance, time and
  average pace, refreshed every 30 s and on pause/resume.
- **Quiet reminders** and the after-run note reach the wrist the same way.

Wear OS shows bridged phone notifications if the Runtrovert app is allowed in the
Wear OS app's notification settings. Apple Watch shows them when the iPhone is
locked, which is exactly when you are running. Setting: Settings → Running →
Lock screen and watch.

Limits: no buttons on the watch yet, and the ongoing Android notification is not
bridged (Android does not bridge ongoing notifications), so on Wear OS you get the
per-km notes, not a live screen.

## Step 2: controls and live stats on the lock screen (native, small)

- **iOS Live Activity** (lock screen + Dynamic Island, and the Apple Watch Smart
  Stack on watchOS 11+): distance, time and pace, updated locally from the app.
  Needs a small Swift widget extension added through an Expo config plugin
  (for example `expo-apple-targets` or a hand-written plugin). No push server:
  updates come from the running app.
- **Android notification actions**: Pause / Resume / Lap buttons on the run
  notification. Doable with expo-notifications categories; buttons on bridged
  notifications also show on Wear OS.

## Step 3: real watch apps (separate native projects)

Neither watch can run React Native, so each is its own small app living in this
repo and built by CI alongside the phone app.

**Wear OS: shipped as phase 1, see "The Wear OS app" below.** Kotlin and
Compose for Wear OS in `wear/`, the phone's side in `modules/runtrovert-wear`.

**Apple Watch (Swift, SwiftUI)** in `watch/ios/`, added as a watchOS target via a
config plugin:
- `HKWorkoutSession` + `HKLiveWorkoutBuilder` for heart rate, distance, and the
  workout counted in Activity rings. Workouts can be saved to HealthKit only if
  the user turns that on (it fits Stage 5, data freedom).
- *Remote* and *standalone* modes as on Wear OS. With a workout session running,
  watchOS keeps the app on screen and wrist-raise brings it back.
- Phone side: an Expo native module (Swift) wrapping `WCSession`
  (`sendMessage` for live state, `transferUserInfo` for finished runs), speaking
  the same messages as the Wear OS app, so `src/wear.ts` serves both.

**Shared contract** (both platforms), small JSON over the native channel. The
message path says what it is (`src/wearProtocol.ts`, `wear/.../Protocol.kt`):
- Phone → watch: `/runtrovert/live { status, distanceM, durationS, unitsKm, needsOpen? }`
  once a second while the watch app is open, otherwise only when the state
  changes; `/runtrovert/split { index, durationS, distanceM, totalS, unitsKm }`.
- Watch → phone: `/runtrovert/cmd { cmd: start | pause | resume | stop }`,
  `/runtrovert/hello { open }` (repeated every 30 s while the app is on screen,
  and once a minute during a run), `/runtrovert/hr { s: [[epochMs, bpm], ...] }`
  every 5 s during a run. The phone answers every hello with a live message, and
  answers heart readings that arrive with no run on with one too, so a Stop the
  watch missed while out of reach is put right within a minute of coming back.
- Runs recorded on the watch alone: watch → phone `/runtrovert/run { id, part, of, d }`
  (the run's JSON in pieces of 40 000 characters), phone → watch
  `/runtrovert/runack { id, ok }` once it's kept or can't be read.

## Battery on the watch

- Remote mode never uses watch GPS: the phone records, the watch only displays.
- Standalone mode uses the platform workout APIs (Health Services, HKWorkout),
  which batch sensor reads in hardware.
- Updates to the watch are throttled harder when the watch screen is off.

## Order of work

1. ✓ Notifications.
2. Notification actions on Android, Live Activity on iOS.
3. ✓ Wear OS app, phase 1 (remote mode, heart rate, km buzz, tile).
   ✓ Phase 2: heart rate from any watch or strap over Bluetooth, heart rate in
   the GPX/FIT export, a complication; the tile and complication start a run.
   ✓ Phase 3: a run recorded on the watch alone, with the watch's GPS, handed
   to the phone later (see "Recording on the watch alone" below).
   Next: heart rate in You vs you and trends.
4. Apple Watch app in remote mode, then standalone.
5. ✓ Bluetooth heart-rate straps on the phone (shipped with phase 2, below).

Steps 3 and 4 need native builds: Wear OS fits the existing GitHub Actions
Android job; the Apple Watch app needs a macOS runner and the Apple Developer
account.


## The Wear OS app (phase 1)

Works on any Wear OS 3+ watch (Pixel Watch, Galaxy Watch 4 and later, and
others). Free: nothing here goes through `isUnlocked()`.

**What it does**
- **Start** on the watch starts the run on the phone, with the phone's own
  countdown and today's preset. If Runtrovert is closed or in the background on
  the phone, the watch opens it there first (Android only lets an app on screen
  start recording location), then asks again.
- **Live screen**: time, distance, pace and heart rate. The clock ticks on the
  watch itself; the phone sends the numbers once a second while the watch app
  is on screen, and only changes (paused, resumed, stopped) when it isn't.
- **Pause / Resume** as a round button; **Hold to stop** fills as you hold for a
  second, like the phone (#22). With TalkBack on, a double tap asks first.
  Stopping opens the finish screen on the phone, where the run is kept or not.
- **A buzz at each km or mile** (two short taps), with a small note if the app
  isn't open. The phone's own live and per-km notes are no longer bridged to the
  watch while the app is installed (`BridgingManager`, tags `runtrovert-live`
  and `runtrovert-split`), so the wrist doesn't buzz twice. Reminders still come
  through.
- **Heart rate** from the watch's sensor through Health Services
  (`ExerciseClient`, no GPS; `MeasureClient` if another app owns a workout).
  Sent to the phone every 5 s, kept on the watch until the phone is in reach
  again, dropped while paused. Stored in the `heart_rate` table with the run,
  deleted with it, and shown on the run's stats as time-weighted average and max.
  Asked for once, with our own line first: "Heart rate from this watch goes into
  the run on your phone, and nowhere else." Saying no keeps everything else.
- **A tile** one swipe from the watch face: tap to start, or, mid-run, where the
  run is at. It refreshes on state changes only.
- **A complication** (phase 2) for any watch face slot that takes short text
  or an icon: the mark and "Run". A tap starts a run, the same as Start in
  the app (the phone's countdown still runs). Mid-run it shows the run's
  time, ticking by the minute on the watch face itself ("12m"), or "Paused".
  Refreshed on state changes only, never on a timer. Add it by long-pressing
  the watch face → Edit → a complication slot → Runtrovert. The tile's tap
  starts a run too now, when none is on.
- **Ongoing activity**: while a run is on, it shows on the watch face and in the
  recents, with a stopwatch that ticks by itself.

**Privacy.** The watch app has no internet permission and no location
permission. Both sides send only to nodes that are `isNearby` (the direct
Bluetooth link, or the same Wi-Fi), so nothing goes through Google's cloud
relay. Settings → Watch app turns the phone's side off.

**Sensors across watches.** Pixel Watch reads about once a second during an
exercise. Samsung Galaxy Watch reads less often with the screen off; gaps
under 30 s count as readings, longer ones (watch off the wrist, out of reach)
are skipped by the average.

**Build.** `wear/` is a standalone Gradle project (AGP 8.13, Kotlin 2.2), built
by the `wear` job in `.github/workflows/android.yml` and uploaded as the
`runtrovert-wear-apk` artifact. Its package is `app.runtrovert`, the same as the
phone's, and it's signed with the same test key: the Data Layer only connects an
app to its twin. Watch version codes start at 100001 so they never collide with
the phone's on Play. Its text comes from the `watch` section of
`src/i18n/ui/*.ts`: `npm run wear:strings` writes `values-*/strings.xml`, and
`npm run test:wear` fails CI when they're out of date.

**Size.** About 2.4 MB for the watch APK. The phone APK grows by the Wearable
library, well under 1 MB.

### Installing the watch app for testing

Until the Play Console is set up (then the watch app installs from the store
next to the phone app), it goes on over Wi-Fi from a computer, once:

1. Install the phone APK from the same branch or from main (all test builds
   share one key, which the watch app needs to match).
2. Get Android's platform tools on the computer:
   https://developer.android.com/tools/releases/platform-tools (unzip; `adb` is inside).
3. On the watch: Settings → System → About → Versions, tap **Build number**
   seven times. Then Settings → Developer options → turn on **ADB debugging**
   and **Wireless debugging**. Watch and computer on the same Wi-Fi.
4. Wireless debugging → **Pair new device**. The watch shows an address with a
   port and a six-digit code. On the computer: `adb pair 192.168.x.x:port`,
   type the code.
5. Back on the Wireless debugging screen, note the address under "IP address &
   port" and run `adb connect 192.168.x.x:port`.
6. `adb install runtrovert-wear-NN.apk`. Runtrovert appears in the watch's app
   list and as a tile (long-press the watch face's tiles to add it).

Updates install the same way with `adb install -r`. Turn Wireless debugging off
afterwards; it drains the battery.


## Heart rate from any watch or strap (phase 2)

Not everyone has a Wear OS watch. Most running watches and every chest strap
can send heart rate over the standard Bluetooth Heart Rate service, and the
phone now reads it directly:

- **Garmin**: on the watch, Heart rate → Broadcast heart rate (on some models
  Settings → Sensors → Wrist heart rate → Broadcast, or "Broadcast during
  activity").
- **Polar, Coros, Suunto, Wahoo, Amazfit** and most others have the same
  setting, often called "HR broadcast" or "Share HR".
- **Chest straps** (Polar H9/H10, Garmin HRM, Wahoo TICKR...) do it as soon as
  they touch skin.
- Fitbit and Apple Watch don't broadcast. A Wear OS watch with the Runtrovert
  app doesn't need this: it already sends its readings.

**Settings → Heart rate from a strap or watch → Find one.** The phone looks for
12 s for anything offering the Heart Rate service; tap the one to use. While
the Settings page is open it shows the live reading, so you know it works
before going out. After that the phone connects by itself when a run starts
and lets go when it ends; out of range and back in, it reconnects on its own.

**How the readings are used.** Everything goes through one inlet,
`src/heartIn.ts`, whichever device sent it: into the `heart_rate` table with
the run, the run's average and max, deep stats' heart zones, each plan step's
heart-rate range (#59) and the optional "This could be easier" on easy
running. If a strap and the Wear OS app both send, the strap wins
(`keepReading` in `src/heart.ts`): chest straps read truer, and two sources
would zigzag. The watch takes over again if the strap goes quiet for 15 s.

**Export.** A run's GPX carries heart rate in Garmin's TrackPointExtension
(`<gpxtpx:hr>`), and its FIT file in each record (field 3) and in the
session's average and max (fields 16, 17), so Strava, Garmin Connect,
Runalyze and intervals.icu show it. Notes, energy, busyness and what you told
a plan stay out.

**Privacy.** The phone talks to the sensor directly. It asks for Android's
"Nearby devices" permission (`BLUETOOTH_SCAN`, marked `neverForLocation`, and
`BLUETOOTH_CONNECT`) only when you tap Find; on Android 11 and older,
scanning runs under the location permission the app already has. Only the
strap's name and Bluetooth address are saved, on the phone. Free, like the
rest of the watch work: nothing here goes through `isUnlocked()`.

**Code.** `modules/runtrovert-heart` (Kotlin, Android's own Bluetooth LE
classes, no library, so the phone APK grows by a few KB), `src/strap.ts` (the
JS side: permission, scan, connect for a run) and
`src/components/StrapSettings.tsx`. `npm run test:heart` covers the
two-source rule and heart rate on export points; `npm run test:io` the GPX
and FIT output.



## Recording on the watch alone (phase 3)

For a run without the phone. Free, like the rest of the watch app.

**When it's offered.** Only when the phone can't be reached: Start on the watch
looks for the phone as before; if it isn't there (or doesn't answer), the
"Phone not nearby" screen has one button, **Record on this watch**, and a line
saying the run goes to the phone later. The first time, Android asks for
location, physical activity (for distance from steps between GPS fixes) and
heart rate. No location: a short note, nothing records.

**While running.** The same screen as a phone run: time, distance, pace, heart
rate, Pause / Resume, Hold to stop, a buzz each km or mile (units as the phone
last said). `SoloService` runs a Health Services running exercise with GPS on
(location, total distance, climb when the watch has a barometer, heart rate),
foreground service type health|location, an ongoing activity on the watch face.
Health Services decides how often the GPS wakes; the app keeps at most one
point a second. Auto-pause is off on the watch.

**Afterwards.** "Saved on the watch. It goes to your phone next time they're
together, with Runtrovert open there." The run waits in the app's private
folder (`files/solo/run-<id>.json`). The run in progress is written there every
half minute, so a crash or a flat battery keeps it (recovered on next start).
Runs under a minute, or under 200 m with almost no GPS, aren't kept. The watch's
start screen says how many are waiting.

**Hand-over.** Whenever the phone app talks to the watch (it says hello on
opening and whenever it comes to the front), `SoloSync` sends each waiting run in
pieces, at most every two minutes per run. The phone puts the pieces together
(`addRunChunk`), turns the run into an imported run cut at each pause
(`watchRunToImported`, the watch's distance and moving time win) and keeps it
through `importParsed(…, 'watch')`, so de-duplication, heart rate, splits,
places and bests work as for any run. Then it acknowledges; only then does the
watch delete its copy. A run the phone can't read is set aside on the watch,
never deleted. The plan ticks the day's session off as for a phone run. The run
says "Recorded on your watch, without the phone."

**Code.** Watch: `SoloRun.kt` (state, storage), `SoloService.kt`, `SoloSync.kt`;
phone: `src/wearProtocol.ts` (pure, `npm run test:watch-solo`), `src/wear.ts`.
Watch version 0.3.0 (100003): reinstall by adb as before.

**Not yet.** Starting from the tile or complication with no phone goes to the
same "Phone not nearby" screen (one more tap). Watch-only runs don't follow a
plan session's steps; the run still ticks the day off. No map on the watch.
