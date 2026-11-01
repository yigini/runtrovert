/**
 * Date options with the year added when the date isn't in this year, so a
 * run brought in from 2015 reads "11 Aug 2015", not "11 Aug".
 */
export function withYear(ts: number | Date, opts: Intl.DateTimeFormatOptions, now: Date = new Date()): Intl.DateTimeFormatOptions {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.getFullYear() === now.getFullYear() ? opts : { ...opts, year: 'numeric' };
}
