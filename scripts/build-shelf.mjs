// Builds shelf.json for the Listen tab: the hand-picked shows in content/listen.json,
// the running podcasts people listen to in each country, and any sponsor offers.
//
// Runs daily in .github/workflows/shelf.yml, never on a phone. Everything it reads is
// public: Apple's podcast charts and lookup API (no key, no account) and the shows' own
// RSS feeds. The phone downloads the one finished file, so it never talks to Apple or to
// the podcast hosts, and it gets every country at once, so the request says nothing
// about where the runner lives.
//
//   node scripts/build-shelf.mjs [out.json]      (default: shelf.json)
//   SHELF_COUNTRIES=tr,de node scripts/build-shelf.mjs   (a quick partial run)
//   node scripts/build-shelf.mjs out/shelf.json --art=out/art   (covers for every show)
//   npm run shelf   (the copy the app ships with, plus the hand-picked covers in assets/)
//
// Covers: Apple's artwork, shrunk to small JPEGs and published next to shelf.json, so
// a phone loads them from the same place as the list and never from Apple.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Apple storefront → the languages a show's feed may be in to count as local.
// English shows from elsewhere already sit in the hand-picked list.
const COUNTRIES = {
  us: ['en'], gb: ['en'], ca: ['en', 'fr'], au: ['en'], nz: ['en'], ie: ['en'], za: ['en', 'af'], in: ['en', 'hi'],
  sg: ['en', 'zh'], ph: ['en', 'tl'], my: ['ms', 'en'],
  de: ['de'], at: ['de'], ch: ['de', 'fr', 'it'], fr: ['fr'], be: ['nl', 'fr'], nl: ['nl'], lu: ['fr', 'de', 'lb'],
  es: ['es', 'ca', 'eu', 'gl'], it: ['it'], pt: ['pt'], gr: ['el'], tr: ['tr'],
  se: ['sv'], no: ['no', 'nb', 'nn'], dk: ['da'], fi: ['fi', 'sv'], is: ['is'],
  pl: ['pl'], cz: ['cs'], sk: ['sk'], hu: ['hu'], ro: ['ro'], bg: ['bg'], hr: ['hr'], si: ['sl'], ee: ['et'], lv: ['lv'], lt: ['lt'], ua: ['uk'],
  mx: ['es'], ar: ['es'], cl: ['es'], co: ['es'], pe: ['es'], br: ['pt'],
  jp: ['ja'], kr: ['ko'], cn: ['zh'], tw: ['zh'], hk: ['zh', 'en'], th: ['th'], vn: ['vi'], id: ['id'],
  il: ['he'], ae: ['ar', 'en'], sa: ['ar'], eg: ['ar'],
};

const RUNNING_GENRE = 1551; // Apple Podcasts › Sports › Running
const PER_COUNTRY = 8;
const ACTIVE_DAYS = 60; // a show with nothing new in two months drops off until it's back
const MIN_EPISODES = 10; // enough to know it's a show, not a pilot

const UA = 'Runtrovert shelf builder (+https://github.com/yigini/runtrovert)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (res.ok) return await res.json();
      if (res.status !== 403 && res.status !== 429 && res.status < 500) return null;
    } catch {}
    await sleep(4000 * (i + 1)); // Apple's API throttles bursts; back off and try again
  }
  return null;
}

/** The first ~96 KB of a feed: enough for the channel's language and its newest items. */
async function feedHead(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 96 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    ctrl.abort();
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decode(s) {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&').replace(/&apos;|&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function minutes(raw) {
  if (!raw) return null;
  const parts = raw.trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const s = parts.length === 1 ? parts[0] : parts.reduce((acc, n) => acc * 60 + n, 0);
  return s > 0 ? Math.round(s / 60) : null;
}

export function parseFeedHead(xml) {
  const channel = xml.split(/<item[\s>]/)[0];
  const lang = decode(channel.match(/<language>([\s\S]*?)<\/language>/i)?.[1] ?? '').toLowerCase().slice(0, 2) || null;
  const items = xml
    .split(/<item[\s>]/)
    .slice(1, 3)
    .map((it) => {
      const title = it.match(/<title>([\s\S]*?)<\/title>/)?.[1];
      const date = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
      const ms = date ? Date.parse(date.trim()) : NaN;
      return title && Number.isFinite(ms)
        ? { title: decode(title).slice(0, 140), date: new Date(ms).toISOString().slice(0, 10), min: minutes(it.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/)?.[1]) }
        : null;
    })
    .filter(Boolean);
  return { lang, latest: items };
}

