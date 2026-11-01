// Runs entered or corrected by hand: reading what was typed, and the checks
// that keep a typo from becoming a world record. Pure, so `npm run test:runedit`
// runs it in Node.

const MILE_M = 1609.344;

/** "5", "5.2", "5,2", "10 km": metres, or null when it isn't a distance. */
export function parseDistance(text: string, km: boolean): number | null {
  const t = text.trim().toLowerCase().replace(/\s*(km|mi|k)$/, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{0,3})?$|^\.\d{1,3}$/.test(t)) return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * (km ? 1000 : MILE_M));
}

/** "45" (minutes), "28:30", "1:02:03", "1h05", "1 h 5": seconds, or null. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m = /^(\d{1,3})$/.exec(t);
  if (m) return Number(m[1]) * 60;
  m = /^(\d{1,3})[:.](\d{2})$/.exec(t);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,2})[:.](\d{2})[:.](\d{2})$/.exec(t);
  if (m && Number(m[2]) < 60 && Number(m[3]) < 60) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /^(\d{1,2})h(\d{1,2})?(?:m(?:in)?)?$/.exec(t);
  if (m && Number(m[2] ?? 0) < 60) return Number(m[1]) * 3600 + Number(m[2] ?? 0) * 60;
  return null;
}

/** The value a field starts with: "5.12" and "28:30". Dots, so parse reads it back exactly. */
export function distanceField(m: number, km: boolean): string {
  return (m / (km ? 1000 : MILE_M)).toFixed(2);
}

export function durationField(s: number): string {
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.round(s % 60)).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

export type EntryProblem = 'distance' | 'duration' | 'tooFast' | 'tooSlow' | 'future' | 'overlap';

export const LIMITS = {
  minM: 100,
  maxM: 250_000,
  minS: 60,
  maxS: 24 * 3600,
  /** Faster than 2:00 per km is a typo, not a run. */
  fastestSPerKm: 120,
  /** Slower than 40:00 per km is a walk with long stops, or a typo. */
  slowestSPerKm: 2400,
};

/** What's wrong with a run as typed, or null when it can be kept. */
export function checkEntry(
  e: { startedAt: number; distanceM: number | null; durationS: number | null },
  now: number,
  others: Array<{ startedAt: number; endedAt: number | null; durationS?: number }> = [],
): EntryProblem | null {
  if (e.distanceM == null || e.distanceM < LIMITS.minM || e.distanceM > LIMITS.maxM) return 'distance';
  if (e.durationS == null || e.durationS < LIMITS.minS || e.durationS > LIMITS.maxS) return 'duration';
  const perKm = e.durationS / (e.distanceM / 1000);
  if (perKm < LIMITS.fastestSPerKm) return 'tooFast';
  if (perKm > LIMITS.slowestSPerKm) return 'tooSlow';
  if (e.startedAt + e.durationS * 1000 > now + 60_000) return 'future';
  const end = e.startedAt + e.durationS * 1000;
  for (const o of others) {
    const oEnd = o.endedAt ?? o.startedAt + (o.durationS ?? 0) * 1000;
    if (e.startedAt < oEnd && o.startedAt < end) return 'overlap';
  }
  return null;
}

/** A correction to a run that has one: only distance and time, checked the same way. Overlap and the clock don't apply. */
export function checkCorrection(distanceM: number | null, durationS: number | null): EntryProblem | null {
  return checkEntry({ startedAt: 0, distanceM, durationS }, Number.MAX_SAFE_INTEGER);
}

/** Local midnight `daysBack` days before `now`, plus minutes after midnight. */
export function entryStart(now: number, daysBack: number, minutes: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime() + minutes * 60_000;
}

/** Now, rounded down to a quarter hour, as minutes after midnight. */
export function defaultMinutes(now: number): number {
  const d = new Date(now);
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
}
