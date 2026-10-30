# Notifications

Everything is local. There is no push service, no device token and no server:
the app schedules notifications on the phone, from data already on the phone.
Strategy page: https://claude.ai/artifact/SXvmCJFM5P37nRe6Gy2m1p

## Run reminders (`src/reminderPlan.ts`, copy in `src/lines.ts`)

Re-planned on app open, after a run is saved and when reminder settings change.
Nothing runs in the background.

- **Rhythm.** Mon/Wed/Fri at 8:00 until there are 4 runs in the last 8 weeks.
  Then, with "At: Auto", the weekdays you run on (twice or more), about 45 min
  before your median start time.
- **Skip.** Never within 20 h of a run. Never two in a day. Never 21:00–07:00.
- **Weather.** If the stored forecast says rain, drizzle, fog or snow for the
  slot, the line becomes a weather line, or names the first dry hour. It
  replaces a reminder, never adds one.
- **Back off.** Three delivered with no run between: one a week until the next run.
- **Go quiet.** Only 14 days are scheduled and the second week holds one last
  line. Not opening the app for two weeks means silence.
- **Fewer, please.** Button on every reminder: 5 → 3 → 1 → off.

`npm run test:reminders` checks these rules.

## Other notes

- Live stats (Android, ongoing) and km/mile splits during a run: `src/runNotify.ts`.
- After a run: 15 min later, "How was that?" if the energy check was skipped,
  otherwise a dry line. Dropped if it would land in quiet hours. Tapping opens the run.
- Run to work (`src/commuteStore.ts`): off by default. With home and work set
  and a day picked in Settings > Home and work, one line at 19:30 the evening
  before. None when reminders are off or after ten days away, none before a
  plan rest day, never a second note that day: it takes that day's ordinary
  slot and gives way to a plan note. `npm run test:commute` checks the timing.
- Monthly letter: comes with Stage 4, takes that day's reminder slot.
- The unlock is never a notification (one finish-screen line after run ten).
- Feature news: store notes plus one dismissable line on the home screen
  (`src/whatsNew.ts`, bump the id per release).

## Permission

Asked once, on the last welcome step ("A nudge now and then?"), which spells out the deal: never more than you picked (5 a week max, 1 a day), no streaks, sounds or badges, "Fewer, please" on each, written on the phone. Only "Yes,
quietly" opens the system prompt. "Not now" is final: no prompt on launch, at
run start or after a run. Settings shows "Notifications are off" with a Turn on
button, which opens the phone's settings if the prompt is blocked.

No sound, no badge, no exact-alarm permission.
