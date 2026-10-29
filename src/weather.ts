import * as Location from 'expo-location';
import { loadValue, saveValue } from './db';
import { parse, type Weather } from './forecast';

export type { Hour, Sky, Weather } from './forecast';

// The local sky, for the home screen. Besides map tiles and the opt-in Listen list
// (src/shelf.ts) this is the app's one network call: a location rounded to ~1 km goes to Open-Meteo (no key, no account, no
// cookies) and a forecast comes back. Nothing else is sent, and it can be
// switched off in Settings. The last reading is kept on the phone so the
// home screen never waits on the network.

export type WeatherResult =
  | { kind: 'ok'; weather: Weather; stale: boolean }
  | { kind: 'no-permission' }
  | { kind: 'off' }
  | { kind: 'unavailable' };

const KEY = 'weather';
const FRESH_MS = 30 * 60 * 1000;
const USABLE_MS = 6 * 3600 * 1000; // an old reading is better than nothing, up to a point

/** Round to two decimals (~1 km): enough for a forecast, too coarse to find a front door. */
function coarse(n: number): number {
  return Math.round(n * 100) / 100;
}

async function position(ask: boolean): Promise<{ lat: number; lon: number } | 'no-permission' | null> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return 'no-permission';
  const last = await Location.getLastKnownPositionAsync({ maxAge: 3 * 3600 * 1000 }).catch(() => null);
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null));
  if (!pos) return null;
  return { lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude) };
}

export async function fetchForecast(lat: number, lon: number): Promise<Weather> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,is_day' +
    '&daily=sunrise,sunset&timezone=auto&timeformat=unixtime&forecast_days=2';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    return parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Cached reading if there is one, fresh enough to show straight away. */
export async function cachedWeather(): Promise<Weather | null> {
  const w = await loadValue<Weather>(KEY).catch(() => null);
  return w && Date.now() - w.fetchedAt < USABLE_MS ? w : null;
}

/**
 * The current sky. Uses the stored reading while it's fresh, otherwise asks
 * Open-Meteo. `ask` lets a tap trigger the location prompt; on open we never
 * pop a permission dialog uninvited.
 */
export async function getWeather({ enabled, ask = false, force = false }: { enabled: boolean; ask?: boolean; force?: boolean }): Promise<WeatherResult> {
  if (!enabled) return { kind: 'off' };
  const cached = await cachedWeather();
  if (cached && !force && Date.now() - cached.fetchedAt < FRESH_MS) return { kind: 'ok', weather: cached, stale: false };
  const pos = await position(ask).catch(() => null);
  if (pos === 'no-permission') return cached ? { kind: 'ok', weather: cached, stale: true } : { kind: 'no-permission' };
  if (!pos) return cached ? { kind: 'ok', weather: cached, stale: true } : { kind: 'unavailable' };
  try {
    const weather = await fetchForecast(pos.lat, pos.lon);
    await saveValue(KEY, weather).catch(() => {});
    return { kind: 'ok', weather, stale: false };
  } catch {
    return cached ? { kind: 'ok', weather: cached, stale: true } : { kind: 'unavailable' };
  }
}
