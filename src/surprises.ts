import type { Sky } from './forecast';
import type { Run } from './types';
import { finish } from './i18n/lang';
import { voice } from './i18n/voice';
import type { SurpriseId } from './i18n/voice/types';

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

  const v = voice().surprises;
  const say = (id: SurpriseId) => finish(v.lines[id]);
  const once: Array<[string, boolean, string]> = [
    ['first-run', count === 1, say('first-run')],
    ['marathon', km >= 42.1 && longestBefore < 42.1 * KM, say('marathon')],
    ['half', km >= 21.05 && longestBefore < 21.05 * KM, say('half')],
    ['ten', km >= 10 && longestBefore < 10 * KM, say('ten')],
    ['run-100', count === 100, say('run-100')],
    ['run-50', count === 50, say('run-50')],
    [
      `anniversary-${start.getFullYear()}`,
      history.length > 0 && sameDayOfYear(new Date(history[history.length - 1].startedAt), start) && start.getFullYear() > new Date(history[history.length - 1].startedAt).getFullYear(),
      say('anniversary'),
    ],
    [`first-snow-${winterOf(start)}`, sky === 'snow', say('first-snow')],
  ];
  for (const [id, hit, line] of once) if (hit && fresh(id)) return { id, line, once: true };

  if (history.length >= 5 && run.distanceM > longestBefore + 500) return { id: 'longest', line: say('longest'), once: false };

  const unit = metric ? KM : MILE;
  const whole = Math.round(run.distanceM / unit);
  if (whole >= 3 && Math.abs(run.distanceM - whole * unit) <= 20) {
    return { id: 'round', line: finish(v.round(whole, metric)), once: false };
  }

  if (hash(String(run.startedAt)) % 40 === 0) return { id: 'rare', line: say('rare'), once: false };

  if (sky === 'rain' || sky === 'drizzle') return { id: 'rain', line: say('rain'), once: false };
  if (sky === 'snow') return { id: 'snow', line: say('snow'), once: false };

  const h = start.getHours();
  if (h < 6) return { id: 'early', line: say('early'), once: false };
  if (h >= 22) return { id: 'late', line: say('late'), once: false };

  return null;
}

/** A line for the day, under the home headline, on the few dates that deserve one. */
export function seasonalLine(now = Date.now()): string | null {
  const d = new Date(now);
  const key = `${d.getMonth() + 1}-${d.getDate()}`;
  const line = voice().surprises.seasonal[key];
  return line ? finish(line) : null;
}
