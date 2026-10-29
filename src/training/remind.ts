// While a plan is active it takes over the quiet reminders: plan days get the
// day's session as the note, at the hour the runner already chose, and rest
// days stay silent (a nudge on a rest day would argue with the plan). Nothing
// extra on top, and with reminders off there is nothing at all. Paused plans
// hand the days back to the ordinary reminders. Ten days without a run and
// the plan goes quiet too, until the next run (Run home says welcome back).

import * as Notifications from 'expo-notifications';
import { listRuns } from '../db';
import { ensureChannel } from '../notify';
import { AWAY_QUIET_DAYS, awayDays } from '../reminderPlan';
import type { Settings } from '../types';
import { DAY_MS, dayStart } from './dates';
import { loadPlan, runSessions } from './store';

const CHANNEL = 'runtrovert-quiet';
const HORIZON_DAYS = 14;
const MAX_PLAN_PENDING = 10;

const TITLES = ['Today, if you like', 'On the plan today', 'A run is pencilled in', 'Whenever suits'];

/** Call after the ordinary reminders are laid out, since that lays them out from scratch. */
export async function schedulePlanReminders(settings: Settings): Promise<void> {
  if (settings.notifyPerWeek === 0) return;
  const plan = await loadPlan();
  if (!plan || plan.status !== 'active') return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await ensureChannel();

  const now = Date.now();
  const today = dayStart(now);
  const runs = await listRuns().catch(() => []);
  const lastRun = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
  const upcoming = runSessions(plan)
    .filter((s) => !s.skipped && !s.done && s.kind !== 'rest' && s.date >= today && s.date < today + HORIZON_DAYS * DAY_MS)
    .filter((s) => lastRun == null || awayDays(lastRun, s.date) < AWAY_QUIET_DAYS)
    .slice(0, MAX_PLAN_PENDING);
  if (!upcoming.length) return;
  const until = upcoming[upcoming.length - 1].date + DAY_MS;

  // One voice: the ordinary lines step aside on every day the plan covers, rest days included.
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (n.content.data?.kind !== 'reminder') continue;
    const day = triggerDay(n.trigger);
    if (day != null && day < until) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }

  for (const [i, s] of upcoming.entries()) {
    const date = new Date(s.date);
    date.setHours(settings.notifyHour, settings.notifyMinute, 0, 0);
    if (date.getTime() <= now + 60_000) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: s.kind === 'race' ? 'Race day' : TITLES[i % TITLES.length], body: `${s.title}. ${s.summary}`, sound: false, data: { kind: 'plan', sessionId: s.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
  }
}

/** The local day a scheduled notification fires on, from either platform's trigger shape. */
function triggerDay(trigger: unknown): number | null {
  const t = trigger as { type?: string; value?: number; dateComponents?: { year?: number; month?: number; day?: number } } | null;
  if (!t) return null;
  if (typeof t.value === 'number') return dayStart(t.value);
  const c = t.dateComponents;
  if (c && c.year != null && c.month != null && c.day != null) return dayStart(new Date(c.year, c.month - 1, c.day).getTime());
  return null;
}
