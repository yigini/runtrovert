# Runtrovert

*Run alone. Not lonely.*

A running tracker for introverts. No feed, no followers, no account, no subscription.
Everything stays on the phone.

## What's in it (v0.6)

- **Ambient background**: 21 real-footage loops graded into the palette (Pexels, see `assets/CREDITS.md`; raw clips stay out of git, `scripts/grade-bg.sh <raw-dir> assets` makes them: 9:16, 900×1600, 24 fps, 6–8 s seamless loops, ~0.5 MB each). The home screen picks one from the same weather reading as its headline (`src/footage.ts`: storm, snow, rain, fog, night, dusk, cold, heat, wind, clear, cloud), rotating through a pool per scene by day; the welcome screen has the seawall, the countdown gets feet on cobbles or a trail. Plus three 12 s loops drawn in code — `painterly`, `flat`, `abstract` (`npm run bg`). Muted, local, pause in background; a still frame in battery saver. Pass `style=` to `AmbientBackground`.
- **Maps**: MapLibre — open source, no API key, no Google; `offline` prop draws the route on plain mint with zero tile requests
- **Error boundary**: a render crash shows the error on a cream screen instead of closing the app
- **Identity**: cream ground, ink text, five pastels with jobs (mint = time, peach = pace, lilac = you, butter = reminders, sky = welcome); Fraunces for headlines and numbers, DM Sans for everything else; five energy faces instead of 1–5; the live run flips to ink so the numbers glow. App icon, Android adaptive layers, splash and favicon are generated from the mark (`npm run icons`)
- **Tracking engine** (`src/gps/`): Kalman-filtered GPS weighted by reported accuracy, outlier rejection, jitter floor; simulated 5 km loop lands within ±1% at 5–25 m accuracy with stops, outliers and a tunnel (`npm run sim:gps`)
- **Pluggable location engine**: expo-location by default; `react-native-background-geolocation` (Transistor) is used automatically when installed — survives OEM battery killers and app death
- **Sensor fusion**: barometer for elevation gain (GPS altitude only as fallback), pedometer fills distance during GPS dropouts with a stride length calibrated from your own GPS
- **Crash recovery**: run state snapshotted every 5 s; if the OS kills the app, the next launch resumes the run with path, splits and laps intact
- GPS run tracking with background location (keeps recording with the screen off)
- Countdown start (0/3/5/10 s), start / pause / resume / stop, lap button
- **Auto-pause**: stops the clock when you stand still, resumes when you move
- **Splits** per km or mile with voice/haptic cue; laps; fastest split highlighted
- Swipeable live screen: metrics → current split → map
- Current pace, average pace, elevation gain, GPS quality
- **Cues**: Silent / Haptic / Voice (one calm sentence per km, no cheering)
- **Units**: metric or imperial, everywhere
- Energy check-in before and after each run (1–5), route busyness rating, optional note
- Local SQLite storage — runs, GPS points, splits, settings; never sent anywhere (the phone's own backup includes it if that's on)
- History, run detail with splits table and estimated calories, delete
- **The sky**: the home screen reads the local weather (Open-Meteo, no key; location rounded to ~1 km; switch in Settings) and writes the headline from it, plus best window, what to wear and when it gets dark. Besides map tiles it is the only network call
- **First-launch privacy screen** — opens on the motto, says the promise, once
- **Quiet reminders**: local-only notifications, 0/1/3/5 a week at a chosen hour, ~100 original lines that adapt to whether you ran yesterday or a week ago, never repeat for months, never mention streaks; optional one-line note 15 min after a run
- **Training plans** (Train tab; week 1 of every plan is free, the rest is part of the one-time unlock): 14 plans from a first run to a marathon, generated on the phone and checked against nine evidence-based rules before you see them (mostly easy, no run >10% longer than your longest in 30 days, +10%/week, a lighter week every fourth, long-run and hard-work caps, a taper that cuts volume not intensity, effort words first); guided sessions with cues; the plan gives way for low energy, pain, illness, days away and gaps; `.ics` calendar export, no calendar permission. See `docs/TRAINING.md`; `npm run test:plans` checks every plan

Not yet (stages 3–6): heart rate, watch apps, insights, quiet map, export/import, Health sync, widgets, i18n.

## Run it on your phone

```bash
npm install
npx expo start
```

**Important:** background location, maps, fonts and SQLite are native modules, so this
does **not** work in Expo Go. Build an APK once (free Expo account, ~15 min in the cloud):

```bash
npm install -g eas-cli
eas login                                            # free account at expo.dev
eas build --profile preview --platform android       # → download link for an .apk
```

