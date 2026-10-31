import assert from 'node:assert/strict';
import { checkOffer, cleanUrl, parseFeedHead, speaks } from './build-shelf.mjs';
import { carryEpisodes, matchEpisode, norm, rememberLinks, sameShow, tagEpisodes } from './podcast-links.mjs';
import { coverFileName, coverQueue, coverUrl } from '../src/coverLogic.ts';
import { filterOffers, fitsRun, freshEpisodes, whenLabel, localShows, offersFor, parseLocale, openTarget, pickCountry, showLink, usualRunMin, type Shelf, type Show } from '../src/shelfLogic.ts';

// Rules for the Listen tab and Kit & offers. Run: npm run test:shelf

const show = (id: number, lang: string): Show => ({ id, name: `Show ${id}`, by: '', feed: `https://f/${id}`, apple: '', episodes: 50, lang, latest: [] });
const shelf: Shelf = {
  version: 1,
  builtAt: '2026-10-29T04:30:00Z',
  curated: [show(1, 'en')],
  regions: { tr: [show(10, 'tr')], at: [show(30, 'de')], de: [show(20, 'de'), show(21, 'de'), show(1, 'en')] },
  offers: [],
};

// Locale and country
assert.deepEqual(parseLocale('tr-TR'), { lang: 'tr', region: 'tr' });
assert.deepEqual(parseLocale('zh-Hant-TW'), { lang: 'zh', region: 'tw' });
assert.deepEqual(parseLocale('de'), { lang: 'de', region: null });
assert.equal(pickCountry(shelf, 'tr-TR', null), 'tr');
assert.equal(pickCountry(shelf, 'tr-TR', 'at'), 'at', 'a choice in Settings wins');
assert.equal(pickCountry(shelf, 'tr-TR', 'xx'), 'tr', 'an unknown choice falls back');
assert.equal(pickCountry(shelf, 'de-CH', null), 'de', 'no Swiss list: any German-speaking country');
assert.equal(pickCountry(shelf, 'fr-FR', null), null);
assert.deepEqual(localShows(shelf, 'de').map((s) => s.id), [20, 21], 'hand-picked shows are not repeated');

// "Fits your usual run"
assert.equal(usualRunMin([1800, 2400]), null, 'needs three runs');
assert.equal(usualRunMin([1800, 2400, 3000, 100]), 40, 'median, ignoring stubs under 5 min');
assert.equal(fitsRun(44, 40), true);
assert.equal(fitsRun(55, 40), false);
assert.equal(fitsRun(null, 40), false);

// Links to podcast apps
assert.equal(showLink('apple', { id: 5, name: 'A', feed: 'x' }), 'https://podcasts.apple.com/podcast/id5');
assert.equal(showLink('spotify', { id: 5, name: 'Running Commentary', feed: 'x' }), 'https://open.spotify.com/search/Running%20Commentary/podcasts');
assert.equal(showLink('antennapod', { id: 5, name: 'A', feed: 'https://f/a.xml' }), 'https://antennapod.org/deeplink/subscribe?url=https%3A%2F%2Ff%2Fa.xml&title=A');
assert.equal(showLink('share', { id: 5, name: 'A', feed: 'x' }), null);

// Offers: tracking stripped, bad offers rejected, expired and foreign ones hidden
assert.equal(cleanUrl('https://shop.example/shoe?utm_source=rt&size=42&ref=abc&fbclid=1#top'), 'https://shop.example/shoe?size=42');
assert.throws(() => cleanUrl('http://shop.example/'), /https/);
assert.throws(() => checkOffer({ id: 'a', sponsor: 'S', title: 'T', text: 'x', url: 'https://s.example', until: '2026-12-31' }, '2026-10-29'), /topics/);
const ok = checkOffer({ id: 'a', sponsor: 'S', title: 'T', text: 'x', url: 'https://s.example/?utm_x=1', topics: ['Trail'], countries: ['TR'], until: '2026-12-31' }, '2026-10-29');
assert.equal(ok.url, 'https://s.example/');
assert.deepEqual(ok.countries, ['tr']);
const offers = [ok, { ...ok, id: 'b', countries: ['all'], topics: ['Road shoes'] }, { ...ok, id: 'c', countries: ['all'], until: '2026-10-01' }];
assert.deepEqual(offersFor(offers, 'tr', '2026-10-29').map((o) => o.id), ['a', 'b']);
assert.deepEqual(offersFor(offers, 'de', '2026-10-29').map((o) => o.id), ['b']);
assert.deepEqual(filterOffers(offers, ['Road shoes']).map((o) => o.id), ['b']);
assert.equal(filterOffers(offers, []).length, 3, 'no picks shows everything');

