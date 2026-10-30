// Things you passed: a few landmarks and street names from along a run, shown
// on the finish screen. Pure, no network (that is src/storySource.ts), so
// `npm run test:stories` can check it.
//
// Privacy: the route never leaves the phone. It is rounded to squares of about
// 1 km (CELL), and only those squares are asked about. Which of the answers the
// runner actually went past is worked out here, against the real route.
// Nothing is counted or collected across runs: this is about one run.

export interface StoryPt {
  lat: number;
  lon: number;
}

/** A page from a Wikipedia geosearch, before we know if the route went past it. */
export interface Candidate {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  description: string | null;
  length: number; // page size in bytes: a rough sign of how much there is to say
  extract?: string | null; // the opening lines, once fetched
}

/** A street the route followed, named after someone or something (OpenStreetMap name:etymology:wikidata). */
export interface StreetWay {
  name: string;
  qid: string;
  nodes: StoryPt[];
}

export interface PlaceStory {
  kind: 'place';
  pageid: number;
  title: string;
  text: string;
  at: StoryPt;
  url: string;
}

export interface StreetStory {
  kind: 'street';
  name: string;
  qid: string;
  who: string;
  about: string | null;
  at: StoryPt;
  url: string;
}

export type Story = PlaceStory | StreetStory;

/** Square size in degrees: 0.01° is about 1.1 km north to south. */
export const CELL = 0.01;
/** How close the route must come for a place to count as passed. */
export const NEAR_M = 40;
/** A street counts when this many of its points lie on the route. */
export const STREET_NEAR_M = 25;
export const MAX_PLACES = 3;
export const MAX_STREETS = 2;
/** A long run touches many squares; past this we ask about an even spread of them. */
export const MAX_CELLS = 16;
/** Search radius round a square's centre: reaches its corners. */
export const CELL_RADIUS_M = 800;
/** Pages shorter than this are usually a stub with nothing to tell. */
export const MIN_LENGTH = 1500;

const M_PER_DEG = 111195;

export function cellOf(p: StoryPt): string {
  return `${(Math.floor(p.lat / CELL) * CELL).toFixed(2)},${(Math.floor(p.lon / CELL) * CELL).toFixed(2)}`;
}

export function cellCentre(key: string): StoryPt {
  const [lat, lon] = key.split(',').map(Number);
  return { lat: +(lat + CELL / 2).toFixed(3), lon: +(lon + CELL / 2).toFixed(3) };
}

/** South, west, north, east of a square, for an OpenStreetMap bounding box. */
export function cellBox(key: string): [number, number, number, number] {
  const [lat, lon] = key.split(',').map(Number);
  return [lat, lon, +(lat + CELL).toFixed(2), +(lon + CELL).toFixed(2)];
}

/** The squares a route went through, in the order it reached them. */
export function cellsFor(route: StoryPt[]): string[] {
  const seen: string[] = [];
  for (const p of route) {
    const k = cellOf(p);
    if (!seen.includes(k)) seen.push(k);
  }
  if (seen.length <= MAX_CELLS) return seen;
  const step = seen.length / MAX_CELLS;
  return Array.from({ length: MAX_CELLS }, (_, i) => seen[Math.floor(i * step)]);
}

