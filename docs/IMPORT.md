# Bringing runs in

Settings › Your data › Backup, import and export › **Bring runs in** › Choose files.
Free, always: bringing your own runs in is never part of the unlock.

## What can be picked

| Pick | What happens |
| --- | --- |
| One or a few `.gpx`, `.fit`, `.tcx` files | Read and brought in straight away, as before. |
| The same files gzipped (`.fit.gz`, `.gpx.gz`, `.tcx.gz`) | Unzipped on the phone, then as above. |
| A whole **Strava** export (`export_12345.zip`) | Shown first ("412 new runs, 3,210 km in all, from March 2019 to October 2026"), saved only after **Bring them in**. |
| A whole **Garmin Connect** export | The same. Garmin puts zips inside the zip (`DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_*.zip`); those are opened too. |
| Any other zip of activity files | The same as an export. |

Where people get the exports:

- Strava: Settings › My account › Download or delete your account › Request your archive. An email with the zip follows.
- Garmin Connect: Account › Data management › Export your data. An email with the zip follows.

## From another app (the guide)

Under Bring runs in, one link ("Strava, Garmin and other apps: how to bring runs over") opens **From another app**: one row per app, closed until tapped, each with its own few steps and one line on what comes in. Choose files sits at the bottom of the page, so the steps and the picker are in one place. No second import entry anywhere else.

Apps listed (src/components/ImportGuide.tsx, text in `ui().importGuide.apps`): Strava, Garmin Connect, COROS, Polar Flow, Suunto, Nike Run Club, adidas Running, Runkeeper, Samsung Health, Fitbit, Apple Health (moving from an iPhone), Any other app. Apps with no file export point to Settings › Health Connect. The menu paths are written from each app's own help pages as of November 2026; apps rename menus, so check them when a runner says a path has moved.

What already comes in from those exports through the same zip walker: Strava and Garmin (above), adidas Running's `GPS-data/*.gpx`, Runkeeper's GPX files, Apple Health's `workout-routes/*.gpx` (no sport in those files, so walks can come in as runs; fast rides are left out by the speed check). Not read yet: Polar's whole-account JSON, adidas runs without GPS (JSON), Apple's `export.xml`.

## How it works (src/io)

- `unzip.ts` reads a zip **without holding it**: the directory at the end first, then one entry at a time, inflated in 256 KB pieces with `fflate` (pure JS, no native code). Zip64 is read, so a 6 GB Strava export with photos is fine; photos, videos and every other file are never read.
- `archive.ts` walks an export. Strava's `activities.csv` says what each activity was, so rides, walks, yoga and so on are left out **without opening the file**, and runs get their Strava name and id (`strava:<id>`, so a second import of the same export finds nothing new). Garmin's inner zips are written to the cache one at a time, walked, and deleted.
- Runs typed in by hand on Strava have a line in `activities.csv` and no file. They come in from the list (`stravaTypedIn`): date (Strava writes UTC, "Oct 12, 2026, 7:31:00 AM"), distance (the later metres column when the list has two), elapsed and moving time, name and `strava:<id>`. Saved like a run added by hand (kind `manual`, no route).
- `tcx.ts` reads TCX like `gpx.ts` reads GPX: tolerant patterns, no DOM. A treadmill TCX has laps and no positions; it comes in with its distance and time and no route.
- `store.ts` does it in **two passes**. The first reads and counts, saving nothing, and keeps only start, end and distance of each new run plus a list of file keys. The second reads just those files again and saves them. Years of runs never sit in memory at once.

Duplicates: the same rules as single files (`sameRun` in `shape.ts`: same outside id, more than half the time overlapping, or a start within three minutes at a similar distance), against runs already on the phone **and** within the export itself (Garmin often has the same run as FIT and GPX).

Brought-in runs say where they came from: Settings › Backup, import and export lists "Brought in from a Strava export" and "from a Garmin export" next to GPX, FIT and TCX files.

## Privacy

Nothing changes: the files come through the phone's own picker (no storage permission), are read on the phone, and nothing is uploaded or fetched. The cache copy of a Garmin inner zip is deleted as soon as it has been read.

## Tests

`npm run test:archive` builds Strava- and Garmin-shaped exports with Node's own deflate and checks: entries read in pieces and byte for byte, stored and deflated zips, gzip, TCX with and without a route, Strava's list (quotes, line breaks inside a description), runs-only, the second pass reading only what it was told, nested Garmin zips and a broken inner zip.

## Not done

- Strava's `media/` photos are not attached to runs.
- Polar, Suunto and Coros whole-account exports are untested; their single files work.
