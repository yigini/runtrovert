import type { ImageSourcePropType } from 'react-native';
import { loadValue, saveValue } from './db';
import { BUNDLED_ART } from './shelfArt';
import { isShelf, type Shelf, type Show } from './shelfLogic';
import bundled from './shelfBundled.json';

// The Listen list. The app ships with a copy (src/shelfBundled.json) and, if the
// runner says yes, swaps it for the newest one when they open the Listen tab. That
// file is built every morning by .github/workflows/shelf.yml and holds every country,
// so the request carries no location, no id and no cookie. Covers that didn't
// ship are fetched one per show as it comes on screen, which does tell GitHub
// which shows were scrolled past (the Privacy text says so). Nothing is fetched
// until the tab is opened.

export const SHELF_URL = 'https://raw.githubusercontent.com/yigini/runtrovert/shelf/shelf.json';

// Covers live beside the list. Hand-picked ones also ship inside the app.
export const ART_URL = 'https://raw.githubusercontent.com/yigini/runtrovert/shelf/art/';

/** A show's cover: the shipped one, else the published one when downloads are on, else none. */
export function coverFor(show: Show, online: boolean): ImageSourcePropType | null {
  const local = BUNDLED_ART[show.id];
  if (local) return local;
  return online && show.art ? { uri: `${ART_URL}${show.id}.jpg` } : null;
}

const KEY = 'shelf';
const FRESH_MS = 3 * 3600 * 1000; // the list changes daily and links fill in over a few runs; 150 KB is cheap

interface Stored {
  shelf: Shelf;
  fetchedAt: number;
}

const BUNDLED = bundled as Shelf;

/** The newest list on the phone: the last download, or the one that shipped. */
export async function storedShelf(): Promise<{ shelf: Shelf; fetchedAt: number | null }> {
  const s = await loadValue<Stored>(KEY).catch(() => null);
  if (s && isShelf(s.shelf) && s.shelf.builtAt >= BUNDLED.builtAt) return s;
  return { shelf: BUNDLED, fetchedAt: null };
}

/** Download today's list if the stored one is more than three hours old (or always, with force). Never throws. */
export async function refreshShelf(force = false): Promise<{ shelf: Shelf; fetchedAt: number | null }> {
  const current = await storedShelf();
  if (!force && current.fetchedAt && Date.now() - current.fetchedAt < FRESH_MS) return current;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(SHELF_URL, { signal: ctrl.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) return current;
    const shelf = await res.json();
    if (!isShelf(shelf)) return current;
    const stored = { shelf, fetchedAt: Date.now() };
    await saveValue(KEY, stored).catch(() => {});
    return stored;
  } catch {
    return current;
  } finally {
    clearTimeout(timer);
  }
}

/** The phone's language and region, e.g. "tr-TR". Read locally, never sent. */
export function phoneLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}
