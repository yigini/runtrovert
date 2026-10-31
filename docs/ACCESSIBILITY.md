# Safe and accessible use

Runtrovert is used mid-run, sweaty, one-handed, in sun and rain. The rules:

- **Nothing ends a run by accident.** Stop is held for a second (the button fills, then a buzz). A short tap only shows "Hold to stop". With TalkBack or VoiceOver on, holding is awkward, so a double tap asks "Stop the run?" instead. The back gesture asks too.
- **Stopping is not final.** The finish screen has **Resume run** at the top. It turns the sensors back on and carries on the same run. The clock stood still while you were on the finish screen.
- **Every control has a name, a role and a state.** Switches say what they switch. Single choices (cues, battery, countdown, units, energy faces, how busy, anything hurt) are radio buttons that say which one is picked. Steppers are adjustable: swipe up or down.
- **Numbers are spoken as words.** "4.21 kilometres, 26 minutes 5 seconds, average 6 minutes 12 seconds per kilometre", not "4.21, 26:05". See `src/a11y.ts`.
- **Text grows with the phone's font size.** Body text grows freely. The big display numbers and headlines are capped at 1.3× (`DISPLAY_MAX_SCALE`) because they are already large and would push Start or Stop off the screen. Buttons, pills and chips use `minHeight`, so a label wraps instead of being clipped. The three tabs share the width evenly.
- **Every chart says what it shows.** The deep stats read each row as words ("Uphill: 6 minutes 10 seconds per kilometre, 1.20 kilometres"), the heart zone bars sit beside their minutes, and the year grid is read as "days with a run, hours in all". Colour is never the only way to tell.
- **Sheets keep the reader inside.** On Listen, the shade behind a sheet is its own "Close" button, the sheet's words are separate items, and app and country pickers are radio buttons. The phone's reduce-motion setting stops sheets sliding.
- **Touch targets are at least 44 points**, including Listen's pills, chips, Open buttons, links and the music strip's previous, play and next.

## Phone test checklist

About 20 minutes. Do it on the smallest phone you have, if you can.

### 1. Stopping (no screen reader)

- [ ] Start a run. Tap Stop once, quickly. The run keeps going and "Hold to stop" appears above the button for a couple of seconds.
- [ ] Press and hold Stop. The button fills over about a second, the phone buzzes, the finish screen opens.
- [ ] Press Stop and let go halfway. The fill drains away and the run keeps going.
- [ ] On the finish screen, tap **Resume run**. You are back on the live screen, status "Recording", same distance and time as before. Walk a bit: the distance grows.
- [ ] Stop again (hold) and keep the run. History shows one run, not two.
- [ ] Under 50 m: hold Stop right after starting. "Barely moved." appears with Carry on / Discard / Keep it.

### 2. TalkBack (Android) or VoiceOver (iPhone)

Turn it on: Android Settings → Accessibility → TalkBack. iPhone Settings → Accessibility → VoiceOver. Swipe right to move to the next item, double tap to activate.

- [ ] **Home**: the headline is read as a heading. The energy faces read as "Okay, energy 3 of 5, radio button, not checked", then "checked" after a double tap. Start reads as a button.
- [ ] **Live run**: the numbers are one item that reads distance, time, average pace, pace right now and climb in words. Pause, Lap and "Stop run" read as buttons.
- [ ] **Stop with a screen reader**: double tap "Stop run". "Stop the run?" appears. "Keep running" carries on; "Stop" opens the finish screen.
- [ ] **Finish**: "Run done" is a heading, "Resume run" is a button, the stats read as one sentence. "How busy was it out there?" and "Anything hurt?" read their options as radio buttons with checked state.
- [ ] **History**: the tiles read "km this month: 12.40". Each run reads date, time, distance, duration, pace, energy and how busy, then "button, opens this run".
- [ ] **Train**: chips read as buttons with "selected". The week arrows read "Previous week, week 3" and say when they are unavailable. Each day reads its date, session, size and state. The weekly distance stepper reads as adjustable: swipe up and down to change it.
- [ ] **Settings**: each switch reads its name, e.g. "Auto-pause, switch, on", and its hint. Cues and Battery options read as radio buttons with checked state. Countdown, Units, Per week and At read as radio buttons, e.g. "Countdown: 3, radio button, checked".

### 3. Large text and small screens

Android: Settings → Display → Font size (largest) and Display size (largest). iPhone: Settings → Accessibility → Display & Text Size → Larger Text (largest standard size, then the largest accessibility size).

