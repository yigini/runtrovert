// Home and work on the phone, which runs were commutes, and the one
// evening-before note. Home and work are kept under their own key, apart from
// Settings, so nothing that reads settings for any other reason carries them.
// Nothing here is ever sent anywhere.

import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { getDb, getPoints, listRuns, loadSettings, loadValue, saveValue } from './db';
import { commuteNotes, commuteOf, estimate, NO_COMMUTE, offerFor, ready, type Commute, type CommuteDir, type Offer, type PastRun } from './commute';
import { ensureChannel, rescheduleReminders } from './notify';
import { useLastPlace } from './place';
import { formatDistance } from './geo';
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
 * The weekday commute notes (src/commute.ts says which and when), written out
 * as title and body. A note source: the shared scheduler can fit these with
 * the others (priority between a plan note and an ordinary line). Nothing
 * when reminders are set to none.
 */
export async function commuteNoteList(settings: Settings, now: number): Promise<Array<{ at: number; dir: CommuteDir; title: string; body: string }>> {
  const c = await loadCommute();
  if (!ready(c) || c.nudges === 'off' || settings.notifyPerWeek === 0) return [];
  const runs = await listRuns().catch(() => []);
  const tags = await commuteTags(c).catch(() => new Map<number, CommuteDir>());
  const latest = runs.reduce<Run | null>((a, r) => (!a || r.startedAt > a.startedAt ? r : a), null);
  const lastRun = latest ? { at: latest.startedAt, dir: tags.get(latest.id) ?? null } : null;

  const plan = await loadPlan().catch(() => null);
  const planDays = new Map<number, 'rest' | 'session'>();
  if (plan && plan.status === 'active') {
    for (const s of runSessions(plan)) {
      if (s.skipped) continue;
      planDays.set(s.date, s.kind === 'rest' && planDays.get(s.date) !== 'session' ? 'rest' : 'session');
    }
  }
  // Rough distance for the line, from the runner's own commutes once there are some.
  const past = runs.map((r) => ({ startedAt: r.startedAt, distanceM: r.distanceM, durationS: r.durationS, dir: tags.get(r.id) ?? null }));
  return commuteNotes({ now, c, lastRun, plan: planDays }).map((n) => {
    const k = Math.floor(n.at / DAY_MS);
    const titles = n.dir === 'toWork' ? ui().commute.morningTitles : ui().commute.homeTitles;
    const lines = n.dir === 'toWork' ? ui().commute.morningLines : ui().commute.homeLines;
    return { at: n.at, dir: n.dir, title: titles[k % titles.length], body: lines[k % lines.length](formatDistance(estimate(n.dir, c, past).distanceM, settings.unitsKm)) };
  });
}

/**
 * Lays the commute notes out after the ordinary reminders and the plan's
 * (App.tsx re-plans all three together on open and after every run). A day
 * with a commute note gives up its ordinary line, and a plan day only gets the
 * afternoon one, so never more than two a day. Once the shared scheduler in
 * notify.ts takes note sources, commuteNoteList() goes there and this goes.
 */
export async function scheduleCommuteNote(settingsIn?: Settings): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter((n) => n.content.data?.kind === 'commute').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  const settings = settingsIn ?? (await loadSettings());
  const notes = await commuteNoteList(settings, Date.now());
  if (!notes.length) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const fresh = await Notifications.getAllScheduledNotificationsAsync();
  const days = new Set(notes.map((n) => dayStart(n.at)));
  for (const n of fresh) {
    const t = triggerTime(n.trigger);
    if (n.content.data?.kind === 'reminder' && t != null && days.has(dayStart(t))) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }

  await ensureChannel();
  for (const n of notes) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, sound: false, data: { kind: 'commute', dir: n.dir } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at), channelId: CHANNEL },
    });
  }
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
