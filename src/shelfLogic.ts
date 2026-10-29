import type { PodcastApp } from './types';

// The Listen tab's rules, kept free of React Native so `npm run test:shelf` can
// check them in Node. The data comes from scripts/build-shelf.mjs.

export type Group = 'quiet' | 'stories' | 'learn' | 'start';

export interface Episode {
  title: string;
  date: string; // YYYY-MM-DD
  min: number | null;
}

export interface Show {
  id: number;
  name: string;
  by: string;
  feed: string;
  apple: string;
  episodes: number | null;
  lang: string | null;
  latest: Episode[];
  groups?: Group[];
  since?: number | null;
  why?: string;
}

export interface Offer {
  id: string;
  sponsor: string;
  title: string;
  text: string;
  code: string | null;
  url: string;
  topics: string[];
  countries: string[]; // 'all' or storefront codes
  until: string; // YYYY-MM-DD, last day shown
}

export interface Shelf {
  version: number;
  builtAt: string;
  curated: Show[];
  regions: Record<string, Show[]>;
  offers: Offer[];
}

export const GROUPS: Array<{ key: Group; label: string; hint: string }> = [
  { key: 'quiet', label: 'Quiet company', hint: 'For easy runs. Company that asks nothing back.' },
  { key: 'stories', label: 'Stories', hint: 'For long runs. People who went somewhere, inside or out.' },
  { key: 'learn', label: 'Learn something', hint: 'Science and training, told without shouting.' },
  { key: 'start', label: 'First steps', hint: "For people who don't call themselves runners yet." },
];

export const OFFER_TOPICS = ['Road shoes', 'Trail', 'Anti-chafe', 'Night running', 'Rain', 'Watches'];

/** "tr-TR" → { lang: 'tr', region: 'tr' }. Some phones report only a language. */
export function parseLocale(locale: string): { lang: string; region: string | null } {
  const parts = locale.replace('_', '-').split('-');
  const lang = (parts[0] || 'en').toLowerCase();
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  return { lang, region: region ? region.toLowerCase() : null };
}

/**
 * Which country's shows to offer. A choice in Settings wins; then the phone's
 * region; then the country with the most shows in the phone's language. Worked out on
 * the phone, so the download never says where anyone is.
 */
export function pickCountry(shelf: Pick<Shelf, 'regions'>, locale: string, override: string | null): string | null {
  if (override && shelf.regions[override]) return override;
  const { lang, region } = parseLocale(locale);
  if (region && shelf.regions[region]) return region;
  let best: string | null = null;
  let most = 0;
  for (const [cc, shows] of Object.entries(shelf.regions)) {
    const n = shows.filter((s) => s.lang === lang).length;
    if (n > most) [best, most] = [cc, n];
  }
  return best;
}

/** Local shows minus anything already in the hand-picked list. */
export function localShows(shelf: Shelf, cc: string | null): Show[] {
  if (!cc) return [];
  const picked = new Set(shelf.curated.map((s) => s.id));
  return (shelf.regions[cc] ?? []).filter((s) => !picked.has(s.id));
}

export function inGroup(shows: Show[], g: Group): Show[] {
  return shows.filter((s) => s.groups?.includes(g));
}

/** Median of recent run lengths in minutes, or null with fewer than three runs. */
export function usualRunMin(durationsS: number[]): number | null {
  const d = durationsS.filter((s) => s > 5 * 60).slice(0, 10).sort((a, b) => a - b);
  if (d.length < 3) return null;
  const mid = Math.floor(d.length / 2);
  const s = d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
  return Math.round(s / 60);
}

/** An episode "fits" when it ends within a few minutes either side of a usual run. */
export function fitsRun(episodeMin: number | null, usualMin: number | null): boolean {
  if (episodeMin == null || usualMin == null) return false;
  return Math.abs(episodeMin - usualMin) <= Math.max(5, usualMin * 0.2);
}

export function offersFor(offers: Offer[], cc: string | null, today: string): Offer[] {
  return offers.filter((o) => o.until >= today && (o.countries.includes('all') || (cc != null && o.countries.includes(cc))));
}

/** Topic picks narrow the list; with none picked, everything shows. */
export function filterOffers(offers: Offer[], topics: string[]): Offer[] {
  if (!topics.length) return offers;
  return offers.filter((o) => o.topics.some((t) => topics.includes(t)));
}

export const PODCAST_APPS: Array<{ key: PodcastApp; label: string; ios: boolean; android: boolean }> = [
  { key: 'apple', label: 'Apple Podcasts', ios: true, android: false },
  { key: 'spotify', label: 'Spotify', ios: true, android: true },
  { key: 'youtube', label: 'YouTube Music', ios: true, android: true },
  { key: 'pocketcasts', label: 'Pocket Casts', ios: true, android: true },
  { key: 'antennapod', label: 'AntennaPod', ios: false, android: true },
  { key: 'share', label: 'Another app (share the feed)', ios: true, android: true },
];

/**
 * The link that opens a show in the runner's own app. Spotify and YouTube Music
 * have no public id we can map to, so they open a search for the show's name.
 * 'share' returns null: the caller hands the feed to the share sheet instead.
 */
export function showLink(app: PodcastApp, show: Pick<Show, 'id' | 'name' | 'feed'>): string | null {
  const q = encodeURIComponent(show.name);
  switch (app) {
    case 'apple':
      return `https://podcasts.apple.com/podcast/id${show.id}`;
    case 'spotify':
      return `https://open.spotify.com/search/${q}/podcasts`;
    case 'youtube':
      return `https://music.youtube.com/search?q=${q}`;
    case 'pocketcasts':
      return `https://pca.st/itunes/${show.id}`;
    case 'antennapod':
      return `https://antennapod.org/deeplink/subscribe?url=${encodeURIComponent(show.feed)}&title=${q}`;
    case 'share':
      return null;
  }
}

/** Light sanity check on a downloaded shelf before it replaces the stored one. */
export function isShelf(x: unknown): x is Shelf {
  const s = x as Shelf;
  return !!s && s.version === 1 && Array.isArray(s.curated) && s.curated.length > 0 && typeof s.regions === 'object' && Array.isArray(s.offers);
}