// Many hosting services stamp every feed "en" whatever the show speaks. When the feed
// says English (or nothing) but the storefront isn't English-speaking, look at the
// letters in the show's name and newest titles instead.
const LETTERS = {
  tr: /[ğşıİĞŞ]/, de: /[äöüßÄÖÜ]/, es: /[ñ¿¡]/, pt: /[ãõ]|ção/, fr: /[èêàùœ]|é[a-z]/, it: /\b(della|degli|corsa|corriamo|il|una)\b/i,
  nl: /\b(het|een|hardlopen|lopen)\b/i, pl: /[ąęłńśźżŁŚŻ]/, cs: /[ěčřůĚČŘ]/, sk: /[ľĺŕôä]/, hu: /[őűŐŰ]/, ro: /[ăâîșțşţ]/,
  sv: /[åäö]/, no: /[æøå]/, nb: /[æøå]/, nn: /[æøå]/, da: /[æøå]/, fi: /[äö]/, is: /[þðæ]/,
  el: /[\u0370-\u03ff]/, uk: /[іїєґІЇЄҐ]/, bg: /[\u0400-\u04ff]/, ja: /[\u3040-\u30ff]/, ko: /[\uac00-\ud7af]/, zh: /[\u4e00-\u9fff]/,
  th: /[\u0e00-\u0e7f]/, he: /[\u0590-\u05ff]/, ar: /[\u0600-\u06ff]/, vi: /[ăơưđĂƠƯĐ]/, hr: /[čćđšž]/, sl: /[čšž]/, et: /[õäöü]/, lv: /[āēīūķļņ]/, lt: /[ąčęėįšųūž]/,
};
export function speaks(langs, feedLang, text) {
  if (feedLang && langs.includes(feedLang)) return true;
  if (feedLang && feedLang !== 'en') return false;
  return langs.some((l) => l !== 'en' && LETTERS[l]?.test(text));
}

/** Apple lookup for up to 150 ids at a time. */
async function lookup(ids, country = 'us') {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const json = await getJson(`https://itunes.apple.com/lookup?country=${country}&id=${ids.slice(i, i + 150).join(',')}`);
    for (const r of json?.results ?? []) if (r.kind === 'podcast' && r.feedUrl) out.set(r.collectionId, r);
    await sleep(3000);
  }
  return out;
}

const ART_PX = 256;
let sharp; // loaded on first use; without it the shelf simply has no covers
const drawn = new Set();

/** Saves the show's cover as <dir>/<id>.jpg. True when the file is there. */
async function saveArt(r, dir) {
  if (!dir) return false;
  if (drawn.has(r.collectionId)) return true;
  const url = r.artworkUrl600 ?? r.artworkUrl100;
  if (!url) return false;
  try {
    sharp ??= (await import('sharp')).default;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize(ART_PX, ART_PX, { fit: 'cover' }).jpeg({ quality: 74, mozjpeg: true }).toFile(join(dir, `${r.collectionId}.jpg`));
    drawn.add(r.collectionId);
    return true;
  } catch (e) {
    console.warn(`art ${r.collectionId}: ${e.message}`);
    return false;
  }
}

/** The ids that have a cover bundled in the app, as a module of require()s. */
function artIndex(ids) {
  const lines = ids.map((id) => `  ${id}: require('../assets/shelf-art/${id}.jpg'),`);
  return `// Written by \`npm run shelf\`. Covers for the hand-picked shows, shipped with the app.\n\nexport const BUNDLED_ART: Record<number, number> = {\n${lines.join('\n')}\n};\n`;
}

function show(r, head) {
  return {
    id: r.collectionId,
    name: decode(r.collectionName),
    by: decode(r.artistName ?? ''),
    feed: r.feedUrl,
    apple: `https://podcasts.apple.com/podcast/id${r.collectionId}`,
    episodes: r.trackCount ?? null,
    lang: head?.lang ?? null,
    latest: head?.latest ?? [],
  };
}

const heads = new Map();
async function headFor(feed) {
  if (!heads.has(feed)) {
    const xml = await feedHead(feed);
    heads.set(feed, xml ? parseFeedHead(xml) : null);
  }
  return heads.get(feed);
}

// Sponsors write their own links; strip anything that would tell them who tapped.
const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_|aff|affiliate|clickid|irclickid|tag$|campaign)/i;
export function cleanUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error(`offer link must be https: ${raw}`);
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u.toString();
}

