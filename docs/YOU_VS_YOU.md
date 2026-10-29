# You vs you, and sharing quietly

Runtrovert has no leaderboards and never compares you with anyone else. The only
rival is your own past running, and every number says how it was worked out.

## Bests

Fastest 1 km, 1 mile, 5 km, 10 km, half and full marathon, found anywhere inside
any run (`bestEfforts` in `src/progress.ts`), plus longest run and most climb.
Each one is also shown as a "lately" value from the last 90 days when that
differs, so a break or getting older never takes away real wins.

- Sliding window over the stored GPS points with interpolation at the start edge.
- Pauses: points stop while you stand still, so a gap of more than 15 s only
  counts for as long as covering it would take at your current pace.
- Steps faster than 12 m/s are GPS glitches and are skipped; any effort faster
  than 2:40/km is discarded.
- Worked out once per run and kept in the `run_facts` table (with the weather at
  the time). Older runs are filled in the first time History opens. Bump
  `FACTS_V` in `src/you.ts` when the maths changes.

## Trends (History → You vs you)

| Trend | Method |
| --- | --- |
| Fitness estimate | Best 5 km equivalent from efforts of 3 km or more, last six weeks vs the six before. Riegel: T₂ = T₁ × (D₂/D₁)^1.06. |
| Usual pace | Median pace of runs over 1 km, last six weeks vs the six before, with ~7 s/km taken off per 10 m of climb per km. |
| This week | Running time this week vs the average of the previous four weeks. Above +30% it suggests an easy week once (Nielsen et al. 2014). It never claims an injury risk. |
| Recharge | Average energy change over the last 20 rated runs, after at least 8. Names a time of day only when two or more have 3+ runs and one clearly wins. |
| Rhythm | Weeks with at least one run, out of the last 12. No streaks. |

Without a heart-rate strap "same effort" means your usual run, compared by
median. Pace at heart rate replaces it once straps are supported.

## The finish-screen line

One line per run at most (`youVsYou`): a new best, then a comeback after 14+
days, a 90-day best, a longest run, a recharge of two faces or more, then the
baseline (5 s/km or more quicker, or slower but recharged). Most runs get no
line, on purpose.

## Share with someone

On a run's page, or "Keep it and share with someone" on the finish screen. A
1080 × 1350 card is drawn on the phone (`src/components/ShareSheet.tsx`,
`react-native-view-shot`) and handed to the OS share sheet (`expo-sharing`).
Runtrovert never learns where it went.

- The route is a bare line with no map behind it, and the first and last 300 m
  are cut off (`src/shareShape.ts`). Under 400 m left means no route at all.
- The date is a weekday and a rough time of day. No place names, ever.
- The line (`src/shareLines.ts`) is first person and only claims what the phone
  knows: weather from the forecast already on the phone (no extra network call),
  time of day, your busyness and energy ratings, distance, climb and the
  comparison above. The pick is seeded by the run, so a run keeps its line;
  "Another line" walks through the rest. The card colour follows the line.
- Nothing ever prompts you to share.

`npm run test:progress` checks bests, trends, the finish line, every share line
across 400 generated runs (no gaps, no undefined, under 110 characters, a full
stop at the end) and the trimmed route.
