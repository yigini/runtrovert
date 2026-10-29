import type { Sky } from './forecast';
import type { Run } from './types';

// The rare lines. A handful of moments the app notices and says one dry thing
// about, on the finish screen or under the home headline. Never a notification,
// never a badge, never twice for the once-only ones. Pure, so it runs under Node.

export interface Finished {
  startedAt: number;
  distanceM: number;
  durationS: number;
}

export interface Surprise {
  /** Stable id; once-only ones are remembered under it. */
  id: string;
  line: string;
  once: boolean;
}

const KM = 1000;
const MILE = 1609.344;

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function sameDayOfYear(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Winter is one season across the year boundary: Oct 2026 to Mar 2027 share "2026". */
function winterOf(d: Date): number {
  return d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * The one line for this run, if any. `history` is every run before this one,
 * newest first; `seen` the ids already used. Milestones first, then the
 * repeatable ones, so a first 10 km in the rain is about the ten.
 */
export function finishSurprise(run: Finished, history: Run[], sky: Sky | null, seen: string[], metric = true, now = Date.now()): Surprise | null {
  const count = history.length + 1;
  const km = run.distanceM / KM;
  const longestBefore = history.reduce((m, r) => Math.max(m, r.distanceM), 0);
  const start = new Date(run.startedAt);
  const fresh = (id: string) => !seen.includes(id);

  const once: Array<[string, boolean, string]> = [
    ['first-run', count === 1, 'That’s one.\nNobody saw. Perfect.'],
    ['marathon', km >= 42.1 && longestBefore < 42.1 * KM, 'A marathon.\nAlone, on purpose.'],
    ['half', km >= 21.05 && longestBefore < 21.05 * KM, 'Half a marathon.\nWhole person.'],
    ['ten', km >= 10 && longestBefore < 10 * KM, 'Ten.\nThe number agrees with you.'],
    ['run-100', count === 100, 'A hundred runs.\nStill nobody clapping. Still good.'],
    ['run-50', count === 50, 'Fifty runs.\nThe quiet kind of habit.'],
    [
      `anniversary-${start.getFullYear()}`,
      history.length > 0 && sameDayOfYear(new Date(history[history.length - 1].startedAt), start) && start.getFullYear() > new Date(history[history.length - 1].startedAt).getFullYear(),
      'A year ago you went out alone.\nYou kept doing it.',
    ],
    [`first-snow-${winterOf(start)}`, sky === 'snow', 'First snow of the year.\nYou were out in it.'],
  ];
  for (const [id, hit, line] of once) if (hit && fresh(id)) return { id, line, once: true };

  if (history.length >= 5 && run.distanceM > longestBefore + 500) return { id: 'longest', line: 'Longest yet.\nTell no one.', once: false };

  const unit = metric ? KM : MILE;
  const whole = Math.round(run.distanceM / unit);
  if (whole >= 3 && Math.abs(run.distanceM - whole * unit) <= 20) {
    return { id: 'round', line: `${whole}.00 ${metric ? 'km' : 'mi'}.\nSuspiciously neat.`, once: false };
  }

  if (hash(String(run.startedAt)) % 40 === 0) return { id: 'rare', line: 'You passed nobody\nyou had to talk to.', once: false };

  if (sky === 'rain' || sky === 'drizzle') return { id: 'rain', line: 'Wet. Done.\nSmugness permitted.', once: false };
  if (sky === 'snow') return { id: 'snow', line: 'Snow run.\nFootprints are the only proof.', once: false };

  const h = start.getHours();
  if (h < 6) return { id: 'early', line: 'Up before the opinions.', once: false };
  if (h >= 22) return { id: 'late', line: 'Night run.\nThe streets kept it to themselves.', once: false };

  return null;
}

/** A line for the day, under the home headline, on the few dates that deserve one. */
export function seasonalLine(now = Date.now()): string | null {
  const d = new Date(now);
  const key = `${d.getMonth() + 1}-${d.getDate()}`;
  const lines: Record<string, string> = {
    '1-1': 'New year. Same road. Good.',
    '2-14': 'Valentine’s. The route stays loyal.',
    '2-29': 'A day that mostly doesn’t exist. Use it.',
    '6-21': 'Longest day. No need to rush it.',
    '10-31': 'Everyone’s in costume. You’re in shorts.',
    '12-21': 'Shortest day. A short run counts.',
    '12-25': 'Quiet streets today. Finally.',
    '12-31': 'Last run of the year, or first of the next. Both fine.',
  };
  return lines[key] ?? null;
}
