/**
 * Run notes: what you see on the lock screen and on your wrist while running.
 *
 * - Android: one silent, ongoing "live" notification, refreshed every 30 s and
 *   on pause/resume, so a glance at the lock screen beats unlocking.
 * - Both platforms: a short note at each km/mile split. Wear OS and Apple Watch
 *   mirror phone notifications on their own, so this is watch support with no
 *   watch app. One note replaces the last, so the shade never fills up.
 *
 * - Android: Pause, Resume and Lap buttons on the live note, so the run can be
 *   paused or a lap marked from the lock screen without opening the app.
 *   They work in the background (the run's foreground service keeps the app
 *   alive) and go straight to the tracker (src/tracking.ts).
 *
 * Everything is local; nothing leaves the phone.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { distanceUnit, formatDistanceNumber, formatDuration, formatPace } from './geo';
import { hasNotificationPermission } from './notify';
import { ui } from './i18n/ui';

const LIVE_CHANNEL = 'runtrovert-live';
const SPLIT_CHANNEL = 'runtrovert-splits';
const LIVE_ID = 'runtrovert-live';
const SPLIT_ID = 'runtrovert-split';
const LIVE_EVERY_MS = 30_000;
// The live note's buttons. Two sets, because Android can't change a button's
// label in place: recording shows Pause and Lap, paused shows Resume.
const RUNNING_CATEGORY = 'run-live';
const PAUSED_CATEGORY = 'run-live-paused';
export const PAUSE_ACTION = 'run-pause';
export const RESUME_ACTION = 'run-resume';
export const LAP_ACTION = 'run-lap';
export type RunAction = 'pause' | 'resume' | 'lap';
const ACTIONS: Record<string, RunAction> = { [PAUSE_ACTION]: 'pause', [RESUME_ACTION]: 'resume', [LAP_ACTION]: 'lap' };

let enabled = false;
let lastLiveAt = 0;
let lastLiveStatus = '';

export interface RunNoteState {
  status: 'running' | 'paused' | 'autopaused';
  distanceM: number;
  durationS: number;
  unitsKm: boolean;
  laps?: number;
}

let actionHandler: ((a: RunAction) => void) | null = null;

/** The tracker says what the buttons do. One handler. */
export function setRunActionHandler(h: ((a: RunAction) => void) | null): void {
  actionHandler = h;
}

// Registered at load, so a tap with the screen locked reaches the run.
try {
  Notifications.addNotificationResponseReceivedListener((r) => {
    const a = ACTIONS[r.actionIdentifier];
    if (a) actionHandler?.(a);
  });
} catch {
  // no notifications module (tests, web)
}

async function ensureCategories() {
  const bg = { opensAppToForeground: false };
  await Notifications.setNotificationCategoryAsync(RUNNING_CATEGORY, [
    { identifier: PAUSE_ACTION, buttonTitle: ui().run.pause, options: bg },
    { identifier: LAP_ACTION, buttonTitle: ui().run.lap, options: bg },
  ]).catch(() => {});
  await Notifications.setNotificationCategoryAsync(PAUSED_CATEGORY, [{ identifier: RESUME_ACTION, buttonTitle: ui().run.resume, options: bg }]).catch(() => {});
}

/** Post the live note on the next tick even if nothing else changed (a lap was marked). */
export function refreshLiveNote(): void {
  lastLiveStatus = '';
}

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(LIVE_CHANNEL, {
    name: ui().runNotify.liveChannel,
    description: ui().runNotify.liveChannelHint,
    importance: Notifications.AndroidImportance.LOW, // no sound, no peek
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(SPLIT_CHANNEL, {
    name: ui().runNotify.splitChannel,
    description: ui().runNotify.splitChannelHint,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0, 120, 90, 120],
    enableVibrate: true,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Call at run start. Never prompts: without permission a run just has no notes. */
export async function beginRunNotes(on: boolean): Promise<void> {
  enabled = false;
  lastLiveAt = 0;
  lastLiveStatus = '';
  if (!on) return;
  try {
    if (!(await hasNotificationPermission())) return;
    await ensureChannels();
    await ensureCategories();
    enabled = true;
  } catch {
    enabled = false;
  }
}

function statusWord(s: RunNoteState['status']) {
  return s === 'running' ? ui().runNotify.recording : s === 'autopaused' ? ui().runNotify.autoPaused : ui().runNotify.paused;
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
      body: ui().runNotify.liveBody(`${formatPace(s.distanceM, s.durationS, s.unitsKm)} /${unit}`, statusWord(s.status)) + (s.laps ? ` · ${ui().run.lapsDone(s.laps)}` : ''),
      categoryIdentifier: s.status === 'running' ? RUNNING_CATEGORY : PAUSED_CATEGORY,
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
      title: `${unitsKm ? ui().runNotify.km : ui().runNotify.mile} ${index} · ${formatPace(splitM, splitDurationS, unitsKm)} /${unit}`,
      body: ui().runNotify.xXInX(formatDistanceNumber(totalDistanceM, unitsKm), unit, formatDuration(totalDurationS)),
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
      title: ui().runNotify.batterySaverOn,
      body: levelPct != null ? ui().runNotify.batteryAtXGpsEased(levelPct) : ui().runNotify.phoneIsInLowPower,
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
