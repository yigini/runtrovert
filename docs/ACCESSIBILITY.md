# Safe and accessible use

Runtrovert is used mid-run, sweaty, one-handed, in sun and rain. The rules:

- **Nothing ends a run by accident.** Stop is held for a second (the button fills, then a buzz). A short tap only shows "Hold to stop". With TalkBack or VoiceOver on, holding is awkward, so a double tap asks "Stop the run?" instead. The back gesture asks too.
- **Stopping is not final.** The finish screen has **Resume run** at the top. It turns the sensors back on and carries on the same run. The clock stood still while you were on the finish screen.
- **Every control has a name, a role and a state.** Switches say what they switch. Single choices (cues, battery, countdown, units, energy faces, how busy, anything hurt) are radio buttons that say which one is picked. Steppers are adjustable: swipe up or down.
- **Numbers are spoken as words.** "4.21 kilometres, 26 minutes 5 seconds, average 6 minutes 12 seconds per kilometre", not "4.21, 26:05". See `src/a11y.ts`.
- **Text grows with the phone's font size.** Body text grows freely. The big display numbers and headlines are capped at 1.3× (`DISPLAY_MAX_SCALE`) because they are already large and would push Start or Stop off the screen. Buttons, pills and chips use `minHeight`, so a label wraps instead of being clipped. The five tabs share the width evenly.

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
- [ ] **Tab bar**: all five tabs fit, none cut off.
- [ ] **Live run**: the numbers, Map, Pause, Lap and Stop all fit on screen without overlapping.
- [ ] **Finish**: the title and the stats card don't cover the route; the map gets taller instead. Resume run is reachable. The stats and buttons below scroll.
- [ ] **Run details** (open one from History): the charts and numbers fit, nothing is clipped.
- [ ] **Settings and Train**: no clipped labels on buttons, chips or the countdown and time pickers. Long chip rows wrap.

Note anything odd with the screen, the font size and the phone model, and send a screenshot if you can.
