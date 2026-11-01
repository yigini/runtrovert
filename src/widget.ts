// The two Android home-screen widgets (modules/runtrovert-widget): "Start a
// run", and the last run with this week. They only ever show what is already on
// this phone, handed over by refreshWidgets(); nothing is fetched for them.
// A tap on Start opens the app with runtrovert://start-run, and the Run tab
// starts the run as it does for the watch's start button.

import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { listRuns, loadSettings } from './db';
import { goalStore } from './extraStores';
import { widgetData } from './widgetData';

type Native = { update(json: string): boolean };

const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('RuntrovertWidget') : null;

export const START_URL = 'runtrovert://start-run';

/** Hands the widgets fresh words. Cheap: one list of runs, no network. */
export async function refreshWidgets(): Promise<void> {
  if (!native) return;
  const [runs, settings, goal] = await Promise.all([listRuns(), loadSettings(), goalStore.load()]);
  native.update(JSON.stringify(widgetData(runs, goal, settings.unitsKm, Date.now())));
}

let starter: (() => void) | null = null;
/** A start tapped before the Run tab was ready waits a little, then is dropped. */
let pendingAt = 0;
let initialRead = false;

function take(url: string | null | undefined) {
  if (!url || !url.startsWith(START_URL)) return;
  if (starter) setTimeout(() => starter?.(), 300);
  else pendingAt = Date.now();
}

if (native) {
  Linking.addEventListener('url', (e) => take(e.url));
}

/** The Run tab listens for the widget's Start. Returns the way to stop listening. */
export function onWidgetStart(fn: () => void): () => void {
  starter = fn;
  if (native && !initialRead) {
    initialRead = true;
    Linking.getInitialURL()
      .then(take)
      .catch(() => {});
  }
  if (pendingAt && Date.now() - pendingAt < 60_000) {
    pendingAt = 0;
    setTimeout(fn, 300);
  }
  return () => {
    if (starter === fn) starter = null;
  };
}
