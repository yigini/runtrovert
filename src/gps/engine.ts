/**
 * Location engine abstraction.
 *
 * Two implementations behind one interface:
 *  - ExpoEngine: expo-location + expo-task-manager. Free, works, adequate on iOS
 *    and on stock Android; gets killed by aggressive OEM battery managers.
 *  - TransistorEngine: react-native-background-geolocation. Motion-aware,
 *    survives Doze and app death, restarts itself. Used automatically when the
 *    package is installed (npm i react-native-background-geolocation, add its
 *    config plugin, set the Android licence key in app.json extra.bgGeoLicense).
 *
 * The tracking state machine never talks to either directly.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { bufferFixes } from '../db';
import { GPS_PROFILES, type GpsProfile } from '../power';
import type { RawFix } from './kalman';
import { ui } from '../i18n/ui';

export const LOCATION_TASK = 'runtrovert-location';

export type FixListener = (fixes: RawFix[]) => void;

export interface LocationEngine {
  readonly name: string;
  setListener(l: FixListener | null): void;
  /** To change profile mid-run, stop() then start(newProfile). */
  start(profile?: GpsProfile): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
}

// ---- Expo --------------------------------------------------------------------

let expoListener: FixListener | null = null;

function toFix(l: Location.LocationObject): RawFix {
  return {
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    acc: l.coords.accuracy ?? null,
    alt: l.coords.altitude ?? null,
    speed: l.coords.speed ?? null,
    ts: l.timestamp,
  };
}

// Defined at module load so the task exists when the OS wakes the app.
// No listener means the OS killed the app mid-run and woke it just for this:
// keep the fixes for recovery to replay instead of dropping them.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const fixes = locations.map(toFix);
  if (expoListener) expoListener(fixes);
  else await bufferFixes(fixes).catch(() => {});
});

class ExpoEngine implements LocationEngine {
  readonly name = 'expo-location';
  private watch: Promise<Location.LocationSubscription | null> | null = null;
  private profile: GpsProfile = GPS_PROFILES.best;

  /**
   * The background task keeps recording with the screen off, but some phones
   * batch or hold its updates while the app is open. A foreground watch feeds
   * the same listener so the live screen always has fresh fixes; duplicates
   * share a timestamp and the filter drops them.
   */
  setListener(l: FixListener | null) {
    expoListener = l;
    if (l && !this.watch) {
      this.watch = Location.watchPositionAsync(
        { accuracy: this.profile.accuracy, timeInterval: this.profile.timeIntervalMs, distanceInterval: this.profile.distanceIntervalM },
        (loc) => expoListener?.([toFix(loc)]),
      ).catch(() => null);
    } else if (!l && this.watch) {
      const w = this.watch;
      this.watch = null;
      void w.then((sub) => sub?.remove());
    }
  }
  async start(profile: GpsProfile = GPS_PROFILES.best) {
    const changed = profile.name !== this.profile.name;
    this.profile = profile;
    if (changed && this.watch) {
      // Re-open the foreground watch at the new rate.
      const l = expoListener;
      this.setListener(null);
      this.setListener(l);
    }
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: profile.accuracy,
      activityType: Location.ActivityType.Fitness,
      timeInterval: profile.timeIntervalMs,
      distanceInterval: profile.distanceIntervalM, // 0 = every fix; the filter decides what counts
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      deferredUpdatesInterval: 0,
      foregroundService: {
        notificationTitle: ui().engine.runtrovert,
        notificationBody: ui().engine.recordingYourRunQuietly,
        notificationColor: '#7fb3a2',
        killServiceOnDestroy: false,
      },
    });
  }
  async stop() {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch {
      // already stopped
    }
  }
  isRunning() {
    return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  }
}

// ---- Transistor (optional) --------------------------------------------------

type BGGeo = any;

function loadTransistor(): BGGeo | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-background-geolocation');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

class TransistorEngine implements LocationEngine {
  readonly name = 'background-geolocation';
  private listener: FixListener | null = null;
  private sub: { remove: () => void } | null = null;
  constructor(private bg: BGGeo) {}

  setListener(l: FixListener | null) {
    this.listener = l;
  }

  async start(profile: GpsProfile = GPS_PROFILES.best) {
    const bg = this.bg;
    const gps = {
      desiredAccuracy: profile.name === 'best' ? bg.DESIRED_ACCURACY_NAVIGATION : bg.DESIRED_ACCURACY_HIGH,
      distanceFilter: profile.distanceIntervalM,
      locationUpdateInterval: profile.timeIntervalMs,
      fastestLocationUpdateInterval: profile.timeIntervalMs,
    };
    await bg.ready({
      ...gps,
      disableElasticity: true,
      stopOnTerminate: false,
      startOnBoot: false,
      enableHeadless: true,
      preventSuspend: true,
      heartbeatInterval: 60,
      foregroundService: true,
      notification: { title: ui().engine.runtrovert, text: ui().engine.recordingYourRunQuietly, color: '#7fb3a2', priority: bg.NOTIFICATION_PRIORITY_LOW },
      // Privacy: never let the library talk to any server.
      url: undefined,
      autoSync: false,
      maxDaysToPersist: 0,
      logLevel: bg.LOG_LEVEL_OFF,
    });
    this.sub = bg.onLocation((loc: any) => {
      if (!loc?.coords) return;
      const fix: RawFix = {
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        acc: loc.coords.accuracy ?? null,
        alt: loc.coords.altitude ?? null,
        speed: loc.coords.speed ?? null,
        ts: loc.timestamp ? Date.parse(loc.timestamp) : Date.now(),
      };
      if (this.listener) this.listener([fix]);
      else void bufferFixes([fix]).catch(() => {});
    });
    await bg.setConfig(gps); // ready() only applies config on its first call; this covers profile changes
    await bg.start();
    await bg.changePace(true); // force "moving" so it never idles into stationary geofence mode
  }

  async stop() {
    this.sub?.remove();
    this.sub = null;
    try {
      await this.bg.stop();
    } catch {
      // ignore
    }
  }

  async isRunning() {
    try {
      const s = await this.bg.getState();
      return !!s?.enabled;
    } catch {
      return false;
    }
  }
}

// ---- Factory -----------------------------------------------------------------

let engine: LocationEngine | null = null;

export function getEngine(): LocationEngine {
  if (!engine) {
    const bg = loadTransistor();
    engine = bg ? new TransistorEngine(bg) : new ExpoEngine();
  }
  return engine;
}
