import * as Notifications from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';
import { listRuns, loadSeenLines, loadSettings, loadValue, saveSeenLines, saveValue } from './db';
import type { Weather } from './forecast';
import type { Mood } from './lines';
import { weekdayName } from './i18n/lang';
import { voice } from './i18n/voice';
import { fitNotes, inQuietHours, planReminders, startOfDay, type ExtraNote, type PlannedReminder } from './reminderPlan';
import { planNotes } from './training/remind';
import type { NotifyPerWeek, Settings } from './types';
import { ui } from './i18n/ui';

const CHANNEL = 'runtrovert-quiet';
const CATEGORY = 'reminder'; // carries the "Fewer, please" button
export const FEWER_ACTION = 'fewer';
const LOG_KEY = 'reminderLog'; // times reminders were set for, to tell when they're being ignored

/** What a note from another part of the app says. `data.kind` is what a tap opens. */
export interface NoteContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Another part of the app with notes to send (a training plan, Run to work).
 * They all go through rescheduleReminders, so the daily cap holds across them.
 * ownedDays are local day starts on which the ordinary reminders step aside.
 */
export type NoteSource = (settings: Settings, now: number) => Promise<{ notes: ExtraNote<NoteContent>[]; ownedDays?: number[] }>;

const SOURCES: NoteSource[] = [planNotes];

// Run notes (live stats, km splits) are for the lock screen and the watch; while
// the app is open you are already looking at the numbers, so no banner then.
const RUN_KINDS = new Set(['live', 'split', 'battery']);

Notifications.setNotificationHandler({
  handleNotification: async (n) => ({
    shouldShowBanner: !(RUN_KINDS.has(String(n.request.content.data?.kind)) && AppState.currentState === 'active'),
    shouldShowList: true,
    shouldPlaySound: false, // quiet, always
    shouldSetBadge: false,
  }),
});

export async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: ui().notify.channel,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0, 120],
    enableVibrate: true,
    showBadge: false,
  });
}

async function ensureCategory() {
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: FEWER_ACTION, buttonTitle: ui().notify.fewerPlease, options: { opensAppToForeground: true } },
  ]).catch(() => {});
}


export type NotifyStatus = 'granted' | 'ask' | 'blocked';

/** Where notification permission stands, without ever showing a prompt. */
export async function notificationStatus(): Promise<NotifyStatus> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return 'granted';
  return cur.canAskAgain ? 'ask' : 'blocked';
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await notificationStatus()) === 'granted';
}

/**
 * Shows the system prompt. Only call this from something the person tapped:
 * "Yes, quietly" on the welcome, "Turn on" or "Send me one now" in Settings.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } });
  return res.granted;
}

/** "Turn on" in Settings: the prompt if the phone still allows one, otherwise the phone's settings. */
export async function turnOnNotifications(): Promise<boolean> {
  if ((await notificationStatus()) === 'blocked') {
    await Linking.openSettings().catch(() => {});
    return false;
  }
  return requestNotificationPermission();
}

// ---- Picking lines ---------------------------------------------------------

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Deterministic-ish RNG seeded per schedule so a refresh on the same day yields the same lines. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function lineId(mood: Mood, idx: number) {
  return `${mood}:${idx}`;
}

