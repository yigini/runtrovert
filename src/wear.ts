import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { addHeartRate } from './db';
import { liveJson, OPEN_FOR_MS, parseCommand, parseHeart, parseHello, PATHS, shouldSend, splitJson, type LiveForWatch, type WatchCommand, type WatchStatus } from './wearProtocol';

/**
 * The Wear OS app's phone side. The phone records; the watch shows the run,
 * sends Start / Pause / Resume / Stop, and its heart-rate readings, which are
 * stored with the run here and nowhere else. Messages go over the direct link
 * to a nearby watch only (modules/runtrovert-wear), never through a server.
 * Free for everyone: nothing here asks isUnlocked().
 */

interface Native {
  send(path: string, data: string): Promise<number>;
  hasWatch(): Promise<boolean>;
  addListener(event: 'onMessage', cb: (e: { path: string; data: string }) => void): { remove(): void };
}

// Missing on iPhone, in Expo Go and on web: then every call below does nothing.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('RuntrovertWear') : null;

let enabled = true;
let started = false;
let watchOpenUntil = 0;
let lastSent: { at: number; status: WatchStatus } | null = null;
let current: LiveForWatch & { runId: number | null } = { status: 'idle', distanceM: 0, durationS: 0, unitsKm: true, runId: null };
let commandHandler: ((c: WatchCommand) => void) | null = null;

function send(path: string, data: string) {
  if (!native || !enabled) return;
  native.send(path, data).catch(() => {});
}

function sendLive(needsOpen = false) {
  lastSent = { at: Date.now(), status: current.status };
  send(PATHS.live, liveJson(current, needsOpen));
}

/** Once, when the settings first load. Says hello to a watch that may be waiting on a Start. */
function startWear(): void {
  if (!native || started) return;
  started = true;
  native.addListener('onMessage', ({ path, data }) => {
    if (!enabled) return;
    if (path === PATHS.hello) {
      const open = parseHello(data);
      watchOpenUntil = open ? Date.now() + OPEN_FOR_MS : 0;
      sendLive();
    } else if (path === PATHS.cmd) {
      const c = parseCommand(data);
      // Android only lets an app on screen start recording location. From the
      // pocket, the watch opens Runtrovert on the phone and asks again.
      if (c === 'start' && current.status === 'idle' && AppState.currentState !== 'active') return sendLive(true);
      if (c) commandHandler?.(c);
      sendLive(); // the watch waits on an answer to know the app is up
    } else if (path === PATHS.hr) {
      const runId = current.runId;
      // Kept while the finish screen is up too: the watch's last few seconds arrive just after Stop.
      if (runId == null || current.status === 'idle') return;
      void addHeartRate(runId, parseHeart(data)).catch(() => {});
    }
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'active' && enabled) sendLive();
  });
  sendLive();
}

/** Settings → Watch app. Off: the phone sends nothing and ignores the watch. */
export function setWearEnabled(on: boolean): void {
  if (!started) {
    enabled = on;
    startWear();
    return;
  }
  if (enabled === on) return;
  if (!on) {
    // Last word before going quiet, so the watch doesn't show a run that isn't there.
    send(PATHS.live, liveJson({ ...current, status: 'idle' }));
  }
  enabled = on;
  if (on) sendLive();
}

/** The run screen's handler for the watch's buttons. */
export function onWatchCommand(fn: ((c: WatchCommand) => void) | null): void {
  commandHandler = fn;
}

/** From the tracking tick. Cheap: most calls send nothing. */
export function wearLive(s: LiveForWatch & { runId: number | null }): void {
  current = s;
  if (!native || !enabled) return;
  if (shouldSend(Date.now(), lastSent, s.status, watchOpenUntil)) sendLive();
}

/** A km (or mile) closed: the watch buzzes. */
export function wearSplit(index: number, splitDurationS: number, totalDistanceM: number, totalDurationS: number, unitsKm: boolean): void {
  send(PATHS.split, splitJson(index, splitDurationS, totalDistanceM, totalDurationS, unitsKm));
}
