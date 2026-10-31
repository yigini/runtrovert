// Direct links into the runner's podcast app, worked out by the daily shelf build so a
// phone never has to search. Everything here runs on GitHub, never on a phone.
//
// - Apple Podcasts: episode ids come from Apple's public lookup (no key). See build-shelf.mjs.
// - Spotify: the official Web API with app-only credentials (SPOTIFY_CLIENT_ID and
//   SPOTIFY_CLIENT_SECRET repository secrets). No runner ever signs in.
// - YouTube Music: the official YouTube Data API (YOUTUBE_API_KEY secret). A show is a
//   playlist YouTube marks as a podcast; an episode is a video in it.
//
// Without a key that service is skipped and the app says "Search in …" instead.
// Matches found earlier are carried over from yesterday's shelf, and misses are retried
// after RETRY_DAYS, so the daily YouTube quota (10,000 units, 100 per search) holds.

const RETRY_DAYS = 14;
// Bump when YouTube matching changes, so every miss is searched again once.
const YT_MATCHER = 2;
const YT_SEARCHES_PER_RUN = 60;

/** Lowercase, no accents, no punctuation, no leading "the", no trailing "podcast"/"show". */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/( the)? (podcast|show|pod)$/, '')
    .trim();
}

/** Same show, by name. Strict on purpose: a wrong show is worse than a search. */
export function sameShow(a, b) {
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1));

/**
 * The candidate whose title is this episode's: equal after norm(), or sharing at least
 * 80% of their words (hosts add "EP99 |" or a guest's name). Null when unsure.
 */
export function matchEpisode(title, candidates) {
  const t = norm(title);
  if (!t) return null;
  const exact = candidates.find((c) => norm(c.title) === t);
  if (exact) return exact.id;
  const a = words(title);
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const b = words(c.title);
    if (!a.size || !b.size) continue;
    let both = 0;
    for (const w of a) if (b.has(w)) both++;
    const score = both / Math.max(a.size, b.size);
    if (score > bestScore) [best, bestScore] = [c.id, score];
  }
  return bestScore >= 0.8 ? best : null;
}

/** Puts episode ids from a service onto the show's latest episodes, where titles match. */
export function tagEpisodes(latest, candidates, key) {
  for (const ep of latest) {
    const id = matchEpisode(ep.title, candidates);
    if (id) ep[key] = id;
  }
}

async function getJson(url, init) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      console.warn(`${new URL(url).host}: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`${new URL(url).host}: ${e.message}`);
    return null;
  }
}

// ---- Spotify -------------------------------------------------------------------------

let spotifyToken = null;
async function spotify(path) {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return null;
  if (!spotifyToken) {
    const tok = await getJson('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    spotifyToken = tok?.access_token ?? '';
  }
  if (!spotifyToken) return null;
  return getJson(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${spotifyToken}` } });
}

async function spotifyShow(name, market) {
  const json = await spotify(`search?type=show&limit=10&market=${market.toUpperCase()}&q=${encodeURIComponent(name)}`);
  return json?.shows?.items?.find((s) => s && sameShow(s.name, name))?.id ?? null;
}

async function spotifyEpisodes(showId, market) {
  const json = await spotify(`shows/${showId}/episodes?limit=10&market=${market.toUpperCase()}`);
  return (json?.items ?? []).filter(Boolean).map((e) => ({ id: e.id, title: e.name }));
}

// ---- YouTube Music -------------------------------------------------------------------

async function youtube(path) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  return getJson(`https://www.googleapis.com/youtube/v3/${path}&key=${key}`);
}

