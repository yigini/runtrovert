import type { Weather } from './forecast';

// Which background loop the sky gets. Every loop is someone running, nothing else. The home screen already writes its
// headline from the weather; the footage follows the same reading, so fog
// looks like fog and a hot day looks hot. Pure, so it runs under plain Node.
// The clips themselves are required in components/AmbientBackground.tsx.

export type Footage =
  | 'tree' // distant runner past a big tree, summer
  | 'sunset-beach' // runner along the surf, sun on the water
  | 'mist-beach' // grey beach, fog, runner from behind
  | 'snow-plain' // white field, one figure in blue
  | 'grey-path' // overcast park path, runner from behind
  | 'green-hill' // green slope, blue sky
  | 'rock-coast' // rocky shore, runner from behind
  | 'forest-path' // woodland path, runner from behind
  | 'green-tunnel' // summer trail under trees
  | 'dirt-road' // aerial, runner and long shadow on a farm track
  | 'field-pine' // aerial, one pine and a tiny runner
  | 'grey-beach' // overcast beach, runner in red
  | 'night-track' // floodlit track, black and white
  | 'seawall' // pale seawall from above, one runner
  | 'winter-city' // low sun, snowy street
  | 'grey-city' // wet city street, grey light
  | 'farm-aerial' // aerial, lanes between fields
  | 'trail-bridge' // legs on a forest footbridge
  | 'rice-field' // ripe paddy under a grey sky, runner from behind
  | 'park-trees' // bare park trees, runner in a hood
  | 'track-day' // empty red track, one runner far off
  | 'dirt-track'; // low aerial over a dirt track, big clouds

/** Pexels video ids, for assets/CREDITS.md. Licence: free use, no attribution required. */
export const PEXELS: Record<Footage, number> = {
  tree: 12000664,
  'sunset-beach': 7444958,
  'mist-beach': 8636806,
  'snow-plain': 7038131,
  'grey-path': 5114847,
  'green-hill': 15627765,
  'rock-coast': 5929358,
  'forest-path': 14936182,
  'green-tunnel': 15294983,
  'dirt-road': 15479756,
  'field-pine': 15479762,
  'grey-beach': 8637379,
  'night-track': 20540592,
  seawall: 13777117,
  'winter-city': 7218876,
  'grey-city': 5310959,
  'farm-aerial': 15928220,
  'trail-bridge': 5677457,
  'rice-field': 18274390,
  'park-trees': 7062128,
  'track-day': 8533455,
  'dirt-track': 15928226,
};

export type Scene = 'storm' | 'snow' | 'rain' | 'fog' | 'night' | 'dusk' | 'cold' | 'heat' | 'wind' | 'clear' | 'cloud';

/** Several loops per scene, rotated by day, so the same weather rarely shows the same picture twice running. */
const POOLS: Record<Scene, Footage[]> = {
  storm: ['grey-city', 'mist-beach'],
  snow: ['snow-plain', 'winter-city'],
  rain: ['grey-city', 'grey-path', 'mist-beach'],
  fog: ['mist-beach', 'grey-beach', 'forest-path'],
  night: ['night-track'],
  dusk: ['sunset-beach'],
  cold: ['winter-city', 'snow-plain', 'rock-coast', 'park-trees'],
  heat: ['dirt-road', 'field-pine', 'rice-field', 'dirt-track'],
  wind: ['rock-coast', 'grey-beach', 'farm-aerial', 'dirt-track', 'rice-field'],
  clear: ['tree', 'green-hill', 'dirt-road', 'field-pine', 'farm-aerial', 'rock-coast', 'green-tunnel', 'dirt-track', 'track-day'],
  cloud: ['grey-path', 'grey-beach', 'forest-path', 'green-tunnel', 'grey-city', 'park-trees', 'rice-field', 'track-day'],
};

/** Behind the motto, once. */
export const WELCOME: Footage = 'seawall';
/** Behind the countdown: runners already on their way. */
export const COUNTDOWN: Footage[] = ['trail-bridge', 'green-tunnel', 'forest-path'];

/** Same order of precedence as the headline in sky.ts, so words and picture agree. */
export function sceneFor(w: Weather | null, now = Date.now()): Scene {
  if (!w) {
    const h = new Date(now).getHours();
    if (h < 6 || h >= 21) return 'night';
    if (h >= 17) return 'dusk';
    return 'clear';
  }
  const rainSoon = (w.hours[0]?.rainP ?? 0) >= 60;
  const dusk = w.isDay && w.sunset != null && w.sunset - now < 60 * 60 * 1000;
  if (w.sky === 'storm') return 'storm';
  if (w.sky === 'snow') return 'snow';
  if (w.sky === 'rain' || w.sky === 'drizzle' || rainSoon) return 'rain';
  if (w.sky === 'fog') return 'fog';
  if (!w.isDay) return 'night';
  if (dusk) return 'dusk';
  if (w.feelsC <= 0) return 'cold';
  if (w.tempC >= 27) return 'heat';
  if (w.windKmh >= 30) return 'wind';
  if (w.sky === 'clear') return 'clear';
  return 'cloud';
}

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** One loop from the scene's pool, fixed for the day so the screen doesn't shuffle every time you open it. */
export function pickFootage(scene: Scene, seed: string): Footage {
  const pool = POOLS[scene];
  return pool[hash(seed + scene) % pool.length];
}

export function homeFootage(w: Weather | null, now = Date.now()): Footage {
  return pickFootage(sceneFor(w, now), new Date(now).toDateString());
}

export function countdownFootage(seed = Date.now()): Footage {
  return COUNTDOWN[hash(String(seed)) % COUNTDOWN.length];
}
