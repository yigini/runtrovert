// Small formatting helpers the voice packs share. No imports from the app's
// modules, so packs can be loaded by them without a cycle.

/** 1:05:09 or 5:09. */
export function clockDigits(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** 07:05, the 24-hour clock most of the world reads. */
export function hhmm(ms: number, sep = ':'): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}${sep}${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Distance as a number: one decimal under 10, and above it the decimal only when it isn't .0. */
export function distNumber(m: number, km: boolean): string {
  const v = km ? m / 1000 : m / 1609.344;
  return v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1);
}

/** Pick by a number from a short list of words, falling back to the digits. */
export function word(list: string[], n: number): string {
  return list[n] ?? String(n);
}
