// Words for screen readers. The screen says "4.21" and "26:05"; TalkBack and
// VoiceOver should say "4.21 kilometres" and "26 minutes 5 seconds", not a
// clock time or a bare number.

const MILE_M = 1609.344;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4.21 kilometres", "0.80 miles". */
export function spokenDistance(m: number, km = true): string {
  const v = km ? m / 1000 : m / MILE_M;
  return `${v.toFixed(2)} ${km ? 'kilometres' : 'miles'}`;
}

/** "1 hour 2 minutes 5 seconds", "26 minutes 5 seconds", "40 seconds". */
export function spokenDuration(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const parts: string[] = [];
  if (h) parts.push(plural(h, 'hour', 'hours'));
  if (m) parts.push(plural(m, 'minute', 'minutes'));
  if (sec || !parts.length) parts.push(plural(sec, 'second', 'seconds'));
  return parts.join(' ');
}

/** "5 minutes 32 seconds per kilometre", or "no pace yet". Same cut-offs as formatPace. */
export function spokenPace(distanceM: number, durationS: number, km = true): string {
  if (distanceM < 50 || durationS < 10) return 'no pace yet';
  const secPerUnit = durationS / (distanceM / (km ? 1000 : MILE_M));
  if (!isFinite(secPerUnit) || secPerUnit > 60 * 60) return 'no pace yet';
  return `${spokenDuration(Math.round(secPerUnit))} per ${km ? 'kilometre' : 'mile'}`;
}

/** The live run in one sentence, for the numbers block on the run screen. */
export function spokenRun(t: { distanceM: number; durationS: number }, km = true): string {
  return `${spokenDistance(t.distanceM, km)}, ${spokenDuration(t.durationS)}, average ${spokenPace(t.distanceM, t.durationS, km)}`;
}

/**
 * The largest a piece of text may grow with the phone's font size. Body text
 * grows freely; the big display numbers and headlines are already large and
 * would push Start or Stop off the screen at 200%.
 */
export const DISPLAY_MAX_SCALE = 1.3;
