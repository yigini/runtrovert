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
import type { RawFix } from './kalman';

export const LOCATION_TASK = 'runtrovert-location';

export type FixListener = (fixes: RawFix[]) => void;

export interface LocationEngine {
  readonly name: string;
  setListener(l: FixListener | null): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
}

// ---- Expo --------------------------------------------------------------------

let expoListener: FixListener | null = null;

// Defined at module load so the task exists when the OS wakes the app.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data || !expoListener) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  expoListener(
    locations.map((l) => ({
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      acc: l.coords.accuracy ?? null,
      alt: l.coords.altitude ?? null,
      speed: l.coords.speed ?? null,
      ts: l.timestamp,
    })),
  );
});

class ExpoEngine implements LocationEngine {
  readonly name = 'expo-location';
  setListener(l: FixListener | null) {
    expoListener = l;
  }
  async start() {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.Fitness,
      timeInterval: 1000,
      distanceInterval: 0, // every fix; the filter decides what counts
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      deferredUpdatesInterval: 0,
      foregroundService: {
        notificationTitle: 'Runtrovert',
        notificationBody: 'Recording your run. Quietly.',
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

  async start() {
    const bg = this.bg;
    await bg.ready({
      desiredAccuracy: bg.DESIRED_ACCURACY_NAVIGATION,
      distanceFilter: 0,
      locationUpdateInterval: 1000,
      fastestLocationUpdateInterval: 1000,
      disableElasticity: true,
      stopOnTerminate: false,
      startOnBoot: false,
      enableHeadless: true,
      preventSuspend: true,
      heartbeatInterval: 60,
      foregroundService: true,
      notification: { title: 'Runtrovert', text: 'Recording your run. Quietly.', color: '#7fb3a2', priority: bg.NOTIFICATION_PRIORITY_LOW },
      // Privacy: never let the library talk to any server.
      url: undefined,
      autoSync: false,
      maxDaysToPersist: 0,
      logLevel: bg.LOG_LEVEL_OFF,
    });
    this.sub = bg.onLocation((loc: any) => {
      if (!this.listener || !loc?.coords) return;
      this.listener([
        {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          acc: loc.coords.accuracy ?? null,
          alt: loc.coords.altitude ?? null,
          speed: loc.coords.speed ?? null,
          ts: loc.timestamp ? Date.parse(loc.timestamp) : Date.now(),
        },
      ]);
    });
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