function chooseLine(moods: Mood[], seen: Set<string>, rnd: () => number): { id: string; text: string } {
  const all = moods.flatMap((mood) => voice().reminders.moods[mood].map((text, idx) => ({ id: lineId(mood, idx), text })));
  const pool = all.filter((l) => !seen.has(l.id));
  return pick(pool.length ? pool : all, rnd);
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function bodyFor(r: PlannedReminder, seen: Set<string>, rnd: () => number): { id: string | null; text: string } {
  const hour = new Date(r.at).getHours();
  switch (r.kind) {
    case 'rhythm':
      return { id: null, text: pick(voice().reminders.rhythm, rnd).replace(/\{day\}/g, weekdayName(r.at)) };
    case 'window':
      return { id: null, text: pick(voice().reminders.window, rnd).replace('{time}', hhmm(r.dryFrom ?? r.at)) };
    case 'last':
      return { id: null, text: pick(voice().reminders.last, rnd) };
    case 'afternoon':
      return { id: null, text: pick(voice().reminders.afternoon, rnd) };
    case 'weekend':
      return { id: null, text: pick(voice().reminders.weekend, rnd) };
    case 'weather':
    case 'quiet':
    case 'gap':
      return chooseLine([r.kind], seen, rnd);
    default:
      return chooseLine(['nudge', ...(hour < 10 ? (['morning'] as Mood[]) : []), ...(hour >= 17 ? (['evening'] as Mood[]) : [])], seen, rnd);
  }
}

// ---- Scheduling ------------------------------------------------------------

/** Cancel everything this scheduler laid out, so a pending after-run note survives a re-plan. */
async function cancelScheduled() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      // 'reminder' and 'plan' from builds before data.daily existed.
      .filter((n) => n.content.data?.daily === true || n.content.data?.kind === 'reminder' || n.content.data?.kind === 'plan')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * The one notification scheduler. Throws away the old plan and lays out the
 * next two weeks: the ordinary reminders (see reminderPlan.ts for the rules)
 * plus every NoteSource, cut to the day's cap by fitNotes. Called on app open,
 * after a run is saved and when reminder settings change. Never shows a
 * permission prompt.
 */
export async function rescheduleReminders(settingsIn?: Settings): Promise<void> {
  const settings = settingsIn ?? (await loadSettings());
  await cancelScheduled().catch(() => Notifications.cancelAllScheduledNotificationsAsync());
  if (settings.notifyPerWeek === 0) return;
  if (!(await hasNotificationPermission())) return;
  await ensureChannel();
  await ensureCategory();

  const now = Date.now();
  const runs = await listRuns();
  const runStarts = runs.filter((r) => r.endedAt != null).map((r) => r.startedAt);
  const lastRun = runStarts.length ? Math.max(...runStarts) : 0;
  // Each re-plan logs its times again, so count each time once.
  const log = [...new Set(((await loadValue<number[]>(LOG_KEY)) ?? []).filter((t) => t > lastRun && t <= now))];
  const weather = settings.weather ? await loadValue<Weather>('weather').catch(() => null) : null;

  const plan = planReminders({
    now,
    perWeek: settings.notifyPerWeek,
    hour: settings.notifyHour,
    minute: settings.notifyMinute,
    auto: settings.notifyAuto,
    runStarts,
    firedSinceLastRun: log.length,
    forecast: weather?.hours,
  });

  const extras: ExtraNote<NoteContent>[] = [];
  const owned = new Set<number>();
  for (const source of SOURCES) {
    const r = await source(settings, now).catch(() => null);
    if (!r) continue;
    extras.push(...r.notes);
    for (const d of r.ownedDays ?? []) owned.add(startOfDay(d));
  }
  const fitted = fitNotes(plan, extras, owned, settings.notifyPerWeek);

  const seen = new Set(await loadSeenLines());
  if (seen.size > Object.values(voice().reminders.moods).reduce((n, l) => n + l.length, 0) * 0.8) seen.clear();
  const rnd = seeded(Math.floor(now / 86400000));

  const placed: number[] = [];
  for (const f of fitted) {
    const trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(f.at), channelId: CHANNEL } as const;
    if (f.extra) {
      const c = f.extra.payload;
      await Notifications.scheduleNotificationAsync({ content: { title: c.title, body: c.body, sound: false, data: { ...c.data, daily: true } }, trigger });
      continue;
    }
    const r = f.reminder;
    const line = bodyFor(r, seen, rnd);
    if (line.id) seen.add(line.id);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: pick(voice().reminders.titles, rnd),
        body: line.text,
        sound: false,
        categoryIdentifier: r.kind === 'last' ? undefined : CATEGORY,
        data: { kind: 'reminder', plan: r.kind, lineId: line.id, daily: true },
      },
      trigger,
    });
    placed.push(r.at);
  }

  await saveSeenLines(Array.from(seen));
  await saveValue(LOG_KEY, [...new Set([...log, ...placed])]);
}

/** "Fewer, please": one or two a day → one a day → a few a week → off. */
export function fewer(perWeek: NotifyPerWeek): NotifyPerWeek {
  return perWeek >= 14 ? 7 : perWeek >= 5 ? 3 : 0;
}

export function fewerMessage(perWeek: NotifyPerWeek): string {
  if (perWeek === 0) return ui().notify.noMoreRemindersSettingsCan;
  return ui().notify.fewer(perWeek);
}

/**
 * One note fifteen minutes after a run is saved: "How was that?" if the energy
 * check was skipped, otherwise a dry line. Dropped if it would land after 21:00.
 */
export async function notifyAfterRun(settings: Settings, runId: number, moodAfterSet: boolean): Promise<void> {
  if (!settings.afterRunNote) return;
  const delayS = 15 * 60;
  if (inQuietHours(Date.now() + delayS * 1000)) return;
  if (!(await hasNotificationPermission())) return;
  await ensureChannel();
  const rnd = seeded(Date.now());
  const reflect = !moodAfterSet;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: pick(reflect ? voice().reminders.reflectTitles : voice().reminders.afterRunTitles, rnd),
      body: pick(reflect ? voice().reminders.reflectLines : voice().reminders.afterRunLines, rnd),
      sound: false,
      data: { kind: 'after-run', runId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delayS, channelId: CHANNEL },
  });
}

/** Settings: send one line right now, so you can see how they look (and that they arrive). */
export async function sendLineNow(): Promise<boolean> {
  if (!(await requestNotificationPermission())) return false;
  await ensureChannel();
  await ensureCategory();
  const rnd = seeded(Date.now());
  await Notifications.scheduleNotificationAsync({
    content: { title: pick(voice().reminders.titles, rnd), body: previewLine(), sound: false, categoryIdentifier: CATEGORY, data: { kind: 'preview' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL },
  });
  return true;
}

/** For the Settings screen: a random line without scheduling anything. */
export function previewLine(): string {
  const rnd = seeded(Date.now());
  const v = voice().reminders;
  const tuesday = weekdayName(new Date(2026, 9, 27).getTime());
  const pools = [v.moods.nudge, v.moods.quiet, v.moods.weather, v.moods.morning, v.moods.evening, v.afternoon, v.weekend, v.rhythm.map((l) => l.replace(/\{day\}/g, tuesday)), v.window.map((l) => l.replace('{time}', '11:00'))];
  const pool = pick(pools, rnd);
  return pick(pool, rnd);
}
