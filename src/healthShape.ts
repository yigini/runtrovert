// The pure half of Health Connect: what a run looks like going out, and what
// a Health Connect session becomes coming in. Tested in Node (test:health).

import type { ImportedRun } from './io/types';
import { plausibleBpm } from './io/types';

/** Which runs we write: ones recorded here or added by hand. Files and Health Connect's own came from somewhere that has them already. */
export function writesToHealth(source: { kind: string } | null): boolean {
  return source == null || source.kind === 'manual';
}

/**
 * Pauses in a recorded run, as [from, to] epoch ms: gaps in the track longer
 * than `gapS`. The recorder stops logging points while paused, so a gap is a
 * pause; Health Connect then shows moving time, as the app does.
 */
export function pausesFrom(points: Array<{ ts: number }>, gapS = 15): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].ts;
    const b = points[i].ts;
    if (b - a > gapS * 1000) out.push([a, b]);
  }
  return out;
}

/** One running session as the native side reads it. */
export interface HealthSession {
  id: string;
  app: string;
  title: string | null;
  treadmill: boolean;
  startedAt: number;
  endedAt: number;
  movingS: number;
  distanceM: number | null;
  climbM: number | null;
  heart: Array<[number, number]>;
}

/** A Health Connect session as an imported run: no track, the app's own totals, and its record id for de-duplication. */
export function sessionToRun(s: HealthSession): ImportedRun {
  return {
    segments: [],
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    distanceM: s.distanceM != null && s.distanceM > 0 ? s.distanceM : null,
    movingS: s.movingS > 0 ? s.movingS : (s.endedAt - s.startedAt) / 1000,
    elevationGainM: s.climbM != null && s.climbM >= 0 ? s.climbM : 0,
    sport: 'running',
    name: s.title,
    externalId: `health:${s.id}`,
    heart: s.heart.filter(([, bpm]) => plausibleBpm(bpm)).map(([ts, bpm]) => ({ ts, bpm: Math.round(bpm) })),
  };
}

/** The app that saved it, for the "Brought in from" line: a known name, or the package name. */
export function appName(pkg: string): string {
  const known: Record<string, string> = {
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.google.android.apps.fitness': 'Google Fit',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.strava': 'Strava',
    'com.nike.plusgps': 'Nike Run Club',
    'com.coros.coros': 'COROS',
    'com.huawei.health': 'Huawei Health',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.suunto.android': 'Suunto',
    'fi.polar.polarflow': 'Polar Flow',
    'com.withings.wiscale2': 'Withings',
    'com.oura.android': 'Oura',
    'com.runtastic.android': 'adidas Running',
  };
  return known[pkg] ?? pkg;
}
