// Home and work on the phone, which runs were commutes, and the one
// evening-before note. Home and work are kept under their own key, apart from
// Settings, so nothing that reads settings for any other reason carries them.
// Nothing here is ever sent anywhere.

import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { getDb, getPoints, listRuns, loadSettings, loadValue, saveValue } from './db';
import { commuteOf, NO_COMMUTE, nextNoteAt, offerFor, ready, type Commute, type CommuteDir, type Offer, type PastRun } from './commute';
import { ensureChannel, rescheduleReminders } from './notify';
import { useLastPlace } from './place';
import { AWAY_QUIET_DAYS, awayDays } from './reminderPlan';
import { DAY_MS, dayStart } from './training/dates';
import { schedulePlanReminders } from './training/remind';
import { loadPlan, runSessions } from './training/store';
import type { LatLon, Run, Settings } from './types';
import { ui } from './i18n/ui';

const KEY = 'commute';
const CHANNEL = 'runtrovert-quiet';

let current: Commute | null = null;
const listeners = new Set<(c: Commute) => void>();

export async function loadCommute(): Promise<Commute> {
  if (current) return current;
  const saved = await loadValue<Commute>(KEY).catch(() => null);
  current = { ...NO_COMMUTE, ...(saved ?? {}) };
  return current;
}

export async function saveCommute(patch: Partial<Commute>): Promise<Commute> {
  const next = { ...(await loadCommute()), ...patch };
  current = next;
  await saveValue(KEY, next);
  listeners.forEach((l) => l(next));
  // The note may take an ordinary line's day, or give one back: lay all three out again.
  loadSettings()
    .then(async (s) => {
      if (!s.onboarded) return;
      await rescheduleReminders(s);
      await schedulePlanReminders(s);
      await scheduleCommuteNote(s);
    })
    .catch(() => {});
  return next;
}

/** Home and work for a screen, kept in step with Settings. */
export function useCommute(): Commute | null {
  const [c, setC] = useState<Commute | null>(current);
  useEffect(() => {
    let alive = true;
    loadCommute().then((v) => alive && setC(v));
    listeners.add(setC);
    return () => {
      alive = false;
      listeners.delete(setC);
    };
  }, []);
  return c;
}

/** First and last fix of every recorded run, by the (run_id, ts) index: two lookups a run, not a scan. */
async function runEnds(): Promise<Map<number, { start: LatLon; end: LatLon }>> {
  const db = await getDb();
  const rows = (await db.getAllAsync(
    `SELECT r.id AS id,
       (SELECT lat FROM points WHERE run_id = r.id ORDER BY ts ASC LIMIT 1) AS a_lat,
       (SELECT lon FROM points WHERE run_id = r.id ORDER BY ts ASC LIMIT 1) AS a_lon,
       (SELECT lat FROM points WHERE run_id = r.id ORDER BY ts DESC LIMIT 1) AS b_lat,
       (SELECT lon FROM points WHERE run_id = r.id ORDER BY ts DESC LIMIT 1) AS b_lon
     FROM runs r WHERE r.ended_at IS NOT NULL`,
  )) as Array<{ id: number; a_lat: number | null; a_lon: number | null; b_lat: number | null; b_lon: number | null }>;
  const out = new Map<number, { start: LatLon; end: LatLon }>();
  for (const r of rows) {
    if (r.a_lat == null || r.a_lon == null || r.b_lat == null || r.b_lon == null) continue;
    out.set(r.id, { start: { latitude: r.a_lat, longitude: r.a_lon }, end: { latitude: r.b_lat, longitude: r.b_lon } });
  }
  return out;
}

/** Which runs went to work or home. Empty until both are set. */
export async function commuteTags(c?: Commute): Promise<Map<number, CommuteDir>> {
  const commute = c ?? (await loadCommute());
  const out = new Map<number, CommuteDir>();
  if (!ready(commute)) return out;
  for (const [id, e] of await runEnds()) {
    const dir = commuteOf(e.start, e.end, commute);
    if (dir) out.set(id, dir);
  }
  return out;
}

