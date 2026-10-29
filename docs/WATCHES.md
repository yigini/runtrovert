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

**Wear OS (Kotlin, Compose for Wear OS)** in `watch/wear/`:
- Two modes. *Remote*: shows the phone's live numbers and sends Pause/Lap/Stop.
  *Standalone*: records with the watch GPS and heart-rate sensor while the phone
  stays home, then syncs the run to the phone when they are next together.
- Health Services `ExerciseClient` for GPS, heart rate and auto-pause, which is
  far kinder to the battery than raw location.
- Ongoing Activity API, so the run shows on the watch face while recording.
- Phone side: a small Expo native module (Kotlin) wrapping the Wearable Data
  Layer `MessageClient` / `DataClient`, exposing `sendLive(state)` and
  `onCommand(cb)` to JS.

**Apple Watch (Swift, SwiftUI)** in `watch/ios/`, added as a watchOS target via a
config plugin:
- `HKWorkoutSession` + `HKLiveWorkoutBuilder` for heart rate, distance, and the
  workout counted in Activity rings. Workouts can be saved to HealthKit only if
  the user turns that on (it fits Stage 5, data freedom).
- *Remote* and *standalone* modes as on Wear OS. With a workout session running,
  watchOS keeps the app on screen and wrist-raise brings it back.
- Phone side: an Expo native module (Swift) wrapping `WCSession`
  (`sendMessage` for live state, `transferUserInfo` for finished runs).

**Shared contract** (both platforms), small JSON over the native channel:
- Phone → watch: `{ t: 'live', status, distanceM, durationS, paceS, splitIndex }`
  at most once a second while the watch app is open, every 10 s otherwise.
- Watch → phone: `{ t: 'cmd', cmd: 'pause' | 'resume' | 'lap' | 'stop' }`, and
  `{ t: 'run', points, splits, hr }` for runs recorded on the watch.

## Battery on the watch

- Remote mode never uses watch GPS: the phone records, the watch only displays.
- Standalone mode uses the platform workout APIs (Health Services, HKWorkout),
  which batch sensor reads in hardware.
- Updates to the watch are throttled harder when the watch screen is off.

## Order of work

1. ✓ Notifications (this change).
2. Notification actions on Android, Live Activity on iOS.
3. Wear OS app in remote mode, then standalone.
4. Apple Watch app in remote mode, then standalone.
5. Bluetooth heart-rate straps on the phone (separate; uses BLE, not the watch).

Steps 3 and 4 need native builds: Wear OS fits the existing GitHub Actions
Android job; the Apple Watch app needs a macOS runner and the Apple Developer
account.
