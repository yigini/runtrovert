/**
 * Run notes: what you see on the lock screen and on your wrist while running.
 *
 * - Android: one silent, ongoing "live" notification, refreshed every 30 s and
 *   on pause/resume, so a glance at the lock screen beats unlocking.
 * - Both platforms: a short note at each km/mile split. Wear OS and Apple Watch
 *   mirror phone notifications on their own, so this is watch support with no
 *   watch app. One note replaces the last, so the shade never fills up.
 *
 * Everything is local; nothing leaves the phone.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { distanceUnit, formatDistanceNumber, formatDuration, formatPace } from './geo';
import { requestNotificationPermission } from './notify';

const LIVE_CHANNEL = 'runtrovert-live';
const SPLIT_CHANNEL = 'runtrovert-splits';
const LIVE_ID = 'runtrovert-live';
const SPLIT_ID = 'runtrovert-split';
const LIVE_EVERY_MS = 30_000;

let enabled = false;
let lastLiveAt = 0;
let lastLiveStatus = '';

export interface RunNoteState {
  status: 'running' | 'paused' | 'autopaused';
  distanceM: number;
  durationS: number;
  unitsKm: boolean;
}

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(LIVE_CHANNEL, {
    name: 'Run in progress',
    description: 'Distance and time on the lock screen while you run.',
    importance: Notifications.AndroidImportance.LOW, // no sound, no peek
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(SPLIT_CHANNEL, {
    name: 'Splits',
    description: 'A short note at each km or mile. Your watch shows it too.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0, 120, 90, 120],
    enableVibrate: true,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Call at run start. Asks for notification permission if needed. */
export async function beginRunNotes(on: boolean): Promise<void> {
  enabled = false;
  lastLiveAt = 0;
  lastLiveStatus = '';
  if (!on) return;
  try {
    if (!(await requestNotificationPermission())) return;
    await ensureChannels();
    enabled = true;
  } catch {
    enabled = false;
  }
}

function statusWord(s: RunNoteState['status']) {
  return s === 'running' ? 'Recording' : s === 'autopaused' ? 'Auto-paused' : 'Paused';
}

/** Cheap to call every tick: only posts every 30 s or when the status changes. Android only. */
export function updateLiveNote(s: RunNoteState): void {
  if (!enabled || Platform.OS !== 'android') return;
  const now = Date.now();
  if (s.status === lastLiveStatus && now - lastLiveAt < LIVE_EVERY_MS) return;
  lastLiveAt = now;
  lastLiveStatus = s.status;
  const unit = distanceUnit(s.unitsKm);
  void Notifications.scheduleNotificationAsync({
    identifier: LIVE_ID,
    content: {
      title: `${formatDistanceNumber(s.distanceM, s.unitsKm)} ${unit} · ${formatDuration(s.durationS)}`,
      body: `${formatPace(s.distanceM, s.durationS, s.unitsKm)} /${unit} average · ${statusWord(s.status)}`,
      sound: false,
      sticky: true,
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      data: { kind: 'live' },
    },
    trigger: { channelId: LIVE_CHANNEL },
  }).catch(() => {});
}

export function splitNote(index: number, splitDurationS: number, totalDistanceM: number, totalDurationS: number, unitsKm: boolean): void {
  if (!enabled) return;
  const unit = distanceUnit(unitsKm);
  const splitM = unitsKm ? 1000 : 1609.344;
  void Notifications.scheduleNotificationAsync({
    identifier: SPLIT_ID,
    content: {
      title: `${unitsKm ? 'Km' : 'Mile'} ${index} · ${formatPace(splitM, splitDurationS, unitsKm)} /${unit}`,
      body: `${formatDistanceNumber(totalDistanceM, unitsKm)} ${unit} in ${formatDuration(totalDurationS)}.`,
      sound: false,
      data: { kind: 'split' },
    },
    trigger: Platform.OS === 'android' ? { channelId: SPLIT_CHANNEL } : null,
  }).catch(() => {});
}

/** Said once, when auto mode drops GPS to saver mid-run. */
export function batteryNote(levelPct: number | null): void {
  if (!enabled) return;
  void Notifications.scheduleNotificationAsync({
    content: {
      title: 'Battery saver on',
      body: levelPct != null ? `Battery at ${levelPct}%. GPS eased off so the run makes it home. Splits stay honest.` : 'Phone is in low-power mode. GPS eased off so the run makes it home.',
      sound: false,
      data: { kind: 'battery' },
    },
    trigger: Platform.OS === 'android' ? { channelId: SPLIT_CHANNEL } : null,
  }).catch(() => {});
}

/** Call at run end (saved or discarded). */
export async function endRunNotes(): Promise<void> {
  enabled = false;
  await Promise.all([Notifications.dismissNotificationAsync(LIVE_ID), Notifications.dismissNotificationAsync(SPLIT_ID)]).catch(() => {});
}
