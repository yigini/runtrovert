import type { RunPreset } from './presets';
import type { ComebackChoice } from './training/comeback';
import { type Lang } from './i18n/lang';

export type Mood = 1 | 2 | 3 | 4 | 5; // 1 = drained, 5 = recharged
export type Quiet = 'crowded' | 'some' | 'empty';

export interface Run {
  id: number;
  startedAt: number; // epoch ms
  endedAt: number | null;
  distanceM: number; // metres
  durationS: number; // active seconds (pauses excluded)
  elevationGainM: number;
  moodBefore: Mood | null;
  moodAfter: Mood | null;
  quiet: Quiet | null;
  note: string | null;
}

export interface Point {
  id: number;
  runId: number;
  ts: number;
  lat: number;
  lon: number;
  alt: number | null;
  acc: number | null; // horizontal accuracy, metres
}

export type SplitKind = 'km' | 'lap';

export interface Split {
  id: number;
  runId: number;
  kind: SplitKind;
  index: number; // 1-based within its kind
  distanceM: number; // distance covered in this split
  durationS: number; // active seconds in this split
  atDistanceM: number; // cumulative distance when the split closed
  atDurationS: number; // cumulative active seconds when the split closed
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

export type CueMode = 'silent' | 'haptic' | 'voice';

export type NotifyPerWeek = 0 | 1 | 3 | 5;

/** unasked: never shown. yes: tapped "Yes, quietly". no: tapped "Not now", so never asked again. */
export type NotifyAsk = 'unasked' | 'yes' | 'no';

/** best: 1 Hz navigation GPS. saver: coarser, slower fixes. auto: best until the battery is low. */
export type BatteryMode = 'auto' | 'best' | 'saver';

/** Where "Open" on the Listen tab sends a show. null = ask the first time. */
export type PodcastApp = 'apple' | 'spotify' | 'youtube' | 'pocketcasts' | 'antennapod' | 'share';

/** The daily Listen list: ask on first open, then download when the tab is opened, or never. */
export type ListenDownload = 'ask' | 'on' | 'off';

export interface Settings {
  cueMode: CueMode;
  autoPause: boolean;
  countdownS: number; // 0 = none
  unitsKm: boolean; // false = miles
  notifyPerWeek: NotifyPerWeek;
  notifyHour: number; // 0–23, local
  notifyMinute: number;
  notifyAuto: boolean; // follow your usual days and time once there are a few runs
  notifyAsk: NotifyAsk; // our own one-time question at the end of the welcome
  seenNews: string; // id of the last "What's new" line dismissed
  afterRunNote: boolean; // a quiet "run saved" notification
  weather: boolean; // fetch the local forecast for the home screen (Open-Meteo, coarse location)
  runNotes: boolean; // live stats on the lock screen and a note per km (watches mirror these)
  watch: boolean; // the Wear OS app: live run on the wrist, its buttons, its heart rate into the run
  batteryMode: BatteryMode;
  keepScreenOn: boolean; // during a run only
  listenDownload: ListenDownload;
  podcastApp: PodcastApp | null;
  podcastCountry: string | null; // Apple storefront code; null = the phone's region
  offersHidden: boolean; // Kit & offers switched off for good
  offerTopics: string[]; // what the runner wants to see there; stays on the phone
  musicStrip: boolean; // previous / play / next on the run screen
  musicApp: string | null; // MUSIC_APPS key; null = the phone's default music app
  plainMap: boolean; // no street tiles: route and dot on a plain ground, nothing fetched
  mapNoticeSeen: boolean; // told once what the tile service sees, before any tile loads
  runPreset: RunPreset | null; // Today's run, last choice; null = never picked
  language: Lang | null; // null = follow the phone
  silentDay: string | null; // "Run in silence today" from the Listen sheet, as a dayKey
  comeback: { since: number; choice: ComebackChoice } | null; // what was done with the plan after a break; `since` = the last run then
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  cueMode: 'haptic',
  autoPause: true,
  countdownS: 3,
  unitsKm: true,
  notifyPerWeek: 3,
  notifyHour: 8,
  notifyMinute: 0,
  notifyAuto: true,
  notifyAsk: 'unasked',
  seenNews: '',
  afterRunNote: true,
  weather: true,
  runNotes: true,
  watch: true,
  batteryMode: 'auto',
  keepScreenOn: false,
  listenDownload: 'ask',
  podcastApp: null,
  podcastCountry: null,
  offersHidden: false,
  offerTopics: [],
  musicStrip: true,
  musicApp: null,
  plainMap: false,
  mapNoticeSeen: false,
  runPreset: null,
  language: null,
  silentDay: null,
  comeback: null,
  onboarded: false,
};
