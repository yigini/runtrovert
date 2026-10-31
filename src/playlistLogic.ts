// Running playlists that open straight in the runner's music app. The ids live in
// content/playlists.json and ship inside the app: nothing is fetched to show them,
// and opening one is the music app's business, signed in as the runner already is.

export type MoodKey = 'easy' | 'long' | 'tempo' | 'fast';

export interface PlaylistLink {
  id: string;
  title: string;
  /** Apple Music only: the readable part of the URL. */
  slug?: string;
}

export interface Mood {
  key: MoodKey;
  /** Words for a search, in apps we have no playlist for. */
  search: string;
  links: Partial<Record<string, PlaylistLink>>;
}

export interface PlaylistTarget {
  url: string;
  kind: 'playlist' | 'search';
  /** The playlist's own name, when it is one. */
  title?: string;
}

const enc = encodeURIComponent;

/**
 * Where a mood opens in a music app (keys as in src/music.ts): the exact playlist
 * when we have one, a search in that app when we don't, null for apps that take
 * neither (the caller then just opens the app).
 */
export function playlistTarget(mood: Mood, app: string | null): PlaylistTarget | null {
  if (!app) return null;
  const p = mood.links[app];
  if (p) {
    switch (app) {
      case 'spotify':
        return { url: `https://open.spotify.com/playlist/${p.id}`, kind: 'playlist', title: p.title };
      case 'ytmusic':
        return { url: `https://music.youtube.com/playlist?list=${p.id}`, kind: 'playlist', title: p.title };
      case 'apple':
        return { url: `https://music.apple.com/us/playlist/${p.slug ?? 'playlist'}/${p.id}`, kind: 'playlist', title: p.title };
      case 'deezer':
        return { url: `https://www.deezer.com/playlist/${p.id}`, kind: 'playlist', title: p.title };
    }
  }
  const q = mood.search;
  switch (app) {
    case 'spotify':
      return { url: `https://open.spotify.com/search/${enc(q)}/playlists`, kind: 'search' };
    case 'ytmusic':
      return { url: `https://music.youtube.com/search?q=${enc(q)}`, kind: 'search' };
    case 'apple':
      return { url: `https://music.apple.com/us/search?term=${enc(q)}`, kind: 'search' };
    case 'deezer':
      return { url: `https://www.deezer.com/search/${enc(q)}/playlist`, kind: 'search' };
    case 'amazon':
      return { url: `https://music.amazon.com/search/${enc(q)}`, kind: 'search' };
    case 'tidal':
      return { url: `https://tidal.com/search?q=${enc(q)}`, kind: 'search' };
    case 'soundcloud':
      return { url: `https://soundcloud.com/search/sets?q=${enc(q)}`, kind: 'search' };
  }
  return null;
}

export function isMood(x: unknown): x is Mood {
  const m = x as Mood;
  return !!m && typeof m.key === 'string' && typeof m.search === 'string' && typeof m.links === 'object';
}