/** Shortest distance in metres from a point to the route line. */
export function distanceToRoute(p: StoryPt, route: StoryPt[]): number {
  if (!route.length) return Infinity;
  const kx = M_PER_DEG * Math.cos((p.lat * Math.PI) / 180);
  const ky = M_PER_DEG;
  const xy = (q: StoryPt) => [(q.lon - p.lon) * kx, (q.lat - p.lat) * ky];
  let best = Infinity;
  let [ax, ay] = xy(route[0]);
  if (route.length === 1) return Math.hypot(ax, ay);
  for (let i = 1; i < route.length; i++) {
    const [bx, by] = xy(route[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    ax = bx;
    ay = by;
  }
  return best;
}

/** Shortest distance from a point to the route, measuring only the segments that come near it. */
export function passed(p: StoryPt, route: StoryPt[], within = NEAR_M): boolean {
  const dLat = within / M_PER_DEG + 0.002;
  const dLon = dLat / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
  const close = (q: StoryPt) => Math.abs(q.lat - p.lat) < dLat && Math.abs(q.lon - p.lon) < dLon;
  if (route.length === 1) return distanceToRoute(p, route) <= within;
  for (let i = 1; i < route.length; i++) {
    if ((close(route[i - 1]) || close(route[i])) && distanceToRoute(p, [route[i - 1], route[i]]) <= within) return true;
  }
  return false;
}

// Pages that are not about a place worth a story: stops and stations, shops,
// firms, schools, hotels. Matched against the short description, any language.
const DULL = [
  /\b(railway|metro|subway|tram|bus|underground|train) (station|stop)\b/i,
  /\bstation\b.*\b(line|railway|metro)\b/i,
  /\b(company|corporation|business|shopping (centre|center|mall)|supermarket|retailer|hotel|school|kindergarten|car park|parking)\b/i,
  /\b(bahnhof|haltestelle|u-bahnhof|unternehmen|schule|einkaufszentrum)\b/i,
  /\b(gare|station de métro|entreprise|école|lycée|centre commercial)\b/i,
  /\b(estación|estação|parada|empresa|escola|escuela|colegio|centro comercial)\b/i,
  /\b(stazione|fermata|azienda|scuola|centro commerciale)\b/i,
  /\b(istasyon|istasyonu|durağı|şirket|okul|okulu|alışveriş merkezi|otel)\b/i,
  /(駅|停留所|企業|会社|学校|高等学校|中学校|小学校|ホテル|ショッピングセンター)/,
];

// Stories a runner did not ask to meet on the way home: killings, attacks,
// disasters. Left out unless "Include darker history" is on. A memorial whose
// opening lines are about the event goes with them; the rest of the history
// stays.
const DARK = [
  /\b(massacre|murder(ed)?|killed|killing|execution|executed|bombing|genocide|suicide|disaster|shooting|assassinat\w*|pogrom|lynch\w*|concentration camp|terror(ist)? attack)\b/i,
  /\b(massaker|mord|ermordet|hinrichtung|anschlag|völkermord|katastrophe|selbstmord|suizid|konzentrationslager)\b/i,
  /\b(meurtre|assassin\w*|exécution|exécuté|attentat|génocide|catastrophe)\b/i,
  /\b(masacre|asesinato|asesinad\w*|ejecución|atentado|genocidio|suicidio|catástrofe)\b/i,
  /\b(massacre|assassinato|assassinad\w*|execução|atentado|genocídio|suicídio|catástrofe)\b/i,
  /\b(massacro|strage|omicidio|uccis\w*|esecuzione|attentato|genocidio|suicidio|catastrofe)\b/i,
  /(katliam|cinayet|öldürül\w*|idam|soykırım|intihar|felaket|suikast|bombalı saldırı|terör saldırısı)/i,
  /(虐殺|殺人|殺害|処刑|爆破|テロ|自殺|惨事|暗殺|強制収容所)/,
];

export function isDull(c: Pick<Candidate, 'description' | 'length'>): boolean {
  if (c.length < MIN_LENGTH) return true;
  return !!c.description && DULL.some((r) => r.test(c.description!));
}

export function isDark(text: string | null | undefined): boolean {
  return !!text && DARK.some((r) => r.test(text));
}

/**
 * The pages worth fetching opening lines for: passed, not dull, biggest first.
 * A few more than we will show, as some drop out once their text is in.
 */
export function shortlist(cands: Candidate[], route: StoryPt[], { dark = false, max = MAX_PLACES * 2 } = {}): Candidate[] {
  const byId = new Map<number, Candidate>();
  for (const c of cands) if (!byId.has(c.pageid)) byId.set(c.pageid, c);
  return [...byId.values()]
    .filter((c) => !isDull(c) && (dark || !isDark(c.description)) && passed(c, route))
    .sort((a, b) => b.length - a.length)
    .slice(0, max);
}

/**
 * Pages to ask for opening lines, padded with others from the same squares, so
 * the request does not single out the places the route went past.
 */
export function padded(wanted: number[], pool: Candidate[], size = 20): number[] {
  const out = [...new Set(wanted)];
  for (const c of [...pool].sort((a, b) => a.pageid - b.pageid)) {
    if (out.length >= size) break;
    if (!out.includes(c.pageid) && c.extract === undefined) out.push(c.pageid);
  }
  return out;
}

/** Two sentences at most, and never a wall: cut at a sentence end before ~240 characters. */
export function trimText(text: string, max = 240): string {
  const clean = text.replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : max).trim()}…`;
}

export function wikiUrl(wiki: string, title: string): string {
  return `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** The place stories for a run: shortlisted pages whose opening lines came in and pass the filters. */
export function placeStories(list: Candidate[], route: StoryPt[], wiki: string, { dark = false, max = MAX_PLACES } = {}): PlaceStory[] {
  const out: PlaceStory[] = [];
  for (const c of list) {
    if (out.length >= max) break;
    if (!c.extract || c.extract.length < 40) continue;
    if (!dark && isDark(c.extract)) continue;
    out.push({ kind: 'place', pageid: c.pageid, title: c.title, text: trimText(c.extract), at: { lat: c.lat, lon: c.lon }, url: wikiUrl(wiki, c.title) });
  }
  return out;
}

/** Streets the route ran along, most of them first, each name once. */
export function streetsPassed(ways: StreetWay[], route: StoryPt[], max = MAX_STREETS): Array<{ way: StreetWay; at: StoryPt }> {
  const best = new Map<string, { way: StreetWay; at: StoryPt; hits: number }>();
  for (const way of ways) {
    const on = way.nodes.filter((n) => passed(n, route, STREET_NEAR_M));
    // One shared corner is crossing a street, not running along it.
    if (on.length < 2) continue;
    const key = way.name.toLowerCase();
    const prev = best.get(key);
    const hits = (prev?.hits ?? 0) + on.length;
    best.set(key, { way, at: prev?.at ?? on[Math.floor(on.length / 2)], hits });
  }
  return [...best.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map(({ way, at }) => ({ way, at }));
}

export interface Entity {
  label: string | null;
  description: string | null;
}

/** Wikidata gives most labels in many languages; English when ours is missing. */
export function streetStory(way: StreetWay, at: StoryPt, entity: Entity | undefined, { dark = false } = {}): StreetStory | null {
  if (!entity?.label) return null;
  if (!dark && isDark(entity.description)) return null;
  // A street named after itself (or a Wikidata item for the street) tells nothing.
  if (entity.label.toLowerCase() === way.name.toLowerCase()) return null;
  return { kind: 'street', name: way.name, qid: way.qid, who: entity.label, about: entity.description, at, url: `https://www.wikidata.org/wiki/${way.qid}` };
}

// ---- Parsing what the services send back ------------------------------------

/** Wikipedia: action=query&generator=geosearch&prop=coordinates|description|info, formatversion=2. */
export function parseGeosearch(json: any): Candidate[] {
  const pages: any[] = json?.query?.pages ?? [];
  const out: Candidate[] = [];
  for (const p of pages) {
    const c = p?.coordinates?.[0];
    if (!c || typeof c.lat !== 'number' || typeof c.lon !== 'number' || typeof p.pageid !== 'number') continue;
    if (c.globe && c.globe !== 'earth') continue;
    out.push({ pageid: p.pageid, title: String(p.title ?? ''), lat: c.lat, lon: c.lon, description: typeof p.description === 'string' ? p.description : null, length: typeof p.length === 'number' ? p.length : 0 });
  }
  return out;
}

/** Wikipedia: prop=extracts&exintro&explaintext, formatversion=2. pageid → text. */
export function parseExtracts(json: any): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of json?.query?.pages ?? []) {
    if (typeof p?.pageid === 'number') out.set(p.pageid, typeof p.extract === 'string' ? p.extract.trim() : '');
  }
  return out;
}

