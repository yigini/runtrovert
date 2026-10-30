import { loadValue, saveValue } from './db';
import { lang } from './i18n/lang';
import {
  cellBox,
  cellCentre,
  askOrder,
  cellsFor,
  CELL_RADIUS_M,
  MAX_PLACES,
  padded,
  paddedIds,
  parseEntities,
  parseExtracts,
  parseGeosearch,
  parseWays,
  placeStories,
  shortlist,
  streetsPassed,
  streetStory,
  type Candidate,
  type Entity,
  type PlaceStory,
  type StoryPt,
  type StreetStory,
  type StreetWay,
} from './stories';

// Where Things you passed comes from. Only after a run, only when switched on
// in Settings. Each service is asked about squares of about 1 km (stories.ts),
// in a fixed order rather than the run's, never sent the route. The few pages and
// street IDs wanted go out mixed in with others from the same squares. Every answer
// is kept on the phone for a month, so a usual loop asks once. Wikipedia text is CC BY-SA 4.0, OpenStreetMap data
// ODbL, Wikidata CC0; the finish card credits all three.

const UA = 'Runtrovert/1.0 (https://runtrovert.app)';
const KEEP_MS = 30 * 24 * 3600 * 1000;
const OVERPASS = 'https://overpass-api.de/api/interpreter';

export interface RouteStories {
  places: PlaceStory[];
  streets: StreetStory[];
  /** The Wikipedia the places came from, when it is not the app's language. */
  wiki: string;
}

interface Kept<T> {
  at: number;
  value: T;
}

async function kept<T>(key: string, make: () => Promise<T>): Promise<T> {
  const old = await loadValue<Kept<T>>(key).catch(() => null);
  if (old && Date.now() - old.at < KEEP_MS) return old.value;
  const value = await make();
  await saveValue(key, { at: Date.now(), value }).catch(() => {});
  return value;
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', headers: { Accept: 'application/json', 'Api-User-Agent': UA, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`stories ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function api(wiki: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params });
  return `https://${wiki}.wikipedia.org/w/api.php?${q}`;
}

/** Everything with coordinates in one square, from one Wikipedia. Opening lines are added as they are fetched. */
function cellPages(wiki: string, cell: string): Promise<Candidate[]> {
  const c = cellCentre(cell);
  return kept(`stories:${wiki}:${cell}`, async () =>
    parseGeosearch(
      await getJson(api(wiki, { generator: 'geosearch', ggscoord: `${c.lat}|${c.lon}`, ggsradius: String(CELL_RADIUS_M), ggslimit: '300', prop: 'coordinates|description|info', colimit: 'max' })),
    ),
  );
}

async function placesFrom(wiki: string, cells: string[], route: StoryPt[], dark: boolean): Promise<PlaceStory[]> {
  const byCell = new Map<string, Candidate[]>();
  for (const cell of cells) byCell.set(cell, await cellPages(wiki, cell).catch(() => []));
  const all = [...byCell.values()].flat();
  const list = shortlist(all, route, { dark });
  const missing = list.filter((c) => c.extract === undefined);
  if (missing.length) {
    try {
      const ids = padded(
        missing.map((c) => c.pageid),
        all,
      );
      const text = parseExtracts(await getJson(api(wiki, { prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '2', exlimit: '20', pageids: ids.join('|') })));
      for (const c of all) if (text.has(c.pageid)) c.extract = text.get(c.pageid) ?? null;
      // Keep the lines with their squares, so this run's loop never asks again.
      for (const [cell, pages] of byCell) {
        if (pages.some((p) => text.has(p.pageid))) await saveValue(`stories:${wiki}:${cell}`, { at: Date.now(), value: pages }).catch(() => {});
      }
    } catch {
      // No lines this time: the shortlist simply shows nothing.
    }
  }
  return placeStories(list, route, wiki, { dark });
}

function cellWays(cell: string): Promise<StreetWay[]> {
  const [s, w, n, e] = cellBox(cell);
  const q = `[out:json][timeout:25];way[highway][name]["name:etymology:wikidata"](${s},${w},${n},${e});out tags geom;`;
  return kept(`streets:${cell}`, async () =>
    parseWays(await getJson(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}` })),
  );
}

async function streetsFrom(cells: string[], route: StoryPt[], l: string, dark: boolean): Promise<StreetStory[]> {
  const ways: StreetWay[] = [];
  for (const cell of cells) ways.push(...(await cellWays(cell).catch(() => [])));
  // A few spare streets, in case one is named after itself.
  const hits = streetsPassed(ways, route, 4);
  if (!hits.length) return [];
  const ids = paddedIds(
    hits.map((h) => h.way.qid),
    ways.map((w) => w.qid),
  );
  const entities = await kept<Array<[string, Entity]>>(`streets:wd:${l}:${ids.join(',')}`, async () => [
    ...parseEntities(await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', format: 'json', origin: '*', props: 'labels|descriptions', languages: `${l}|en`, ids: ids.join('|') })}`), l),
  ]).catch(() => [] as Array<[string, Entity]>);
  const byId = new Map(entities);
  return hits
    .map((h) => streetStory(h.way, h.at, byId.get(h.way.qid), { dark }))
    .filter((s): s is StreetStory => !!s)
    .slice(0, 2);
}

/** What a finished run went past. Empty when nothing worth a line was near, or the network was not there. */
export async function storiesFor(route: StoryPt[], { dark = false } = {}): Promise<RouteStories> {
  const l = lang();
  const cells = askOrder(cellsFor(route));
  if (!cells.length) return { places: [], streets: [], wiki: l };
  let wiki: string = l;
  let places = await placesFrom(l, cells, route, dark);
  // Little in the runner's own Wikipedia: English, and the card says so.
  if (!places.length && l !== 'en') {
    const en = await placesFrom('en', cells, route, dark);
    if (en.length) {
      places = en;
      wiki = 'en';
    }
  }
  const streets = await streetsFrom(cells, route, l, dark).catch(() => []);
  return { places: places.slice(0, MAX_PLACES), streets, wiki };
}
