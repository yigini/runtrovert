// Every line the voice modules can produce for a wide spread of made-up runs
// and weather, as one JSON object. `npm run test:voice` compares the English
// against scripts/fixtures/voice-en.json, so moving text around never changes
// a word; with a language code it prints that language's output for review:
//   node --experimental-strip-types --import ./scripts/node-ts.mjs scripts/voice-snapshot.ts tr
import type { Weather, Hour, Sky } from '../src/forecast.ts';
import type { Comparison } from '../src/progress.ts';
import { youVsYou } from '../src/progress.ts';
import { headline, suggestions } from '../src/sky.ts';
import { finishSurprise, seasonalLine } from '../src/surprises.ts';
import { candidates, type ShareFacts, type ShareSky } from '../src/shareLines.ts';
import { TOPICS } from '../src/tips.ts';
import { localTips, voice } from '../src/i18n/voice/index.ts';
import { withLang, type Lang } from '../src/i18n/lang.ts';
import type { Run } from '../src/types.ts';

const BASE = new Date(2026, 9, 14, 7, 30).getTime(); // a Wednesday morning, local time
const H = 3600000;
const SKIES: Sky[] = ['clear', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

function weather(sky: Sky, tempC: number, feelsC: number, windKmh: number, isDay: boolean, rainP: number, now: number): Weather {
  const hours: Hour[] = Array.from({ length: 14 }, (_, i) => ({
    t: now + i * H,
    tempC: tempC + i * 0.4,
    feelsC: feelsC + i * 0.4,
    rainP: i < 3 ? rainP : Math.max(0, rainP - 40 - i * 3),
    sky: i < 3 ? sky : 'cloud',
    windKmh,
    isDay: isDay || i > 2,
  }));
  return { fetchedAt: now, tempC, feelsC, windKmh, sky, isDay, sunrise: now - 2 * H, sunset: now + (isDay ? 9 : -1) * H, nextSunrise: now + 22 * H, hours };
}

export function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Home weather: headline and the three suggestions.
  const home: string[] = [];
  for (const sky of SKIES)
    for (const [t, f] of [[-6, -10], [2, -1], [10, 8], [16, 16], [22, 22], [29, 31]])
      for (const wind of [5, 35])
        for (const isDay of [true, false])
          for (const rainP of [0, 65, 90])
            for (const metric of [true, false])
              for (const day of [0, 1, 2]) {
                const now = BASE + day * 24 * H + (isDay ? 0 : 12 * H);
                const w = weather(sky, t, f, wind, isDay, rainP, now);
                home.push(headline(w, metric, now));
                for (const s of suggestions(w, metric, now)) home.push(`${s.label}: ${s.text}`);
              }
  out.home = [...new Set(home)].sort();

  // Finish surprises.
  const hist = (n: number, longest = 5000): Run[] =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, startedAt: BASE - (i + 1) * 3 * 24 * H, distanceM: i === 0 ? longest : 4000, durationS: 1500 } as unknown as Run));
  const surprises: string[] = [];
  const cases: Array<[number, number, number, Sky | null, boolean]> = [
    [0, 4000, 0, null, true], [12, 42300, 6, null, true], [12, 21200, 6, null, true], [12, 10050, 6, null, true],
    [99, 5000, 6, null, true], [49, 5000, 6, null, true], [12, 3000, 6, 'snow', true], [12, 8000, 6, null, true],
    [12, 5005, 6, null, true], [12, 4828, 6, null, false], [12, 4300, 6, 'rain', true], [12, 4300, 6, 'snow', true],
    [12, 4300, 5, null, true], [12, 4300, 23, null, true], [12, 4300, 12, null, true],
  ];
  for (const [n, dist, hour, sky, metric] of cases) {
    const start = new Date(BASE);
    start.setHours(hour);
    const s = finishSurprise({ startedAt: start.getTime(), distanceM: dist, durationS: dist * 0.33 }, hist(n, n > 0 ? 7000 : 0), sky, [], metric, start.getTime());
    surprises.push(s ? `${s.id}: ${s.line}` : 'none');
  }
  for (let d = 0; d < 366; d++) {
    const l = seasonalLine(new Date(2028, 0, 1 + d, 12).getTime());
    if (l) surprises.push(l);
  }
  out.surprises = surprises;

  // Share lines: every candidate line for a spread of facts.
  const share = new Set<string>();
  const cmp0: Comparison = { best: null, recentBest: null, gapDays: null, longest: null, recharge: null, baselineDeltaS: null, runsThisWeek: 1, slowestThisMonth: false, firstRun: false };
  const cmps: Comparison[] = [
    cmp0,
    { ...cmp0, firstRun: true },
    { ...cmp0, best: { key: '5k', label: '5 km', seconds: 1612, marginS: null, previousAt: null } },
    { ...cmp0, best: { key: 'half', label: 'half marathon', seconds: 7012, marginS: 42, previousAt: BASE - 90 * 24 * H } },
    { ...cmp0, best: { key: '10k', label: '10 km', seconds: 3300, marginS: 125, previousAt: BASE - 40 * 24 * H } },
    { ...cmp0, best: { key: '1k', label: '1 km', seconds: 290, marginS: 1, previousAt: BASE - 4 * 24 * H } },
    { ...cmp0, gapDays: 15 }, { ...cmp0, gapDays: 30 }, { ...cmp0, gapDays: 52 }, { ...cmp0, gapDays: 140 },
    { ...cmp0, recentBest: { key: '5k', label: '5 km', seconds: 1700 } },
    { ...cmp0, longest: 'ever' }, { ...cmp0, longest: 'months' },
    { ...cmp0, recharge: 2 }, { ...cmp0, recharge: 3 }, { ...cmp0, recharge: 4 },
    { ...cmp0, recharge: 1, slowestThisMonth: true },
    { ...cmp0, baselineDeltaS: -12 }, { ...cmp0, baselineDeltaS: 14, recharge: 1 },
    { ...cmp0, runsThisWeek: 3 }, { ...cmp0, runsThisWeek: 5 }, { ...cmp0, runsThisWeek: 7 },
  ];
  const skies: Array<ShareSky | null> = [null, ...(SKIES as ShareSky[])];
  let id = 1;
  for (const cmp of cmps)
    for (const sky of skies)
      for (const [hour, dayOffset] of [[5, 0], [7, 3], [12, 1], [21, 2]])
        for (const km of [true, false]) {
          const start = new Date(BASE + dayOffset * 24 * H);
          start.setHours(hour, 7);
          const f: ShareFacts = {
            runId: id++, startedAt: start.getTime(), distanceM: hour === 12 ? 2400 : 8432, durationS: hour === 21 ? 6100 : 2650,
            climbM: hour === 7 ? 160 : 20, km, metric: km, quiet: hour === 5 ? 'empty' : hour === 12 ? 'crowded' : null,
            weather: sky ? { sky, tempC: hour === 12 ? 28 : sky === 'snow' ? -2 : 9, feelsC: hour === 12 ? 30 : sky === 'snow' ? -6 : 7, windKmh: hour === 7 ? 34 : 8, isDay: hour > 6 && hour < 20, sunrise: start.getTime() - (hour - 6.5) * H, sunset: start.getTime() + (18 - hour) * H } : null,
            cmp,
          };
          for (const p of candidates(f)) for (const l of p.lines) share.add(`${p.tone}: ${l}`);
        }
  out.share = [...share].sort();

  // The finish-screen you-vs-you line.
  const you: string[] = [];
  for (const cmp of cmps)
    for (const km of [true, false]) {
      const y = youVsYou(cmp, km);
      you.push(y ? `${y.title} | ${y.detail}` : 'none');
    }
  out.you = you;

  // Notification lines and tips are plain lists.
  const r = voice().reminders;
  out.lines = {
    moods: r.moods, rhythm: r.rhythm, window: r.window, last: r.last, reflectTitles: r.reflectTitles,
    reflectLines: r.reflectLines, afterRunTitles: r.afterRunTitles, afterRunLines: r.afterRunLines, titles: r.titles,
    plain: r.plain,
  };
  out.tips = { topics: TOPICS.map((t) => ({ key: t.key, title: voice().tips.topics[t.key] })), tips: localTips() };
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const l = (process.argv[2] ?? 'en') as Lang;
  console.log(JSON.stringify(withLang(l, snapshot), null, 1));
}
