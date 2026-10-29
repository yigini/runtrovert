import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { loadValue, saveValue } from './db';
import type { LatLon } from './types';

/**
 * Where you last were, so a map with no route (a 0 m run, a run whose fixes
 * never settled) opens on your streets instead of the whole world. Kept on the
 * phone only, like everything else.
 */
const KEY = 'place.last';
let memo: LatLon | null = null;
let savedAt = 0;

/** Called with live fixes; written down at most once a minute. */
export function rememberPlace(p: LatLon): void {
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return;
  memo = p;
  const now = Date.now();
  if (now - savedAt < 60_000) return;
  savedAt = now;
  saveValue(KEY, p).catch(() => {});
}

/** Best guess at where you are: this session, then the saved one, then the phone's last fix. */
export async function lastPlace(): Promise<LatLon | null> {
  if (memo) return memo;
  const saved = await loadValue<LatLon>(KEY).catch(() => null);
  if (saved) {
    memo = saved;
    return saved;
  }
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos) return null;
    const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    rememberPlace(p);
    return p;
  } catch {
    return null;
  }
}

/** lastPlace() for a component; only looks it up when `needed`. */
export function useLastPlace(needed: boolean): LatLon | null {
  const [place, setPlace] = useState<LatLon | null>(memo);
  useEffect(() => {
    if (!needed || place) return;
    let live = true;
    lastPlace().then((p) => {
      if (live && p) setPlace(p);
    });
    return () => {
      live = false;
    };
  }, [needed]);
  return place;
}
