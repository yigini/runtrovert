// The plan's notes beyond the one on each session day: a word the evening
// before a long, hard or race day, a look at the week ahead on Sunday, and the
// start of race week. Pure: remind.ts hands them to the one scheduler, which
// keeps the day's cap, the three hours between notes and the quiet night.
// Only at "every day" cadences or more, except the night before a race.

import type { ExtraNote } from '../reminderPlan';
import type { NoteContent } from '../notify';
import { dayName } from './adapt';
import { addDays, dayStart, weekdayOf } from './dates';
import type { Plan, Session } from './types';
import { ui } from '../i18n/ui';

export const EVENING_HOUR = 19.5; // 19:30, well before the quiet night at 21:00
export const PREVIEW_HOUR = 18;
const HORIZON_DAYS = 14;
const KM_IN_MI = 1.609344;

/** Higher wins a crowded day. The session-day note itself is 10. */
export const PRIORITY = { raceEve: 20, raceWeek: 9, eve: 8, preview: 6 } as const;

export interface PlanNoteInput {
  plan: Plan;
  now: number;
  perWeek: number;
  unitsKm: boolean;
  timeBased: boolean;
  open: (s: Session) => boolean; // may be reminded about (unlock, not away for long)
}

export function planExtras(x: PlanNoteInput): ExtraNote<NoteContent>[] {
  const { plan, now, perWeek } = x;
  if (perWeek <= 0 || plan.status !== 'active') return [];
  const daily = perWeek >= 7;
  const today = dayStart(now);
  const end = addDays(today, HORIZON_DAYS);
  const notes: ExtraNote<NoteContent>[] = [];
  const at = (day: number, hour: number) => {
    const d = new Date(day);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d.getTime();
  };
  const push = (t: number, priority: number, title: string, body: string, data: Record<string, unknown>) => {
    if (t > now + 60_000) notes.push({ at: t, priority, payload: { title, body, data } });
  };
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength' && s.kind !== 'rest' && !s.done && !s.skipped && x.open(s));

  // The evening before.
  for (const s of sessions) {
    if (s.date <= today || s.date > end) continue;
    const eve = at(addDays(s.date, -1), EVENING_HOUR);
    if (s.kind === 'race') push(eve, PRIORITY.raceEve, ui().planNotes.raceEveTitle, ui().planNotes.raceEve, { kind: 'plan', sessionId: s.id });
    else if (daily && s.kind === 'long') push(eve, PRIORITY.eve, ui().planNotes.eveTitle, ui().planNotes.eveLong(s.title), { kind: 'plan', sessionId: s.id });
    else if (daily && s.hard) push(eve, PRIORITY.eve, ui().planNotes.eveTitle, ui().planNotes.eveHard(s.title), { kind: 'plan', sessionId: s.id });
  }

  // Sunday: the week ahead, or the start of race week.
  if (daily) {
    for (const w of plan.weeks) {
      const sunday = addDays(w.start, -1);
      if (sunday < today || sunday > end || weekdayOf(sunday) !== 0) continue;
      const runs = w.sessions.filter((s) => s.kind !== 'strength' && s.kind !== 'rest' && !s.skipped && x.open(s));
      if (!runs.length) continue;
      if (w.kind === 'race') {
        push(at(sunday, PREVIEW_HOUR), PRIORITY.raceWeek, ui().planNotes.raceWeekTitle, ui().planNotes.raceWeek, { kind: 'plan' });
        continue;
      }
      const long = runs.find((s) => s.kind === 'long');
      const hard = runs.filter((s) => s.hard).map((s) => dayName(s.date));
      const total = x.timeBased ? ui().common.min(Math.round(runs.reduce((a, s) => a + s.minutes, 0))) : km(runs.reduce((a, s) => a + s.km, 0), x.unitsKm);
      const bits = [
        w.kind === 'light' ? ui().planNotes.lighter : null,
        long ? ui().planNotes.longOn(dayName(long.date)) : null,
        hard.length ? ui().planNotes.hardOn(hard.join(', ')) : null,
      ].filter(Boolean);
      push(at(sunday, PREVIEW_HOUR), PRIORITY.preview, ui().planNotes.previewTitle, `${ui().planNotes.preview(runs.length, total)}${bits.length ? ' ' + bits.join(' ') : ''}`, { kind: 'plan' });
    }
  }
  return notes.sort((a, b) => a.at - b.at);
}

function km(n: number, unitsKm: boolean): string {
  return unitsKm ? `${Math.round(n)} km` : `${Math.round(n / KM_IN_MI)} mi`;
}