// Feed parsing and language
const xml = `<rss><channel><title>X</title><language><![CDATA[tr-TR]]></language><item><title><![CDATA[Koşu &amp; hayat]]></title><pubDate>Thu, 29 Oct 2026 08:00:00 GMT</pubDate><itunes:duration>01:02:30</itunes:duration></item><item><title>Two</title><pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate><itunes:duration>2700</itunes:duration></item></channel></rss>`;
assert.deepEqual(parseFeedHead(xml), { lang: 'tr', latest: [{ title: 'Koşu & hayat', date: '2026-10-29', min: 63 }, { title: 'Two', date: '2026-10-26', min: 45 }] });
assert.equal(speaks(['tr'], 'tr', ''), true);
assert.equal(speaks(['tr'], 'ru', 'Бегу'), false);
assert.equal(speaks(['tr'], 'en', 'Koşver Gitsin'), true, 'hosts that stamp every feed "en"');
assert.equal(speaks(['tr'], 'en', 'Inside Running'), false);
assert.equal(speaks(['en'], 'en', ''), true);


// "New for your run": one episode per show, recent only, fitting ones first
const ep = (date: string, min: number | null) => ({ title: date, date, min });
const withEp = (id: number, ...latest: ReturnType<typeof ep>[]): Show => ({ ...show(id, 'en'), latest });
const fresh = freshEpisodes([withEp(1, ep('2026-10-28', 90)), withEp(2, ep('2026-10-20', 41)), withEp(3, ep('2026-09-01', 40)), withEp(4), withEp(1, ep('2026-10-29', 40))], '2026-10-29', 40);
assert.deepEqual(fresh.map((f) => f.show.id), [2, 1], 'fits first, old and empty shows left out, no repeats');
assert.equal(fresh[0].fits, true);
assert.equal(whenLabel('2026-10-29', '2026-10-29'), 'today');
assert.equal(whenLabel('2026-10-28', '2026-10-29'), 'yesterday');
assert.equal(whenLabel('2026-10-25', '2026-10-29'), '4 days ago');
assert.equal(whenLabel('2026-10-01', '2026-10-29'), '2026-10-01');

// Direct links: same show by name, strictly
assert.equal(norm('The Outside Podcast'), 'outside');
assert.equal(sameShow('Outside Podcast', 'The Outside Podcast'), true);
assert.equal(sameShow('Marathon Talk', 'Half Marathon Talk | FORDY RUNS Podcast'), false);
assert.equal(sameShow('Running Commentary', 'Love - running commentary version'), false);
assert.equal(sameShow('Koşu Saati', 'Kosu Saati'), true, 'accents do not matter');
assert.equal(sameShow('', ''), false);