- [ ] **Home**: the words scroll; Start stays at the bottom, fully visible, with its whole label. Try with a plan session today, the weather on and the "what's new" line showing.
- [ ] **Tab bar**: all three tabs fit, none cut off.
- [ ] **Live run**: the numbers, Map, Pause, Lap and Stop all fit on screen without overlapping.
- [ ] **Finish**: the title and the stats card don't cover the route; the map gets taller instead. Resume run is reachable. The stats and buttons below scroll.
- [ ] **Run details** (open one from History): the charts and numbers fit, nothing is clipped.
- [ ] **Settings and Train**: no clipped labels on buttons, chips or the countdown and time pickers. Long chip rows wrap.

### 4. Deep stats

Open a run of 3 km or more in Your runs, scroll down, tap **Show me everything**. Then Your runs > Patterns, **Show me everything** again (unlocked test build).

- [ ] TalkBack: "Show me everything" reads as a button, collapsed; after a double tap, expanded, and it says "Show less".
- [ ] "The deep end" and "Everything, across months" read as headings, and so do the card titles with rows (Up, down and flat; Time in each heart zone; Morning you, evening you).
- [ ] Paces are read as words, e.g. "Uphill: 6 minutes 10 seconds per kilometre, 1.20 kilometres", never "six ten slash k m".
- [ ] Longest steady stretch reads the distance, then "At 5 minutes 40 seconds per kilometre, from 1.30 kilometres in…".
- [ ] With a watch run: heart rate drift reads "beats per minute", and each heart zone reads "Easy: 12 min" with the bar silent.
- [ ] The year grid reads as one item: "A year of running: N days with a run, N hours in all." The grid shows four clearly different greens and a small Less to More key.
- [ ] Largest font: the big numbers grow a little but stay on one line; a label and its value wrap onto two lines instead of overlapping.

### 5. Listen

- [ ] TalkBack: "Listen", "Your sound" and each shelf name ("New for your run", "Quiet company"…) read as headings.
- [ ] An episode card is two stops: first "show, episode title, 42 min, today, fits your run", hint "Opens the show and its latest episodes"; then "Open in Pocket Casts: episode title" (or your app).
- [ ] A cover on a shelf reads the show and who makes it, then the hint. Covers and initials are never read on their own.
- [ ] Open a show: its name reads as a heading, every line in the sheet can be reached one by one, and swiping never leaves the sheet. "Close" (the shade) and the back gesture both close it.
- [ ] Music and Podcasts pickers: each app reads as a radio button, "checked" on the one you use, "on this phone" where it applies. Change country: each country reads its name ("Germany, radio button") rather than a flag and letters.
- [ ] Kit & offers (only if a sponsor is live): topic chips read as checkboxes.
- [ ] Pills, chips, Open buttons, "Change country", "Pick a country" and the music strip's three buttons are easy to hit with a thumb.
- [ ] Turn on Remove animations (Android Settings > Accessibility > Colour and motion) or Reduce motion (iPhone): show and picker sheets appear without sliding.
- [ ] Largest font: the Listen title grows a little, episode titles and shelf names wrap or shorten with "…", and nothing overlaps the Open button.

### 6. Tonight's changes, on the oldest phone you have

- [ ] **New Run tab**: one suggestion at a time (plan session, then run to work, then usual place, then a tip). TalkBack reads the suggestion, then energy, then Start and Listen. Largest font: Start stays visible.
- [ ] **Tunnel or GPS loss**: run through an underpass or tunnel, or a long covered stretch. The distance keeps growing roughly right (steps fill the gap), no straight-line jump, and the pace settles again within a minute of open sky.
- [ ] **Screen off during a run**: start, lock the phone for 5 minutes with it in a pocket, unlock. Time and distance carried on, the voice cues still came, and the route on the finish map has no gap.
- [ ] **Calm finish screen**: Keep it and Discard come first, the optional "How was it" is folded below, then details. TalkBack: "Run done" is a heading and Keep it is reached within a few swipes.
- [ ] **Home and work map**: Settings > Home and work. Drag the map with one finger: it moves, the sheet doesn't close. With TalkBack, everything below the map can be reached by swiping, without touching the map.
- [ ] **Fewer words**: Settings > Quiet reminders > Fewer words on, then "Send me one now": the note is a plain fact, no joke. Same on the finish screen line.
- [ ] **Language switch**: Settings > Language, pick another language, go through Run, Your runs, Train, Listen and Settings. No English left behind, nothing clipped (German and Turkish are longest). Switch back to the phone's language.
- [ ] **FIT export**: Settings > Bring runs in from GPX or FIT files, or take them out > All runs as FIT. The zip saves through the share sheet; open one file in Garmin Connect or Strava if you have it. Then unzip it and bring two or three of the files back in: runs already here are noticed and left alone.

Note anything odd with the screen, the font size and the phone model, and send a screenshot if you can.
