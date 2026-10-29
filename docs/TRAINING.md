# Training plans

Structure for people who do not want to be shouted at. Fourteen plans, from a first run to a marathon, generated on the phone for one runner, checked against nine rules before they are shown, and rewritten by the same generator whenever life gets in the way. No account, no server: a plan is one JSON value in the local SQLite settings table.

Plans sit behind the one-time unlock ("Everything, once", €4.99). There is no billing yet, so `src/unlock.ts` carries a build flag: `UNLOCKED_BUILD = true` in every current build.

## The catalogue

| Goal | Plan | Weeks | Runs/week | Notes |
|---|---|---|---|---|
| Just running | Start running | 9 | 3 | run/walk ladder, minutes not km |
| | Keep running | ongoing | 2–5 | four weeks at a time, ≤5% growth |
| | Come back | 6 | 3 | after a month or more off |
| 5K | Finish | 8 | 3 | easy only, strides from week 3 |
| | Improve | 8 | 4–5 | one harder day a week |
| 10K | Finish | 10 | 3–4 | |
| | Improve | 10 | 4–5 | |
| | Race (5K/10K) | 10 | 5–6 | two harder days |
| Half | Finish | 12 | 3–4 | long run to 18 km |
| | Improve | 12 | 4–5 | |
| | Race | 14 | 5–6 | |
| Marathon | Finish | 18 | 4 | long run capped at 32 km |
| | Improve | 18 | 5 | |
| | Race | 18 | 5–6 | long run capped at 35 km |

Each plan has a gate (what it expects you to be doing already). With fewer than four runs in the app in the last month the runner says where they are; otherwise the last four weeks of history decide. A plan below its gate can still be started; it begins from the runner's real numbers, not from where it would like them to be.

## The nine rules

Every generated plan, for every day count, start volume, race distance and start weekday, passes these (`npm run test:plans`, 1,944 plans). Every adaptation goes back through the generator and the same checks.

1. **Mostly easy.** ≥75% of each week's running minutes at easy or walking effort; ≥85% in Finish and no-race plans. (Seiler & Kjerland 2006; Stöggl & Sperlich 2014)
2. **No single run more than 10% longer than the longest of the previous 30 days**, or half a kilometre when that is more. Race day is the one exception. (Frandsen et al. 2025, BJSM)
3. **Weekly volume up by at most 10% a week and 30% over two weeks.** Lighter weeks are not a lower base to jump from. (Buist 2008; Nielsen 2014)
4. **A lighter week every fourth week** (every third with extra recovery): ≤80% of the week before, nothing hard. Only once the plan is over 15 km a week and more than two runs.
5. **Long runs under the cap**, under three hours, and under the plan's share of the week (45–50%).
6. **Hard work has limits.** Threshold ≤10% of the week, intervals ≤8% and ≤10 km, reps ≤5% and ≤8 km. Never two hard days in a row, never a hard day before the long run, nothing hard in weeks one and two. (Daniels)
7. **The taper cuts volume, not intensity.** Race week ≤60% of the peak; run days and some race-pace work stay. (Bosquet 2007)
8. **Effort first, pace second.** Every session is described by the talk test. Paces appear only when the runner gives a recent race (Daniels–Gilbert VDOT, `src/training/paces.ts`).
9. **Strength is optional**, at most twice a week, never the day before the long run. (Lauersen 2014)

## How a plan gives way

Nothing here ever adds load. Every change is written into the session's note so the week view can say what happened.

- **Low energy before a hard or long day** (face ≤2 on the home screen): Make it easy / Rest today / Run it as planned. "Easy" turns the day into 30 easy minutes and moves the hard session to a legal day later in the week when one exists. Three low days in a week make the next week lighter; five in two weeks say "see a doctor". When a long run gives way, the weeks after are laid out again so the next long run is read off what was actually run.
- **Pain after a run** ("Anything hurt?" on the finish screen): two days off, a week of easy running only, and the weeks after start again from the volume before it. Pain again within two weeks pauses hard sessions for four weeks and points at a physio.
- **Ill**: rest for as long as you were ill, then as many easy days, then the plan restarts from where it was (60% after a fortnight or more).
- **Away**: planned rest, not a miss. Two weeks or more and the plan comes back at 60%.
- **A gap**: 7–13 days without a run repeats the last completed week; 14–27 steps back to 60% with two gentle weeks; 28+ suggests Come back. The runner presses the button; nothing rebuilds behind their back.
- **Move / skip / did it without the app** on any session. Pause and stop on the plan.

The ongoing plan (Keep running) lays out four more weeks as its last one begins. Race plans finish the day after the race.

## In the app

- **Train tab**: catalogue → plan page (where you are, runs a week and which days, long-run day, race date, extra recovery, optional recent race for paces, week-one preview) → seven-question health check (PAR-Q+ style; only the date is stored) → the week.
- **Home**: "Today, from your plan" with the session, and the start button starts it.
- **During the run**: steps are read off the tracker's own tick, so cues ("Comfortably hard, 8 minutes.") arrive with the screen off. A strip on the live screen shows the step, how it should feel, what is left and what comes next.
- **After the run**: the day's session is ticked off at the distance run (any run ≥500 m or ≥5 min on a plan day counts). The pain line eases the days ahead.
- **Reminders**: while a plan is active it takes over the quiet reminders. A plan day gets one note naming the session, at the hour already chosen; rest days get nothing (the ordinary lines step aside for every day the plan covers). Reminders off means no plan reminders either. Paused plans hand the days back to the ordinary reminders. Tapping a plan note opens the Train tab.
- **Making it clear** (`src/components/PlanReminders.tsx`): the Train tab and the "How a plan works" page say in one card whether notes will come and at what time, with one tap to turn them on (permission first, then 3 a week if the count was 0). Home shows the same in one line under the plan, and on rest days shows the next session. Starting a plan opens "How a plan works" once: today, this week, the plan, missed days, reminders.
- **Calendar**: "Add the plan to a calendar" writes an `.ics` file (one all-day event per session) and opens the share sheet. No calendar permission, nothing syncs back.

## Code

```
src/training/catalogue.ts   the 14 plan specs, gates, GOAL_LABEL
src/training/generate.ts    the generator: week targets, light weeks, taper, sessions, balance
src/training/sessions.ts    session templates, effort words, pace sets
src/training/rules.ts       the nine rules as checks (validatePlan) and as text (RULES)
src/training/adapt.ts       missed weeks, energy, pain, illness, holidays, moving a session
src/training/paces.ts       VDOT from a race, paces and predictions
src/training/profile.ts     where the runner stands, from history
src/training/workout.ts     step runner for a guided session (pure)
src/training/store.ts       the one active plan, in the settings table; run → session bookkeeping
src/training/remind.ts      plan-day reminders
src/training/ics.ts         calendar export
src/training/dates.ts       local-midnight day arithmetic
src/workoutRun.ts           guided session glue: tracker tick → steps → cues
src/screens/TrainScreen.tsx the tab
scripts/test-plans.ts       npm run test:plans; `npm run test:plans -- half-improve` prints a plan
```

A plan is not medical advice. The health check and the pain line are there to send people to someone who can look at them.