// Episodes: exact after norm, or 80% of words in common
const cands = [{ id: 'a', title: 'EP99 | What Went Down In Chi-Town' }, { id: 'b', title: 'Sam Tomlinson' }];
assert.equal(matchEpisode('EP99 | What Went Down in Chi Town', cands), 'a');
assert.equal(matchEpisode('Sam Tomlinson', cands), 'b');
assert.equal(matchEpisode('Yorkshire Marathon 2026', cands), null);
assert.equal(matchEpisode('What Went Down In Chi-Town', cands), 'a', 'a dropped "EP99 |" still matches');
assert.equal(matchEpisode('Intervals: New and Improved', [{ id: 'x', title: 'Intervals: AIPI' }]), null, 'a shared series name is not enough');
const tagged = [{ title: 'Sam Tomlinson', date: '2026-10-26', min: 46 } as any, { title: 'Other', date: '2026-10-20', min: 30 } as any];
tagEpisodes(tagged, cands, 'spotify');
assert.equal(tagged[0].spotify, 'b');
assert.equal(tagged[1].spotify, undefined);
const remembered = rememberLinks({ curated: [{ id: 1, links: { yt: 'PL1' }, latest: [{ title: 'Ep 1', yt: 'V1' }, { title: 'Ep 0' }] }], regions: { tr: [{ id: 2 }] } });
assert.deepEqual([...remembered.entries()], [[1, { yt: 'PL1', episodes: { 'Ep 1': { yt: 'V1', spotify: undefined } } }]]);
const carried = [{ title: 'Ep 2', date: 'd', min: 1 } as any, { title: 'Ep 1', date: 'd', min: 1 } as any];
carryEpisodes(carried, remembered.get(1).episodes);
assert.equal(carried[1].yt, 'V1', "yesterday's episode id carries over without a key");
assert.equal(carried[0].yt, undefined);

// Where "Open" goes: episode, then show, then an honest search
const linked = { id: 5, name: 'Running Commentary', feed: 'x', links: { spotify: 'S1', yt: 'PL9' } };
const ep1 = { title: 't', date: '2026-10-29', min: 40, apple: 77, spotify: 'E1', yt: 'V1' };
assert.deepEqual(openTarget('apple', linked, ep1), { url: 'https://podcasts.apple.com/podcast/id5?i=77', kind: 'episode' });
assert.deepEqual(openTarget('spotify', linked, ep1), { url: 'https://open.spotify.com/episode/E1', kind: 'episode' });
assert.deepEqual(openTarget('youtube', linked, ep1), { url: 'https://music.youtube.com/watch?v=V1&list=PL9', kind: 'episode' });
assert.deepEqual(openTarget('youtube', linked), { url: 'https://music.youtube.com/playlist?list=PL9', kind: 'show' });
assert.deepEqual(openTarget('spotify', linked, { title: 't', date: 'd', min: null }), { url: 'https://open.spotify.com/show/S1', kind: 'show' });
assert.equal(openTarget('youtube', { id: 5, name: 'A B', feed: 'x' })?.kind, 'search');
assert.equal(openTarget('pocketcasts', linked, ep1)?.kind, 'show');
assert.equal(openTarget('share', linked, ep1), null);

// Covers: one bare file per show, fetched once even when asked for twice, three at a time
assert.equal(coverFileName(1083410032), '1083410032.jpg');
assert.equal(coverUrl('https://raw.githubusercontent.com/yigini/runtrovert/shelf/art/', 42), 'https://raw.githubusercontent.com/yigini/runtrovert/shelf/art/42.jpg');
assert.ok(!coverUrl('https://h/art/', 42).includes('?'));
{
  const q = coverQueue(3);
  let calls = 0;
  let peak = 0;
  let now = 0;
  const job = (v: string) => async () => {
    calls++;
    now++;
    peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
    return v;
  };
  const a = q('a', job('A'));
  const a2 = q('a', job('A2'));
  assert.equal(a, a2);
  const rest = ['b', 'c', 'd', 'e', 'f'].map((k) => q(k, job(k)));
  const failing = q('x', async () => {
    throw new Error('offline');
  });
  const out = await Promise.all([a, a2, ...rest, failing]);
  assert.deepEqual(out, ['A', 'A', 'b', 'c', 'd', 'e', 'f', null]);
  assert.equal(calls, 6);
  assert.ok(peak <= 3, `peak ${peak}`);
  assert.equal(await q('a', job('again')), 'again'); // a finished key can be asked for again
}

console.log('shelf: all checks pass');
