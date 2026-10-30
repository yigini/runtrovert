# Notifications

Everything is local. There is no push service, no device token and no server:
the app schedules notifications on the phone, from data already on the phone.
Strategy page: https://claude.ai/artifact/SXvmCJFM5P37nRe6Gy2m1p

## Run reminders (`src/reminderPlan.ts`, copy in `src/lines.ts`)

Re-planned on app open, after a run is saved and when reminder settings change.
Nothing runs in the background.

- **How often.** One or two a day (default), one a day, a few a week, off.
  Builds before 30 Oct 2026 move once: off stays off, one a week becomes a few
  a week, anything else becomes one or two a day.
- **Rhythm.** The main note at 8:00 until there are 4 runs in the last 8
  weeks, then (with "At: Auto") about 45 min before your median start. A few a
  week uses Mon/Wed/Fri, then the weekdays you run on. One or two a day adds a
  second note around 17:30 ("work's nearly done", weekend lines on Sat/Sun),
  or at 8:00 for people whose main note is in the afternoon.
- **Skip.** Nothing in the 12 h after a run (20 h on a few a week). Never more
  than two a day, three hours apart. Never 21:00–07:00. Three or more days
  without a run: only the main note.
- **Weather.** If the stored forecast says rain, drizzle, fog or snow for the
  slot, the line becomes a weather line, or names the first dry hour. It
  replaces a reminder, never adds one.
- **Back off.** Delivered with no run between (3 on a few a week, 5 on one a
  day, 8 on one or two a day): one a week, or one a day, until the next run.
- **Go quiet.** Only 14 days are scheduled and the second week holds one last
  line. Not opening the app for two weeks means silence. Ten days without a
  run means silence until the next run.
- **Fewer, please.** Button on every reminder: one or two a day → one a day →
  a few a week → off.

## One scheduler

`rescheduleReminders` in `src/notify.ts` is the only place that schedules
notes ahead of time. Other features hand it notes through a `NoteSource`
(the training plan's `planNotes`; Run to work / Run home next). `fitNotes` in
`reminderPlan.ts` merges them: a source's `ownedDays` silence the ordinary
reminders on those days, extras win the day's places by priority (plan 10,
commute 5), and the cap above holds across all of them. Everything it places
carries `data.daily = true` and is cancelled and re-laid together.

`npm run test:reminders` checks these rules.

## Other notes

- Live stats (Android, ongoing) and km/mile splits during a run: `src/runNotify.ts`.
- After a run: 15 min later, "How was that?" if the energy check was skipped,
  otherwise a dry line. Dropped if it would land in quiet hours. Tapping opens the run.
- Run to work / Run home (`src/commute.ts`, `src/commuteStore.ts`): on by
  default once home and work are set (Settings > Home and work: Off, Mornings,
  Afternoons, Both). Weekdays, 07:00 "run to work?" and 16:30 "work's nearly
  done, running home?", with a rough distance. None on a day already run (a
  run to work keeps the afternoon one), none on plan rest days, afternoon only
  on plan days, nothing after ten days away or with reminders at 0. A day with
  a commute note gives up its ordinary line, so never more than two a day.
  `npm run test:commute` checks the timing.
- Monthly letter: comes with Stage 4, takes that day's reminder slot.
- The unlock is never a notification (one finish-screen line after run ten).
- Feature news: store notes plus one dismissable line on the home screen
  (`src/whatsNew.ts`, bump the id per release).

## Permission

Asked on the last welcome step ("A nudge now and then?"), which spells out the
deal: never more than you picked (two a day at most), no streaks, sounds or
badges, "Fewer, please" on each, written on the phone. Only "Yes, quietly"
opens the system prompt. One later ask, never repeated: on open for phones set
up before the welcome asked (they would otherwise never get a single note),
and after the first saved run for people who said "Not now". It is skipped once
the phone has blocked the prompt. Settings shows "Notifications are off" with a Turn on
button, which opens the phone's settings if the prompt is blocked.

No sound, no badge, no exact-alarm permission.
