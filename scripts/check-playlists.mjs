// Checks every playlist in content/playlists.json against the service's public page
// and prints its live name. Run by hand before a release: npm run check:playlists.
// Uses only public, keyless pages (Spotify oEmbed, Deezer's public API, the
// playlists' own web pages).
import { readFile } from 'node:fs/promises';

const { moods } = JSON.parse(await readFile(new URL('../content/playlists.json', import.meta.url), 'utf8'));
const UA = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const text = (url) => fetch(url, UA).then((r) => (r.ok ? r.text() : ''), () => '');
const og = (html) => html.match(/property="og:title" content="([^"]*)"/)?.[1] ?? html.match(/<title>([^<]*)/)?.[1] ?? '';

async function live(app, p) {
  switch (app) {
    case 'spotify':
      return JSON.parse((await text(`https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${p.id}`)) || '{}').title ?? '';
    case 'deezer':
      return JSON.parse((await text(`https://api.deezer.com/playlist/${p.id}`)) || '{}').title ?? '';
    case 'ytmusic': {
      const t = og(await text(`https://www.youtube.com/playlist?list=${p.id}`));
      return t === 'undefined' ? '' : t;
    }
    case 'apple':
      return og(await text(`https://music.apple.com/us/playlist/${p.slug}/${p.id}`)).replace(/^‎?/, '').replace(/ - Playlist - Apple Music$/, '');
  }
  return '';
}

let bad = 0;
for (const m of moods) {
  for (const [app, p] of Object.entries(m.links)) {
    const name = await live(app, p);
    const flat = (x) => x.toLowerCase().replace(/[\u2019']/g, "'");
    const ok = name && flat(name).includes(flat(p.title));
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${m.key.padEnd(5)} ${app.padEnd(7)} ${p.title} → ${name || '(gone)'}`);
  }
}
if (bad) {
  console.error(`${bad} playlist(s) to replace`);
  process.exit(1);
}
