// The line on a share card. First person, because the runner is the one
// sending it. Dry, a little pleased with itself, never loud. Every line only
// claims what the phone actually knows about the run: the weather from the
// forecast it already had, the time, your own ratings, distance, climb, and
// how it compares with your earlier runs. No invented herons. No place names.
// Pure, so `npm run test:progress` can check it under plain Node.

import type { Comparison } from './progress';
import { finish } from './i18n/lang';
import { voice } from './i18n/voice';
import type { RunWords } from './i18n/voice/types';

export type ShareSky = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** The weather at the time of a run, kept with the run. */
export interface RunWeather {
  sky: ShareSky;
  tempC: number;
  feelsC: number;
  windKmh: number;
  isDay: boolean;
  sunrise: number | null;
  sunset: number | null;
}

export interface ShareFacts {
  runId: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  climbM: number;
  km: boolean;
  metric: boolean; // temperatures
  quiet: 'crowded' | 'some' | 'empty' | null;
  weather: RunWeather | null;
  cmp: Comparison;
}

/** The card's colour follows what the line is about. */
export type Tone = 'mint' | 'butter' | 'sky' | 'peach' | 'lilac';

interface Pick {
  tone: Tone;
  lines: string[];
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function temp(c: number, metric: boolean): string {
  return `${Math.round(metric ? c : c * 1.8 + 32)}°`;
}

function clock(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Every fact that applies, strongest first, each with its own small bank of lines. */
export function candidates(f: ShareFacts): Pick[] {
  const out: Pick[] = [];
  const c = f.cmp;
  const v = voice();
  const say = v.share;
  const w = f.weather;
  const words: RunWords = {
    d: v.distance(f.distanceM, f.km),
    dur: v.minutes(f.durationS),
    t: w ? temp(w.tempC, f.metric) : '',
    ft: w ? temp(w.feelsC, f.metric) : '',
    at: v.clockWords(f.startedAt),
    km: f.km,
  };
  const add = (tone: Tone, lines: string[]) => out.push({ tone, lines: lines.map(finish) });
  const hour = new Date(f.startedAt).getHours();
  const dow = new Date(f.startedAt).getDay();
  const weekend = dow === 0 || dow === 6;

  if (c.best) {
    const b = c.best;
    if (b.marginS == null) add('mint', say.bestFirst(b.key, clock(b.seconds), words));
    else add('mint', say.best(b.key, clock(b.seconds), v.margin(b.marginS), words));
  }

  if (c.firstRun) add('lilac', say.firstRun(words));

  if (c.gapDays != null && c.gapDays >= 14) add('lilac', say.gap(c.gapDays, words));

  if (c.recentBest) add('mint', say.recentBest(c.recentBest.key, clock(c.recentBest.seconds), words));

  if (c.longest) add('mint', c.longest === 'ever' ? say.longestEver(words) : say.longestWhile(words));

  if (c.recharge != null && c.recharge >= 2) add('butter', say.recharge(c.recharge, words));

  if (c.slowestThisMonth && c.recharge != null && c.recharge >= 1) add('butter', say.slowHappy(words));

  if (w) {
    if (w.sky === 'storm') add('sky', say.storm(words));
    else if (w.sky === 'snow') add('sky', say.snow(words));
    else if (w.sky === 'rain') add('sky', say.rain(words, f.quiet === 'empty'));
    else if (w.sky === 'drizzle') add('sky', say.drizzle(words));
    else if (w.sky === 'fog') add('sky', say.fog(words));
    if (w.feelsC <= 0) add('sky', say.cold(words));
    else if (w.tempC >= 27) add('peach', say.hot(words));
    if (w.windKmh >= 30) add('sky', say.wind(words));
  }

  const beforeSunrise = w?.sunrise != null ? f.startedAt < w.sunrise : hour < 6;
  const afterDark = w ? !w.isDay && !beforeSunrise : hour >= 20;
  if (beforeSunrise) add('lilac', say.beforeSunrise(words));
  else if (afterDark) add('lilac', say.afterDark(words));

  if (f.quiet === 'crowded') add('peach', say.crowded(words));
  else if (f.quiet === 'empty' && !(w && (w.sky === 'rain'))) add('lilac', say.empty(words));

  const kmCount = f.distanceM / 1000;
  if (kmCount >= 1 && f.climbM / kmCount >= 15) add('peach', say.climb(Math.round(f.climbM), words));

  if (c.baselineDeltaS != null && c.baselineDeltaS <= -5) {
    add('mint', say.quicker(Math.round(-c.baselineDeltaS * (f.km ? 1 : 1.609344)), words));
  }

  if (c.runsThisWeek >= 3 && c.runsThisWeek <= 7) add('lilac', say.week(c.runsThisWeek, words));

  if (weekend && hour < 9) add('lilac', say.weekendEarly(dow === 0, words));
  else if (!weekend && hour >= 11 && hour < 14) add('lilac', say.lunch(words));

  if (f.distanceM < 3000) add('lilac', say.short(words));

  if (w && w.sky === 'cloud') add('lilac', say.grey(words));
  if (w && w.sky === 'clear' && w.isDay && w.tempC < 27 && w.feelsC > 0) add('sky', say.clear(words));

  add('lilac', say.always(words));
  return out;
}

/**
 * The line for this run. `turn` is how many times "Another line" was tapped:
 * 0 is the strongest fact with a line picked by the run itself (so a run keeps
 * its line), and each tap walks on through the other facts and lines.
 */
export function pickLine(f: ShareFacts, turn = 0): { line: string; tone: Tone } {
  const picks = candidates(f);
  const seed = seedOf(`run${f.runId}:${f.startedAt}`);
  // Interleave: first line of each fact in order, then the second of each, ...
  const flat: Array<{ line: string; tone: Tone }> = [];
  const depth = Math.max(...picks.map((p) => p.lines.length));
  for (let k = 0; k < depth; k++) {
    for (const p of picks) {
      if (k < p.lines.length) flat.push({ line: p.lines[(k + seed) % p.lines.length], tone: p.tone });
    }
  }
  const seen = new Set<string>();
  const unique = flat.filter((x) => (seen.has(x.line) ? false : (seen.add(x.line), true)));
  return unique[turn % unique.length];
}

/** How many different lines a run can offer before they come round again. */
export function lineCount(f: ShareFacts): number {
  return new Set(candidates(f).flatMap((p) => p.lines)).size;
}
