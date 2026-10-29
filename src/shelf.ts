import { loadValue, saveValue } from './db';
import { isShelf, type Shelf } from './shelfLogic';
import bundled from './shelfBundled.json';

// The Listen list. The app ships with a copy (src/shelfBundled.json) and, if the
// runner says yes, swaps it for the newest one when they open the Listen tab. That
// file is built every morning by .github/workflows/shelf.yml and holds every country,
// so the request carries no location, no id and no cookie: GitHub sees a download
// and nothing else. Nothing is fetched until the tab is opened.

export const SHELF_URL = 'https://raw.githubusercontent.com/yigini/runtrovert/shelf/shelf.json';

const KEY = 'shelf';
const FRESH_MS = 12 * 3600 * 1000;

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

/** Download today's list if the stored one is older than half a day. Never throws. */
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
