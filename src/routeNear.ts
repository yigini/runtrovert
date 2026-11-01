import * as Location from 'expo-location';
import { distanceToRoute, type Pt } from './routeFollow';

// Before following a route: is the runner anywhere near it? Only a fresh fix
// counts. The place remembered from last week's run could be another city,
// and guessing is worse than saying we don't know.

async function hereNow(): Promise<Pt | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }).catch(() => null);
    const pos =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]));
    return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Metres from here to the nearest part of the route; null when the phone can't say where here is. */
export async function howFarFromRoute(path: Pt[]): Promise<number | null> {
  const here = await hereNow();
  return here ? distanceToRoute(here, path) : null;
}
