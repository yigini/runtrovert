import type { LatLon } from './types';
import { decimal } from './i18n/lang';

const R = 6371000; // metres
export const MILE_M = 1609.344;

/** Great-circle distance in metres between two points. */
export function haversine(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number, km = true): string {
  if (km) {
    if (m < 1000) return `${Math.round(m)} m`;
    return `${decimal((m / 1000).toFixed(2))} km`;
  }
  const mi = m / MILE_M;
  return `${decimal(mi.toFixed(2))} mi`;
}

/** Just the number, for big displays: "4.21" */
export function formatDistanceNumber(m: number, km = true): string {
  return decimal(km ? (m / 1000).toFixed(2) : (m / MILE_M).toFixed(2));
}

export function distanceUnit(km = true): string {
  return km ? 'km' : 'mi';
}

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Pace as min per unit, e.g. "5:32". Returns "–" when there is no meaningful data. */
export function formatPace(distanceM: number, durationS: number, km = true): string {
  if (distanceM < 50 || durationS < 10) return '–';
  const unit = km ? 1000 : MILE_M;
  const secPerUnit = durationS / (distanceM / unit);
  if (!isFinite(secPerUnit) || secPerUnit > 60 * 60) return '–';
  return minSec(secPerUnit);
}

/** Instantaneous pace from a speed in m/s. */
export function formatSpeedAsPace(mps: number, km = true): string {
  if (!mps || mps < 0.5) return '–';
  const unit = km ? 1000 : MILE_M;
  const secPerUnit = unit / mps;
  if (secPerUnit > 60 * 60) return '–';
  return minSec(secPerUnit);
}

export function formatElevation(m: number, km = true): string {
  return km ? `${Math.round(m)} m` : `${Math.round(m * 3.28084)} ft`;
}

/** Rough calories for running: ~1 kcal per kg per km, assuming 70 kg until weight is a setting. */
export function estimateCalories(distanceM: number, weightKg = 70): number {
  return Math.round((distanceM / 1000) * weightKg * 1.0);
}

/** m:ss, rounded to the whole second first so 5:59.6 reads 6:00, never 5:60. */
export function minSec(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
