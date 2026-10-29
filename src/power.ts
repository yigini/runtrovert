/**
 * Battery management.
 *
 * GPS is by far the biggest drain during a run, then the screen, then the map.
 * We pick one of two GPS profiles:
 *   best  – 1 Hz navigation-grade fixes. Most accurate splits.
 *   saver – ~3 s fixes at "high" (not navigation) accuracy, 3 m distance gate.
 *           The Kalman filter copes with the wider spacing; distance on a
 *           steady run stays within about 1% (npm run sim:gps).
 * In "auto" we use best until the battery is low or the phone is in its own
 * low-power mode, then switch, mid-run if needed, and say so once.
 */
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import type { BatteryMode } from './types';

export type GpsProfileName = 'best' | 'saver';

export interface GpsProfile {
  name: GpsProfileName;
  accuracy: Location.Accuracy;
  timeIntervalMs: number;
  distanceIntervalM: number;
}

export const GPS_PROFILES: Record<GpsProfileName, GpsProfile> = {
  best: { name: 'best', accuracy: Location.Accuracy.BestForNavigation, timeIntervalMs: 1000, distanceIntervalM: 0 },
  saver: { name: 'saver', accuracy: Location.Accuracy.High, timeIntervalMs: 3000, distanceIntervalM: 3 },
};

/** At or below this level "auto" switches to saver. */
export const LOW_BATTERY = 0.25;

export interface PowerReading {
  level: number | null; // 0–1, null if unknown (simulator)
  lowPowerMode: boolean;
}

export async function readPower(): Promise<PowerReading> {
  try {
    const s = await Battery.getPowerStateAsync();
    const level = s.batteryLevel >= 0 ? s.batteryLevel : null;
    return { level, lowPowerMode: !!s.lowPowerMode };
  } catch {
    return { level: null, lowPowerMode: false };
  }
}

export function profileFor(mode: BatteryMode, power: PowerReading): GpsProfile {
  if (mode === 'best') return GPS_PROFILES.best;
  if (mode === 'saver') return GPS_PROFILES.saver;
  const low = power.lowPowerMode || (power.level != null && power.level <= LOW_BATTERY);
  return low ? GPS_PROFILES.saver : GPS_PROFILES.best;
}