export function checkOffer(o, today) {
  const need = ['id', 'sponsor', 'title', 'text', 'url', 'topics', 'until'];
  for (const k of need) if (o[k] == null || o[k] === '') throw new Error(`offer ${o.id ?? '?'} is missing ${k}`);
  if (!Array.isArray(o.topics) || !o.topics.length) throw new Error(`offer ${o.id}: topics must be a non-empty list`);
  return {
    id: String(o.id),
    sponsor: String(o.sponsor),
    title: String(o.title),
    text: String(o.text),
    code: o.code ? String(o.code) : null,
    url: cleanUrl(o.url),
    topics: o.topics.map(String),
    countries: Array.isArray(o.countries) && o.countries.length ? o.countries.map((c) => String(c).toLowerCase()) : ['all'],
    until: String(o.until),
    expired: String(o.until) < today,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outPath = args.find((a) => !a.startsWith('--')) ?? 'shelf.json';
  const bundle = args.includes('--bundle'); // hand-picked covers into assets/, region shows get none
  const artDir = bundle ? 'assets/shelf-art' : args.find((a) => a.startsWith('--art='))?.slice(6) ?? null;
  if (artDir) await mkdir(artDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = Date.now() - ACTIVE_DAYS * 86400000;
  const picked = JSON.parse(await readFile(new URL('../content/listen.json', import.meta.url), 'utf8')).shows;
  const offersIn = JSON.parse(await readFile(new URL('../content/offers.json', import.meta.url), 'utf8')).offers;

  // 1. Hand-picked shows: refresh feed, count and newest episodes.
  const info = await lookup(picked.map((p) => p.id));
  const curated = [];
  for (const p of picked) {
    const r = info.get(p.id);
    if (!r) {
      console.warn(`hand-picked ${p.id}: not found on Apple, skipped`);
      continue;
    }
    // noFeed: the publisher's terms ask for a licence to use the feed commercially (the
    // BBC's do), so link to the show and leave its feed alone.
    const art = await saveArt(r, artDir);
    curated.push({ ...show(r, p.noFeed ? null : await headFor(r.feedUrl)), art, groups: p.groups, since: p.since ?? null, why: p.why });
  }

  // 2. Each country's running chart, kept to active shows in that country's languages.
  const only = process.env.SHELF_COUNTRIES?.split(',').map((s) => s.trim().toLowerCase());
  const regions = {};
  for (const [cc, langs] of Object.entries(COUNTRIES)) {
    if (only && !only.includes(cc)) continue;
    const chart = await getJson(`https://itunes.apple.com/${cc}/rss/toppodcasts/limit=40/genre=${RUNNING_GENRE}/json`);
    await sleep(3000);
    const ids = (chart?.feed?.entry ?? []).map((e) => Number(e.id?.attributes?.['im:id'])).filter(Boolean);
    if (!ids.length) {
      console.warn(`${cc}: no chart`);
      continue;
    }
    const found = await lookup(ids, cc);
    const list = [];
    for (const id of ids) {
      const r = found.get(id);
      if (!r || (r.trackCount ?? 0) < MIN_EPISODES || Date.parse(r.releaseDate) < cutoff) continue;
      const head = await headFor(r.feedUrl);
      if (!head) continue;
      if (head.latest.length && Date.parse(head.latest[0].date) < cutoff) continue; // Apple's date can lag a dead feed
      if (!speaks(langs, head.lang, [r.collectionName, ...head.latest.map((e) => e.title)].join(' '))) continue;
      list.push({ ...show(r, head), art: bundle ? false : await saveArt(r, artDir) });
      if (list.length >= PER_COUNTRY) break;
    }
    if (list.length) regions[cc] = list;
    console.log(`${cc}: ${list.length} of ${ids.length}`);
  }

  // 3. Offers. A bad one fails the build, so a typo never reaches a phone.
  const offers = offersIn.map((o) => checkOffer(o, today)).filter((o) => !o.expired).map(({ expired, ...o }) => o);

  const shelf = { version: 1, builtAt: new Date().toISOString(), curated, regions, offers };
  await writeFile(outPath, JSON.stringify(shelf));
  if (bundle) await writeFile('src/shelfArt.ts', artIndex(curated.filter((s) => s.art).map((s) => s.id)));
  console.log(`wrote ${outPath}: ${curated.length} hand-picked, ${Object.keys(regions).length} countries, ${offers.length} offers, ${drawn.size} covers, ${(JSON.stringify(shelf).length / 1024).toFixed(0)} KB`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
