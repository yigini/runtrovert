// While a plan is active it takes over the quiet reminders: plan days get the
// day's session as the note, at the hour the runner already chose, and rest
// days stay silent (a nudge on a rest day would argue with the plan). Nothing
// extra on top, and with reminders off there is nothing at all. Paused plans
// hand the days back to the ordinary reminders. Ten days without a run and
// the plan goes quiet too, until the next run (Run home says welcome back).

import { listRuns } from '../db';
import type { NoteContent, NoteSource } from '../notify';
import { AWAY_QUIET_DAYS, awayDays, type ExtraNote } from '../reminderPlan';
import { addDays, DAY_MS, dayStart } from './dates';
import { planSessionOpen } from '../unlock';
import { loadPlan, runSessions } from './store';
import { live, ui } from '../i18n/ui';

const HORIZON_DAYS = 14;
const MAX_PLAN_PENDING = 10;

const TITLES: string[] = live(() => ui().remind.titles);

/** Plan notes for the one scheduler in notify.ts, which fits them in with everything else. */
export const planNotes: NoteSource = async (settings, now) => {
  const none = { notes: [] };
  if (settings.notifyPerWeek === 0) return none;
  const plan = await loadPlan();
  if (!plan || plan.status !== 'active') return none;

  const today = dayStart(now);
  const runs = await listRuns().catch(() => []);
  const lastRun = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
  const upcoming = runSessions(plan)
    .filter((s) => !s.skipped && !s.done && s.kind !== 'rest' && s.date >= today && s.date < today + HORIZON_DAYS * DAY_MS)
    .filter((s) => lastRun == null || awayDays(lastRun, s.date) < AWAY_QUIET_DAYS)
    // Weeks the plan can't guide yet get the ordinary reminders, which never mention the unlock.
    .filter((s) => planSessionOpen(plan, s.id))
    .slice(0, MAX_PLAN_PENDING);
  if (!upcoming.length) return none;

  // One voice: the ordinary lines step aside on every day the plan covers, rest days included.
  const ownedDays: number[] = [];
  for (let d = today; d <= upcoming[upcoming.length - 1].date; d = addDays(d, 1)) ownedDays.push(d);

  const notes: ExtraNote<NoteContent>[] = [];
  for (const [i, s] of upcoming.entries()) {
    const date = new Date(s.date);
    date.setHours(settings.notifyHour, settings.notifyMinute, 0, 0);
    if (date.getTime() <= now + 60_000) continue;
    notes.push({
      at: date.getTime(),
      priority: 10,
      payload: { title: s.kind === 'race' ? ui().remind.raceDay : TITLES[i % TITLES.length], body: `${s.title}. ${s.summary}`, data: { kind: 'plan', sessionId: s.id } },
    });
  }
  return { notes, ownedDays };
};