let ytSearches = 0;
async function youtubeShow(name) {
  if (ytSearches >= YT_SEARCHES_PER_RUN) return undefined; // out of budget: try tomorrow
  ytSearches++;
  const found = await youtube(`search?part=snippet&type=playlist&maxResults=10&q=${encodeURIComponent(name)}`);
  if (!found) return undefined;
  // The playlist named after the show, or any playlist on a channel named after it
  // (many shows call their podcast playlist "Full episodes"). Name matches first.
  const items = found.items ?? [];
  const ids = [
    ...items.filter((i) => sameShow(i.snippet?.title, name)),
    ...items.filter((i) => !sameShow(i.snippet?.title, name) && sameShow(i.snippet?.channelTitle, name)),
  ]
    .map((i) => i.id?.playlistId)
    .filter(Boolean);
  if (!ids.length) return null;
  const lists = await youtube(`playlists?part=status&id=${ids.join(',')}`);
  // Only a playlist YouTube itself treats as a podcast; any other playlist could be a fan's.
  const podcasts = new Set((lists?.items ?? []).filter((p) => p.status?.podcastStatus === 'enabled').map((p) => p.id));
  return ids.find((id) => podcasts.has(id)) ?? null;
}

async function youtubeEpisodes(playlistId) {
  const json = await youtube(`playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}`);
  return (json?.items ?? []).map((i) => ({ id: i.snippet?.resourceId?.videoId, title: i.snippet?.title })).filter((e) => e.id);
}

// ---- Putting it together -------------------------------------------------------------

/**
 * Yesterday's matches, by Apple id, so most shows need no search today. Episode ids
 * ride along under `episodes` (title → ids), so a build without keys, like the copy
 * shipped inside the app, still opens the exact episode.
 */
export function rememberLinks(previous) {
  const known = new Map();
  if (!previous) return known;
  for (const s of [...(previous.curated ?? []), ...Object.values(previous.regions ?? {}).flat()]) {
    if (!s?.links) continue;
    const episodes = {};
    for (const e of s.latest ?? []) if (e.yt || e.spotify) episodes[e.title] = { yt: e.yt, spotify: e.spotify };
    known.set(s.id, { ...s.links, episodes });
  }
  return known;
}

const due = (checked, today) => !checked || Date.parse(today) - Date.parse(checked) >= RETRY_DAYS * 86400000;

/** Episode ids found yesterday, for episodes still in today's list. */
export function carryEpisodes(latest, episodes) {
  for (const ep of latest) {
    const was = episodes?.[ep.title];
    if (!was) continue;
    if (was.yt && !ep.yt) ep.yt = was.yt;
    if (was.spotify && !ep.spotify) ep.spotify = was.spotify;
  }
}

/**
 * Adds `links` ({ spotify, yt, checked }) to each show and service ids to its latest
 * episodes. `market` is the storefront the show was found in. Never throws.
 */
export async function linkShow(show, market, known, today) {
  const { episodes, ...prev } = known.get(show.id) ?? {};
  const links = { ...prev };
  carryEpisodes(show.latest, episodes);
  try {
    if (process.env.SPOTIFY_CLIENT_ID) {
      if (!links.spotify && due(prev.spotifyChecked, today)) {
        links.spotify = (await spotifyShow(show.name, market)) ?? undefined;
        links.spotifyChecked = today;
      }
      if (links.spotify) tagEpisodes(show.latest, await spotifyEpisodes(links.spotify, market), 'spotify');
    }
    if (process.env.YOUTUBE_API_KEY) {
      if (!links.yt && (prev.ytv !== YT_MATCHER || due(prev.ytChecked, today))) {
        const yt = await youtubeShow(show.name);
        if (yt !== undefined) {
          links.yt = yt ?? undefined;
          links.ytChecked = today;
          links.ytv = YT_MATCHER;
        }
      }
      if (links.yt) tagEpisodes(show.latest, await youtubeEpisodes(links.yt), 'yt');
    }
  } catch (e) {
    console.warn(`links ${show.id}: ${e.message}`);
  }
  for (const k of Object.keys(links)) if (links[k] == null) delete links[k];
  if (Object.keys(links).length) show.links = links;
  else delete show.links;
}