Open the link on your phone, install the APK (allow "unknown sources" once), run.

For day-to-day development use the `development` profile instead: it builds a dev client,
then `npx expo start --dev-client` hot-reloads your JS changes without rebuilding.

For iOS you need an Apple Developer account ($99/yr) and `--platform ios`; it installs via TestFlight.

## Maps

MapLibre with the free OpenFreeMap "positron" style — no key, no Google Play Services dependency.
To self-host tiles later, change `MAP_STYLE` in `src/components/RouteMap.tsx`.

## Layout

```
App.tsx                      tab shell (Run / Train / History / Settings)
index.ts                     entry; imports tracking so the background task registers
src/tracking.ts              run state machine: auto-pause, splits, laps, recovery
src/gps/kalman.ts            GPS filter (gate → outlier rejection → Kalman → distance)
src/gps/engine.ts            location engine abstraction (expo-location | Transistor)
src/gps/sensors.ts           barometer elevation, pedometer gap fill
src/gps/recovery.ts          live-run snapshot for crash recovery
scripts/sim-gps.ts           simulated run; checks distance error of the filter
src/cues.ts                  haptic / voice cues
src/db.ts                    SQLite schema, migrations, queries, settings store
src/geo.ts                   haversine, unit-aware formatting
src/settings.tsx             settings context
src/notify.ts                reminder scheduler (local notifications only)
src/lines.ts                 the reminder line bank — edit freely, keep it dry
src/footage.ts               which background loop the sky gets (pools per scene, rotated by day)
src/surprises.ts             the rare finish lines and the few dated home lines
src/screens/WelcomeScreen.tsx
src/screens/RunScreen.tsx    pre-run → countdown → live (swipe pages) → post-run
src/screens/HistoryScreen.tsx
src/screens/RunDetailScreen.tsx
src/screens/SettingsScreen.tsx
src/screens/TrainScreen.tsx  plans: catalogue → setup → health check → the week → a session
src/training/                plan engine: catalogue, generator, nine rules, adaptation, paces, store, .ics
src/workoutRun.ts            guided session during a run (steps → cues, screen on or off)
src/unlock.ts                "Everything, once": isUnlocked(), the one gate (pure, `npm run test:unlock`)
src/unlockState.ts           unlock state saved on the phone, useUnlocked(), openUnlock()
src/billing.ts               Play Billing / StoreKit 2 via expo-iap, off until launch (BILLING_ON)
scripts/test-plans.ts        generates every plan every way and checks the nine rules
src/components/              Mark (icon + faces), MoodPicker, QuietPicker, PainPicker, RouteMap, SplitsTable, Button
scripts/make-icons.mjs       regenerates every icon asset from the mark
scripts/make-bg-video.mjs    renders the three drawn background loops
scripts/grade-bg.sh          grades raw Pexels clips into the footage loops (raw clips stay out of git)
src/components/AmbientBackground.tsx
src/theme.ts                 colours and spacing
```

## The unlock

"Everything, once" is one in-app product, `app.runtrovert.everything`, €4.99 at launch and €6.99 once full training plans ship. The split: privacy and quiet are never for sale, anything about a single run is free, anything built from months of runs is the unlock. Every feature asks `isUnlocked()` from `src/unlock.ts` and shows a `LockRow` (`src/components/LockRow.tsx`) where the locked thing would be; nothing has its own paywall. The unlock appears only in four places: the top row of Settings, lock rows, one line on the finish screen after run 10 ("Not now" means never again), and "How this app makes money".

GitHub test APKs are unlocked. Store builds set `EXPO_PUBLIC_STORE_BUILD=1` (the `production` profile in `eas.json`), which turns the locks on. Billing goes straight to Google Play and the App Store through expo-iap, with no server and no RevenueCat; it stays off until launch (`BILLING_ON` in `src/unlock.ts`). To see the locks in a test build, open Settings → Everything, once → Show the locks.

## Next steps

1. Test a real run. Record a known-distance route (a measured 400 m track × N laps is ideal) and compare. Filter defaults live in `src/gps/kalman.ts` (`DEFAULT_FILTER`); auto-pause in `src/tracking.ts`.
2. For bulletproof Android background: `npx expo install react-native-background-geolocation`, add its config plugin to `app.json`, set the Android licence key. No code changes — the engine is picked up automatically.
3. Stage 3 (plans done): weekly load view, goals; create the store product and switch billing on.
4. Stage 4: insights, personal records, energy analysis, quiet map, weather, shoes.
5. Stage 5: GPX/FIT export, imports, HealthKit / Health Connect, encrypted backup.
6. Stage 6: widgets, live activities, share image, themes, i18n, store listing.