/** The runs as the offer reads them: when, how far, how long, and which way if a commute. */
export async function pastRuns(runs: Run[], c: Commute): Promise<PastRun[]> {
  const tags = await commuteTags(c);
  return runs.map((r) => ({ startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, dir: tags.get(r.id) ?? null }));
}

/** The last run that way, thinned, to draw faintly under the live line. */
export async function lastCommuteRoute(dir: CommuteDir, c: Commute): Promise<LatLon[] | null> {
  const tags = await commuteTags(c);
  const runs = await listRuns();
  const last = runs.find((r) => tags.get(r.id) === dir);
  if (!last) return null;
  const pts = await getPoints(last.id);
  const step = Math.max(1, Math.floor(pts.length / 400));
  const path = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({ latitude: p.lat, longitude: p.lon }));
  return path.length > 1 ? path : null;
}

/**
 * The evening-before note, laid out after the ordinary reminders and the
 * plan's (App.tsx re-plans all three together). It keeps the reminder deal:
 * nothing when reminders are off or after ten days away, never a second note
 * that day (it takes the place of an ordinary line, and gives way to a plan
 * note), and no note before a plan's rest day.
 */
export async function scheduleCommuteNote(settingsIn?: Settings): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((n) => n.content.data?.kind === 'commute').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  const c = await loadCommute();
  if (!ready(c) || c.noteDay == null) return;
  const settings = settingsIn ?? (await loadSettings());
  if (settings.notifyPerWeek === 0) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const now = Date.now();
  const at = nextNoteAt(c.noteDay, now);
  if (at == null) return;
  const runs = await listRuns().catch(() => []);
  const lastRun = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
  if (lastRun != null && awayDays(lastRun, at) >= AWAY_QUIET_DAYS) return;

  const plan = await loadPlan().catch(() => null);
  if (plan && plan.status === 'active') {
    const runDay = dayStart(at + DAY_MS);
    const sessions = runSessions(plan).filter((s) => s.date === runDay && !s.skipped);
    if (!sessions.length || sessions.every((s) => s.kind === 'rest')) return;
  }

  const day = dayStart(at);
  const fresh = await Notifications.getAllScheduledNotificationsAsync();
  const sameDay = fresh.filter((n) => {
    const t = triggerTime(n.trigger);
    return t != null && dayStart(t) === day;
  });
  if (sameDay.some((n) => n.content.data?.kind === 'plan')) return;
  for (const n of sameDay) if (n.content.data?.kind === 'reminder') await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});

  await ensureChannel();
  const lines = ui().commute.noteLines;
  await Notifications.scheduleNotificationAsync({
    content: { title: ui().commute.noteTitle, body: lines[Math.floor(at / DAY_MS) % lines.length], sound: false, data: { kind: 'commute' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL },
  });
}

function triggerTime(trigger: unknown): number | null {
  const t = trigger as { value?: number; dateComponents?: { year?: number; month?: number; day?: number } } | null;
  if (!t) return null;
  if (typeof t.value === 'number') return t.value;
  const c = t.dateComponents;
  if (c && c.year != null && c.month != null && c.day != null) return new Date(c.year, c.month - 1, c.day, 12).getTime();
  return null;
}

/** The Run tab's one line, worked out from the runs it already has. null when there's nothing to offer. */
export function useCommuteOffer(runs: Run[], now: number): Offer | null {
  const c = useCommute();
  const on = !!c && ready(c);
  const here = useLastPlace(on);
  const [past, setPast] = useState<PastRun[] | null>(null);
  useEffect(() => {
    if (!c || !ready(c)) {
      setPast(null);
      return;
    }
    let alive = true;
    pastRuns(runs, c)
      .then((p) => alive && setPast(p))
      .catch(() => alive && setPast(null));
    return () => {
      alive = false;
    };
  }, [c, runs]);
  return useMemo(() => (c && past ? offerFor({ now, c, here, runs: past }) : null), [c, past, here, now]);
}