/** OpenStreetMap Overpass: ways with name and name:etymology:wikidata, `out tags geom`. */
export function parseWays(json: any): StreetWay[] {
  const out: StreetWay[] = [];
  for (const el of json?.elements ?? []) {
    const name = el?.tags?.name;
    // Several people for one street ("Q1;Q2"): the first is enough for one line.
    const qid = String(el?.tags?.['name:etymology:wikidata'] ?? '').split(';')[0].trim();
    if (el?.type !== 'way' || !name || !/^Q\d+$/.test(qid) || !Array.isArray(el.geometry)) continue;
    out.push({ name, qid, nodes: el.geometry.filter((g: any) => typeof g?.lat === 'number' && typeof g?.lon === 'number').map((g: any) => ({ lat: g.lat, lon: g.lon })) });
  }
  return out;
}

/** Wikidata: action=wbgetentities&props=labels|descriptions&languages=xx|en. */
export function parseEntities(json: any, lang: string): Map<string, Entity> {
  const out = new Map<string, Entity>();
  for (const [id, e] of Object.entries<any>(json?.entities ?? {})) {
    // A name reads the same in most languages; a description in another language would not.
    out.set(id, { label: e?.labels?.[lang]?.value ?? e?.labels?.en?.value ?? null, description: e?.descriptions?.[lang]?.value ?? null });
  }
  return out;
}
