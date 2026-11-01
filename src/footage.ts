import type { Weather } from './forecast';

// Which background loop the sky gets. Every loop is running, filmed like a film: close or far, always calm. The home screen already writes its
// headline from the weather; the footage follows the same reading, so fog
// looks like fog and a hot day looks hot. Pure, so it runs under plain Node.
// The clips themselves are required in components/AmbientBackground.tsx.

export type Footage =
  | 'sunset-beach' // runner along the surf, sun on the water
  | 'mist-beach' // grey beach, fog, runner from behind
  | 'snow-plain' // white field, one figure in blue
  | 'grey-path' // overcast park path, runner from behind
  | 'rock-coast' // rocky shore, runner from behind
  | 'green-tunnel' // summer trail under trees
  | 'dirt-road' // aerial, runner and long shadow on a farm track
  | 'grey-beach' // overcast beach, runner in red
  | 'winter-city' // low sun, snowy street
  | 'trail-bridge' // legs on a forest footbridge
  | 'rice-field' // ripe paddy under a grey sky
  | 'park-trees' // bare park trees, runner in a hood
  | 'track-day' // empty red track, one runner far off
  | 'dirt-track' // low aerial over a dirt track, big clouds
  | 'leafy-lane' // aerial, one runner down a lane walled with trees
  | 'bare-woods' // bare spring woods, runner from behind
  | 'tree-avenue' // park path under tall trees
  | 'lake-side' // grey morning by a still lake, runner side on
  | 'glass-river' // low sun, glass wall by the river
  | 'night-park' // park at night under orange lamps
  | 'sunny-park' // low winter sun, bare trees, one runner through an empty city park
  | 'river-bridge' // grey morning, riverside boardwalk, bridge and skyline
  | 'sunset-water' // runner towards camera, sunset mirrored in wet sand
  | 'cobbles' // close on feet over sunlit cobbles
  | 'blade-stride' // close on a blade runner's stride by the sea
  | 'sun-trees' // low sun through a row of trees, a runner passing
  | 'sea-road' // seafront road in bright sun, slow motion
  | 'dark-forest' // deep woods, runner from behind, moody light

/** Pexels video ids, for assets/CREDITS.md. Licence: free use, no attribution required. */
export const PEXELS: Record<Footage, number> = {
  'sunset-beach': 7444958,
  'mist-beach': 8636806,
  'snow-plain': 7038131,
  'grey-path': 5114847,
  'rock-coast': 5929358,
  'green-tunnel': 15294983,
  'dirt-road': 15479756,
  'grey-beach': 8637379,
  'winter-city': 7218876,
  'trail-bridge': 5677457,
  'rice-field': 18274390,
  'park-trees': 7062128,
  'track-day': 8533455,
  'dirt-track': 15928226,
  'leafy-lane': 13947025,
  'bare-woods': 15508753,
  'tree-avenue': 8456972,
  'lake-side': 4065467,
  'glass-river': 8834377,
  'night-park': 3126162,
  'sunny-park': 7218851,
  'river-bridge': 5033913,
  'sunset-water': 7733300,
  cobbles: 3209242,
  'blade-stride': 6022795,
  'sun-trees': 853771,
  'sea-road': 16686655,
  'dark-forest': 13494091,
};

export type Scene = 'storm' | 'snow' | 'rain' | 'fog' | 'night' | 'dusk' | 'cold' | 'heat' | 'wind' | 'clear' | 'cloud';

/** Several loops per scene, rotated by day, so the same weather rarely shows the same picture twice running. */
const POOLS: Record<Scene, Footage[]> = {
  storm: ['mist-beach', 'dark-forest', 'river-bridge', 'grey-beach'],
  snow: ['snow-plain', 'winter-city'],
  rain: ['grey-path', 'mist-beach', 'river-bridge', 'dark-forest'],
  fog: ['mist-beach', 'grey-beach', 'tree-avenue', 'dark-forest'],
  night: ['night-park', 'dark-forest'],
  dusk: ['sunset-beach', 'sunset-water', 'sun-trees', 'glass-river'],
  cold: ['winter-city', 'snow-plain', 'rock-coast', 'park-trees', 'bare-woods', 'lake-side', 'sunny-park'],
  heat: ['dirt-road', 'rice-field', 'dirt-track', 'leafy-lane', 'sea-road', 'blade-stride'],
  wind: ['rock-coast', 'grey-beach', 'dirt-track', 'rice-field', 'bare-woods', 'blade-stride'],
  clear: ['green-tunnel', 'dirt-road', 'rock-coast', 'dirt-track', 'track-day', 'leafy-lane', 'bare-woods', 'glass-river', 'sunny-park', 'sun-trees', 'blade-stride', 'sea-road', 'cobbles'],
  cloud: ['grey-path', 'grey-beach', 'green-tunnel', 'park-trees', 'rice-field', 'track-day', 'tree-avenue', 'lake-side', 'river-bridge', 'dark-forest'],
};

/** Behind the motto, once. */
export const WELCOME: Footage = 'sunset-water';
/** Behind the countdown: runners already on their way. */
export const COUNTDOWN: Footage[] = ['cobbles', 'blade-stride', 'trail-bridge', 'green-tunnel', 'river-bridge'];

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

/** Close-ups and the odd showpiece: now and then one of these turns up on Home whatever the sky, as a small surprise. */
export const SURPRISE: Footage[] = ['cobbles', 'blade-stride', 'sunset-water', 'sea-road', 'sun-trees'];
/** Dark or wild skies keep their own pictures: a sunny close-up under a storm would look wrong. */
const NO_SURPRISE: Scene[] = ['night', 'storm', 'snow', 'rain'];

/**
 * Home gets a fresh loop every time you come back to it: still one that fits the sky, never the one you just saw,
 * and about one visit in six a surprise from SURPRISE. `rand` is Math.random in the app and fixed in tests.
 */
export function rotateFootage(scene: Scene, previous: Footage | null, rand: () => number = Math.random): Footage {
  const surprise = !NO_SURPRISE.includes(scene) && rand() < 1 / 6;
  const pool = (surprise ? SURPRISE : POOLS[scene]).filter((f) => f !== previous);
  const from = pool.length > 0 ? pool : POOLS[scene];
  return from[Math.floor(rand() * from.length) % from.length];
}

export function countdownFootage(seed = Date.now()): Footage {
  return COUNTDOWN[hash(String(seed)) % COUNTDOWN.length];
}
