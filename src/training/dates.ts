import { dateLocale, lang, upperFirst } from '../i18n/lang';
import { live } from '../i18n/ui';

// Local calendar days as epoch ms at midnight. Plans think in days and weeks
// (Monday to Sunday), never in hours, so DST never shifts a session.

export const DAY_MS = 86400000;

export function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days from a to b, ignoring clock changes. */
export function daysBetween(a: number, b: number): number {
  return Math.round((dayStart(b) - dayStart(a)) / DAY_MS);
}

/** 0 = Sunday, as Date.getDay(). */
export function weekdayOf(day: number): number {
  return new Date(day).getDay();
}

/** The Monday on or before this day. */
export function mondayOf(day: number): number {
  const wd = weekdayOf(day);
  return addDays(dayStart(day), wd === 0 ? -6 : 1 - wd);
}

/** Days after Monday for a weekday: Monday 0 … Sunday 6. */
export function offsetInWeek(weekday: number): number {
  return (weekday + 6) % 7;
}

// Sunday first. English is spelled out; other languages come from the phone's calendar data.
export const WEEKDAY_SHORT: string[] = live(() => (lang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : weekdays('short')));
export const WEEKDAY_LONG: string[] = live(() => (lang() === 'en' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : weekdays('long')));

function weekdays(width: 'short' | 'long'): string[] {
  // 4 January 2026 was a Sunday.
  return [0, 1, 2, 3, 4, 5, 6].map((i) => upperFirst(new Date(2026, 0, 4 + i, 12).toLocaleDateString(dateLocale(), { weekday: width })));
}

export function formatDay(day: number): string {
  return new Date(day).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
