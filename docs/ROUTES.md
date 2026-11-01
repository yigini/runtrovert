# Following a route, and maps without signal

Both free, both on the phone only.

## Follow a route

Three ways to pick one. Each puts the route on the Run screen ("Your route", with an ×), drawn faintly on the live map; Start runs it as Just run.

| From | How |
| --- | --- |
| A past run | Your runs › open the run › **Follow this route**. |
| A place | Run this again (as before; now it also buzzes). |
| A file | Settings › Running › **Routes to follow** › Bring in a route. GPX (track or `<rte>`, times not needed) or TCX course, from Komoot, Strava routes, Garmin courses, any map site. Kept in the `routes` table, in the backup like everything else. Tap a route: Follow it, Save its map, Remove. |

Run to work's faint "last time" line is a hint, not a route: it never buzzes.

### What the runner feels (src/routeFollow.ts, `RouteWatch`)

- Nothing until they have been on the route once (within 30 m). Running to the start is not "off".
- **Off**: further than 45 m from the line (wider with poor GPS: twice the reported accuracy, at most 90 m) for three fixes and ten seconds in a row → **two long buzzes** (650 ms each), unlike every other cue. The status pill turns butter: "Off the route · 120 m".
- While still off: a reminder after one minute, another after two more, then quiet. Choosing your own way is allowed.
- **Back**: within 30 m for two fixes → one calm tap; the pill shows the route's name again.
- With voice cues on, "Off the route." / "Back on the route." are said too.
- The buzz comes even on a quiet run or with cues set to silent: following was asked for on purpose.

The route is simplified (Douglas–Peucker, 4 m) before the run; checking a fix against it is a few thousand multiplications a second at most.

Not done: a run picked back up after Android killed the app forgets the route (the line is gone from the map too). Turn-by-turn directions are not planned.

## Maps without signal (src/offlineMaps.ts, src/mapArea.ts)

Settings › Running › Map › **Maps without signal**:

- **Save the map around here**: about 16 km across, centred on the last known position. Shown first with a size estimate ("Roughly 9 MB … Best on Wi-Fi").
- From a saved route: **Save its map**, the route's box plus 1.5 km each side.
- Each saved area lists its size; tap to remove.

MapLibre's own offline store does the work (`OfflineManager.createPack`), zoom 8 to 14 (OpenFreeMap's vector tiles stop at 14; closer zooms are drawn from them). One area is two packs, light and dark styles, which share the street tiles. Areas over 4,000 tiles are refused. With Plain map on there is nothing to save, and the page says so.

Privacy: the tiles come once from OpenFreeMap, the host the map always uses; it sees the area being fetched. The privacy policy row for OpenFreeMap says so.

## Free list

The unlock screen's free list and the site's price chapter now say "Your places and routes to follow, silent runs, quiet reminders, the map, even with no signal" and "Bring runs in, a whole Strava or Garmin history too, …" (all 8 languages, `npm run test:unlock`).

## Tests

`npm run test:routes`: distance to the line, simplify, running the route (no buzz), running to the start (no buzz), a wrong turn (buzz in 15–30 s, reminders, then quiet), a detour and back (off, back), one or two bad fixes (nothing), poor GPS widening the line, route files (GPX track without times, `<rte>`, TCX course, a recorded run), and the saved-map boxes and tile counts.

## Far from the route

"Follow this route" (Your runs) and Follow it (Settings › Routes to follow) first check where the runner is, from a fresh fix only (the phone's last fix within 30 minutes, or a quick new one; never the place remembered from an old run). Within 2 km of any part of the route, it goes to the Run tab as before. Further away, it stays put and says so: "This route is 340 km from you.", with **Keep it in Routes to follow** (from a past run) and a small **Follow anyway**. With no fix (location off, no signal) it says it can't tell, rather than guessing. `src/routeNear.ts`, `distanceToRoute` and `roughDistance` in `src/routeFollow.ts`, tested in `npm run test:routes`.
