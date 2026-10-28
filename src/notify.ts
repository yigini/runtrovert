import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { listRuns, loadSeenLines, loadSettings, saveSeenLines } from './db';
import { AFTER_RUN_LINES, AFTER_RUN_TITLES, LINES, TITLES, TOTAL_LINES, type Mood } from './lines';
import type { Settings } from './types';

const CHANNEL = 'runtrovert-quiet';
const HORIZON_DAYS = 21; // schedule this far ahead; refreshed on every app open
const MAX_PENDING = 20; // stay well under the iOS limit of 64

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // quiet, always
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Quiet reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0, 120],
    enableVibrate: true,
    showBadge: false,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } });
  return res.granted;
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

function weekdaysFor(perWeek: number): number[] {
  // 0 = Sunday. Spread across the week; weekends left mostly alone.
  switch (perWeek) {
    case 1:
      return [3];
    case 3:
      return [1, 3, 5];
    case 5:
      return [1, 2, 3, 4, 5];
    default:
      return [];
  }
}

function moodFor(date: Date, daysSinceRun: number | null, hour: number): Mood {
  if (daysSinceRun != null && daysSinceRun <= 1) return 'rest';
  if (daysSinceRun != null && daysSinceRun >= 7) return 'gap';
  if (daysSinceRun != null && daysSinceRun >= 3) return 'quiet';
  const month = date.getMonth();
  const wintry = month <= 1 || month >= 10;
  const roll = (date.getDate() + month) % 5;
  if (wintry && roll === 0) return 'weather';
  if (hour < 10 && roll === 1) return 'morning';
  if (hour >= 17 && roll === 2) return 'evening';
  return 'nudge';
}

function lineId(mood: Mood, idx: number) {
  return `${mood}:${idx}`;
}

function chooseLine(mood: Mood, seen: Set<string>, rnd: () => number): { id: string; text: string } {
  const pool = LINES[mood].map((text, idx) => ({ id: lineId(mood, idx), text })).filter((l) => !seen.has(l.id));
  const from = pool.length ? pool : LINES[mood].map((text, idx) => ({ id: lineId(mood, idx), text }));
  return pick(from, rnd);
}

// ---- Scheduling ------------------------------------------------------------

/**
 * Cancel everything and lay out the next few weeks. Called on app open and
 * whenever notification settings change. Lines are chosen so nothing repeats
 * until most of the bank has been used.
 */
export async function rescheduleReminders(settingsIn?: Settings): Promise<void> {
  const settings = settingsIn ?? (await loadSettings());
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (settings.notifyPerWeek === 0) return;
  if (!(await requestNotificationPermission())) return;
  await ensureChannel();

  const runs = await listRuns();
  const lastRunAt = runs[0]?.startedAt ?? null;
  const now = new Date();
  const days = weekdaysFor(settings.notifyPerWeek);
  const seen = new Set(await loadSeenLines());
  if (seen.size > TOTAL_LINES * 0.8) seen.clear();
  const rnd = seeded(now.getFullYear() * 1000 + Math.floor(now.getTime() / 86400000));

  let scheduled = 0;
  for (let d = 0; d < HORIZON_DAYS && scheduled < MAX_PENDING; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    date.setHours(settings.notifyHour, settings.notifyMinute, 0, 0);
    if (!days.includes(date.getDay())) continue;
    if (date.getTime() <= now.getTime() + 60_000) continue;

    // Context is only accurate for the near future; beyond a week we assume "ordinary".
    const daysSinceRun = lastRunAt != null && d <= 7 ? Math.floor((date.getTime() - lastRunAt) / 86400000) : null;
    const mood = moodFor(date, daysSinceRun, settings.notifyHour);
    const line = chooseLine(mood, seen, rnd);
    seen.add(line.id);

    await Notifications.scheduleNotificationAsync({
      content: { title: pick(TITLES, rnd), body: line.text, sound: false, data: { kind: 'reminder', lineId: line.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
    scheduled++;
  }

  await saveSeenLines(Array.from(seen));
}

/** One quiet note a few minutes after a run is saved. */
export async function notifyAfterRun(settings: Settings): Promise<void> {
  if (!settings.afterRunNote) return;
  if (!(await requestNotificationPermission())) return;
  await ensureChannel();
  const rnd = seeded(Date.now());
  await Notifications.scheduleNotificationAsync({
    content: { title: pick(AFTER_RUN_TITLES, rnd), body: pick(AFTER_RUN_LINES, rnd), sound: false, data: { kind: 'after-run' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 15 * 60, channelId: CHANNEL },
  });
}

/** For the Settings screen: a random preview without scheduling anything. */
export function previewLine(): string {
  const rnd = seeded(Date.now());
  const moods: Mood[] = ['nudge', 'rest', 'quiet', 'weather', 'morning', 'evening'];
  return LINES[pick(moods, rnd)][Math.floor(rnd() * 8)] ?? LINES.nudge[0];
}
