import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMood, playlistTarget, type Mood } from '../src/playlistLogic.ts';

const data = JSON.parse(readFileSync(new URL('../content/playlists.json', import.meta.url), 'utf8'));
const moods: Mood[] = data.moods;
assert.deepEqual(moods.map((m) => m.key), ['easy', 'long', 'tempo', 'fast']);
for (const m of moods) {
  assert.ok(isMood(m), m.key);
  // Every mood has an exact playlist in the four apps we can link into.
  for (const app of ['spotify', 'ytmusic', 'apple', 'deezer']) {
    const t = playlistTarget(m, app);
    assert.equal(t?.kind, 'playlist', `${m.key} ${app}`);
    assert.ok(t!.url.startsWith('https://'), t!.url);
  }
  assert.equal(playlistTarget(m, 'tidal')?.kind, 'search');
  assert.equal(playlistTarget(m, null), null);
  assert.equal(playlistTarget(m, 'pocketcasts'), null);
}

const easy = moods[0];
assert.equal(playlistTarget(easy, 'spotify')!.url, 'https://open.spotify.com/playlist/37i9dQZF1DWZq91oLsHZvy');
assert.equal(playlistTarget(easy, 'ytmusic')!.url, 'https://music.youtube.com/playlist?list=RDCLAK5uy_nVuUr5N4xRc2E2btLSMnOwmSwrB5Dkhes');
assert.equal(playlistTarget(easy, 'apple')!.url, 'https://music.apple.com/us/playlist/jogging/pl.6763f5b24da04814b8c4e5667af7c335');
assert.equal(playlistTarget(easy, 'deezer')!.url, 'https://www.deezer.com/playlist/8958596262');
assert.equal(playlistTarget({ ...easy, links: {} }, 'spotify')!.url, 'https://open.spotify.com/search/easy%20running%20music/playlists');

console.log('playlists ok');
