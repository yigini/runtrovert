// The app's voice in one language: every line that is written, not just
// translated. Each language fills this in its own words and may have more or
// fewer lines than English. The logic that decides *which* line fits a run or a
// day lives once, in sky.ts, surprises.ts, shareLines.ts, progress.ts and
// notify.ts; a pack only says how to say it.

import type { Mood } from '../../lines';
import type { TipTopic } from '../../tips';
import type { EffortKey } from '../../progress';

/** Pieces of a run, already formatted for this language. */
export interface RunWords {
  /** Distance, e.g. "8.4 km" / "8,4 km". */
  d: string;
  /** Duration, e.g. "44 minutes". */
  dur: string;
  /** Temperature and feels-like, e.g. "9°". */
  t: string;
  ft: string;
  /** Start time in words, e.g. "7:07 am". */
  at: string;
  /** Kilometres (true) or miles. */
  km: boolean;
}

export interface ShareVoice {
  bestFirst(key: EffortKey, time: string, w: RunWords): string[];
  /** margin is already in words: "42 seconds" or "2:05". */
  best(key: EffortKey, time: string, margin: string, w: RunWords): string[];
  firstRun(w: RunWords): string[];
  gap(days: number, w: RunWords): string[];
  recentBest(key: EffortKey, time: string, w: RunWords): string[];
  longestEver(w: RunWords): string[];
  longestWhile(w: RunWords): string[];
  /** recharge is 2 to 4 faces on the mood scale. */
  recharge(n: number, w: RunWords): string[];
  slowHappy(w: RunWords): string[];
  storm(w: RunWords): string[];
  snow(w: RunWords): string[];
  rain(w: RunWords, empty: boolean): string[];
  drizzle(w: RunWords): string[];
  fog(w: RunWords): string[];
  cold(w: RunWords): string[];
  hot(w: RunWords): string[];
  wind(w: RunWords): string[];
  beforeSunrise(w: RunWords): string[];
  afterDark(w: RunWords): string[];
  crowded(w: RunWords): string[];
  empty(w: RunWords): string[];
  climb(m: number, w: RunWords): string[];
  /** s seconds per km (or per mile) quicker than usual. */
  quicker(s: number, w: RunWords): string[];
  /** The nth run this week, 3 to 7. */
  week(n: number, w: RunWords): string[];
  weekendEarly(sunday: boolean, w: RunWords): string[];
  lunch(w: RunWords): string[];
  short(w: RunWords): string[];
  grey(w: RunWords): string[];
  clear(w: RunWords): string[];
  always(w: RunWords): string[];
}

export type HeadlineSky = 'storm' | 'snow' | 'rain' | 'drizzle' | 'fog' | 'dark' | 'cold' | 'hot' | 'wind' | 'clear' | 'grey';

export interface SkyVoice {
  /** Two-line headlines; \n is where the big type breaks. t is the temperature, e.g. "9°". */
  headline: Record<HeadlineSky, (t: string) => string[]>;
  bestWindow: string;
  noDryHour: string;
  dry: string;
  /** Between the rain and the temperature in "dry, 12°"; Japanese uses 、. Defaults to ", ". */
  sep?: string;
  rainChance(p: number): string;
  /** what is "dry, 12°" or "30% rain, 12°". */
  now(what: string): string;
  from(time: string, what: string): string;
  wear: string;
  /** From coldest to hottest: ≤-5, ≤3, ≤8, ≤13, ≤19, ≤24, hotter. */
  kit: [string, string, string, string, string, string, string];
  shell: string;
  windproof: string;
  reflective: string;
  /** Kit plus one or two extras, ending with a full stop. */
  kitWith(kit: string, extras: string[]): string;
  light: string;
  darkAt(time: string): string;
  daylightUntil(time: string): string;
  lightAgain(time: string): string;
}

export type SurpriseId =
  | 'first-run' | 'marathon' | 'half' | 'ten' | 'run-100' | 'run-50' | 'anniversary' | 'first-snow'
  | 'longest' | 'rare' | 'rain' | 'snow' | 'early' | 'late';

export interface SurpriseVoice {
  lines: Record<SurpriseId, string>;
  /** A distance that came out exactly round: n whole km or miles. */
  round(n: number, km: boolean): string;
  /** By "month-day", e.g. "12-25". */
  seasonal: Record<string, string>;
}

/** The finish screen's one you-vs-you line. */
export interface YouVoice {
  bestFirst(key: EffortKey, time: string): { title: string; detail: string };
  /** marginS is how many seconds quicker; month is the previous best's month in words, or null. */
  best(key: EffortKey, time: string, marginS: number, month: string | null): { title: string; detail: string };
  welcomeBack(days: number): { title: string; detail: string };
  recentBest(key: EffortKey, time: string): { title: string; detail: string };
  longestEver: { title: string; detail: string };
  longestMonths: { title: string; detail: string };
  recharge(n: number): { title: string; detail: string };
  /** s seconds quicker per km (or mile). */
  quicker(s: number, km: boolean): { title: string; detail: string };
  slowerGood: { title: string; detail: string };
}

export interface ReminderVoice {
  moods: Record<Mood, string[]>;
  /** {day} is the weekday. */
  rhythm: string[];
  /** {time} is the first dry hour. */
  window: string[];
  last: string[];
  reflectTitles: string[];
  reflectLines: string[];
  afterRunTitles: string[];
  afterRunLines: string[];
  titles: string[];
  /** Weekdays around 17:30, as the working day winds down. */
  afternoon: string[];
  /** Weekend notes. */
  weekend: string[];
  /** "Fewer words": the plain fact for each kind of note, no joke. */
  plain: PlainReminders;
}

export interface PlainReminders {
  nudge: string[];
  morning: string;
  evening: string;
  quiet: string;
  gap: string;
  weather: string;
  /** {day} is the weekday. */
  rhythm: string;
  /** {time} is the first dry hour. */
  window: string;
  afternoon: string;
  weekend: string;
  last: string;
  afterRunTitle: string;
  afterRun: string;
  reflectTitle: string;
  reflect: string;
}

export interface TipVoice {
  topics: Record<TipTopic, string>;
  /** By tip id. A tip a language leaves out is simply not shown in it. */
  text: Record<string, string>;
}

export interface VoicePack {
  /** Formatting for run words. */
  distance(m: number, km: boolean): string;
  minutes(s: number): string;
  /** Under a minute: "42 seconds"; otherwise a clock, "2:05". */
  margin(s: number): string;
  /** A time of day in words, e.g. "7:07 am" or "7.07 Uhr". */
  clockWords(ms: number): string;
  /** The effort names: "5 km", "half marathon". */
  effort: Record<EffortKey, string>;
  share: ShareVoice;
  sky: SkyVoice;
  surprises: SurpriseVoice;
  you: YouVoice;
  reminders: ReminderVoice;
  tips: TipVoice;
}
