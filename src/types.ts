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

/** best: 1 Hz navigation GPS. saver: coarser, slower fixes. auto: best until the battery is low. */
export type BatteryMode = 'auto' | 'best' | 'saver';

export interface Settings {
  cueMode: CueMode;
  autoPause: boolean;
  countdownS: number; // 0 = none
  unitsKm: boolean; // false = miles
  notifyPerWeek: NotifyPerWeek;
  notifyHour: number; // 0–23, local
  notifyMinute: number;
  afterRunNote: boolean; // a quiet "run saved" notification
  weather: boolean; // fetch the local forecast for the home screen (Open-Meteo, coarse location)
  runNotes: boolean; // live stats on the lock screen and a note per km (watches mirror these)
  batteryMode: BatteryMode;
  keepScreenOn: boolean; // during a run only
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
  afterRunNote: true,
  weather: true,
  runNotes: true,
  batteryMode: 'auto',
  keepScreenOn: false,
  onboarded: false,
};
