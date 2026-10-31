# Real runs for npm run test:accuracy

Two real Garmin running recordings, used to check that Runtrovert's GPS filter
and climb counter agree with the watch on real-world fixes (not just on our
own simulations). Test data only: they never ship in the app.

| File | Source | Watch says |
|---|---|---|
| garmin-run-4.8km-5s.fit | `tests/files/2013-02-06-12-11-14.fit` in python-fitparse | 4835 m, 168 m climb, a fix every ~5 s |
| garmin-fenix2-run-9km-1s.fit | `tests/files/activity-small-fenix2-run.fit` in python-fitparse | 9008 m, 64 m climb, a fix every 1 s, barometric altitude |

From https://github.com/dtcooper/python-fitparse (MIT licence, © David Cooper
and contributors), copied unchanged and renamed.
