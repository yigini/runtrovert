# Runtrovert

*Run alone. Not lonely.*

A running tracker for introverts. No feed, no followers, no account, no subscription.
Everything stays on the phone.

## What's in it (v0.6)

- **Ambient background**: two real-footage loops graded into the palette (`dusk` — a lone figure on a ridge at dusk, behind the splash and welcome; `tree` — a distant runner by a big tree, behind the start screen; Pexels footage, see `assets/CREDITS.md`), plus three 12 s loops drawn in code — `painterly` (default: hazy dawn, distant conifers, drifting ground mist, grain), `flat` (clean motion graphic) and `abstract` (breathing gradients, light leak, one sharp dot). Behind the splash, welcome and start screens; ~0.5 MB each, muted, local, pause in background. Pass `style=` to `AmbientBackground` or change `DEFAULT_STYLE`; `npm run bg` regenerates them
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
- Local SQLite storage — runs, GPS points, splits, settings; nothing leaves the device
- History, run detail with splits table and estimated calories, delete
- **First-launch privacy screen** — says the one thing the app is about, once
- **Quiet reminders**: local-only notifications, 0/1/3/5 a week at a chosen hour, ~100 original lines that adapt to whether you ran yesterday or a week ago, never repeat for months, never mention streaks; optional one-line note 15 min after a run

Not yet (stages 3–6): heart rate, watch apps, training plans, insights, quiet map, export/import, Health sync, unlock, widgets, i18n.

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
App.tsx                      tab shell (Run / History)
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
src/screens/WelcomeScreen.tsx
src/screens/RunScreen.tsx    pre-run → countdown → live (swipe pages) → post-run
src/screens/HistoryScreen.tsx
src/screens/RunDetailScreen.tsx
src/screens/SettingsScreen.tsx
src/components/              Mark (icon + faces), MoodPicker, QuietPicker, RouteMap, SplitsTable, Button
scripts/make-icons.mjs       regenerates every icon asset from the mark
scripts/make-bg-video.mjs    renders the ambient background loop
src/components/AmbientBackground.tsx
src/theme.ts                 colours and spacing
```

## Next steps

1. Test a real run. Record a known-distance route (a measured 400 m track × N laps is ideal) and compare. Filter defaults live in `src/gps/kalman.ts` (`DEFAULT_FILTER`); auto-pause in `src/tracking.ts`.
2. For bulletproof Android background: `npx expo install react-native-background-geolocation`, add its config plugin to `app.json`, set the Android licence key. No code changes — the engine is picked up automatically.
3. Stage 3: training plans, interval workouts, weekly load, goals.
4. Stage 4: insights, personal records, energy analysis, quiet map, weather, shoes.
5. Stage 5: GPX/FIT export, imports, HealthKit / Health Connect, encrypted backup.
6. Stage 6: widgets, live activities, share image, themes, i18n, one-time unlock, store listing.
