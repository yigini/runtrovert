// npm run test:stories — Things you passed: squares instead of the route, what
// counts as passed, what is left out, and reading what the services send back.
import assert from 'node:assert/strict';
import {
  cellBox,
  cellCentre,
  cellOf,
  cellsFor,
  isDark,
  isDull,
  MAX_CELLS,
  padded,
  paddedIds,
  askOrder,
  parseEntities,
  parseExtracts,
  parseGeosearch,
  parseWays,
  passed,
  placeStories,
  shortlist,
  streetsPassed,
  streetStory,
  trimText,
  type Candidate,
  type StoryPt,
} from '../src/stories.ts';

const LAT = 41.03;
const LON = 28.975;
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((LAT * Math.PI) / 180));
const at = (x: number, y: number): StoryPt => ({ lat: LAT + y * M_LAT, lon: LON + x * M_LON });

// A straight 2 km run east, a fix every 5 m.
const route = Array.from({ length: 401 }, (_, i) => at(i * 5, 0));

// Squares, not the route.
assert.equal(cellOf({ lat: 41.0349, lon: 28.9751 }), '41.03,28.97');
assert.deepEqual(cellCentre('41.03,28.97'), { lat: 41.035, lon: 28.975 });
assert.deepEqual(cellBox('41.03,28.97'), [41.03, 28.97, 41.04, 28.98]);
const cells = cellsFor(route);
assert.ok(cells.length >= 2 && cells.length <= 4, `2 km east crosses a few squares, got ${cells.length}`);
assert.equal(new Set(cells).size, cells.length, 'each square once');
const long = Array.from({ length: 3000 }, (_, i) => at(i * 20, i * 5)); // 60 km diagonal
assert.equal(cellsFor(long).length, MAX_CELLS, 'a very long run asks about an even spread');
assert.deepEqual(cellsFor([]), []);
// The order of the requests doesn't follow the run.
assert.deepEqual(askOrder(['41.04,28.98', '41.03,28.97', '41.03,28.98']), ['41.03,28.97', '41.03,28.98', '41.04,28.98']);
assert.deepEqual(askOrder(cells.slice().reverse()), askOrder(cells), 'out and back ask the same way');
// Street IDs go out among others from the same squares.
const wd = paddedIds(['Q9', 'Q9', 'Q3'], ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q9'], 5);
assert.equal(wd.length, 5);
assert.ok(wd.includes('Q9') && wd.includes('Q3'), 'the wanted ones are always asked for');
assert.deepEqual(wd, wd.slice().sort(), 'sorted, so their place says nothing');
assert.deepEqual(paddedIds(['Q7'], ['Q7']), ['Q7'], 'nothing to mix in with: just the one');

// Passed: within 40 m of the line, not of a fix.
assert.ok(passed(at(502, 30), route), '30 m off the line');
assert.ok(!passed(at(502, 60), route), '60 m off is not passed');
assert.ok(!passed(at(2300, 0), route), 'beyond the finish');
// A route that leaves and comes back must not be joined by a short cut.
const uTurn = [...Array.from({ length: 41 }, (_, i) => at(0, i * 5)), ...Array.from({ length: 41 }, (_, i) => at(i * 5, 200)), ...Array.from({ length: 41 }, (_, i) => at(200, 200 - i * 5))];
assert.ok(!passed(at(100, 0), uTurn), 'the open side of a U is not passed');

// Dull and dark.
assert.ok(isDull({ description: 'metro station in Istanbul, Turkey', length: 9000 }));
assert.ok(isDull({ description: 'İstanbul’da bir metro istasyonu', length: 9000 }));
assert.ok(isDull({ description: 'clock tower', length: 800 }), 'a stub');
assert.ok(!isDull({ description: 'Ottoman mosque in Istanbul', length: 12000 }));
assert.ok(isDark('The square was the site of a massacre in 1977.'));
assert.ok(isDark('1977’de burada bir katliam yaşandı.'));
assert.ok(isDark('Hier fand 1944 ein Massaker statt.'));
assert.ok(!isDark('A covered market built in 1461, one of the oldest in the world.'));

// Shortlist: passed, not dull, not dark, biggest first; once each.
const cands: Candidate[] = [
  { pageid: 1, title: 'Small fountain', ...at(300, 10), description: 'fountain', length: 3000 },
  { pageid: 2, title: 'Great mosque', ...at(800, -20), description: 'Ottoman mosque', length: 40000 },
  { pageid: 3, title: 'Karaköy station', ...at(900, 5), description: 'railway station in Istanbul', length: 20000 },
  { pageid: 4, title: 'Far palace', ...at(800, 400), description: 'palace', length: 90000 },
  { pageid: 5, title: 'Square of sorrow', ...at(1200, 0), description: 'site of the 1977 massacre', length: 30000 },
  { pageid: 2, title: 'Great mosque', ...at(800, -20), description: 'Ottoman mosque', length: 40000 },
];
assert.deepEqual(
  shortlist(cands, route).map((c) => c.pageid),
  [2, 1],
);
assert.deepEqual(
  shortlist(cands, route, { dark: true }).map((c) => c.pageid),
  [2, 5, 1],
);

// Padding: the pages we want, then others from the squares, so the ask is not a list of what was passed.
const pool: Candidate[] = Array.from({ length: 30 }, (_, i) => ({ pageid: 100 + i, title: `P${i}`, lat: LAT, lon: LON, description: null, length: 5000 }));
const ids = padded([2, 1], pool);
assert.equal(ids.length, 20);
assert.deepEqual(ids.slice(0, 2), [2, 1]);
assert.equal(new Set(ids).size, 20);

// Stories: text in, filtered, trimmed, linked.
const withText = shortlist(cands, route, { dark: true }).map((c) => ({
  ...c,
  extract:
    c.pageid === 5
      ? 'The square is known for the 1977 massacre.'
      : c.pageid === 2
        ? 'The Great Mosque (Turkish: Büyük Cami) is a 16th-century mosque. It was designed by the court architect and finished in 1557. Its courtyard is planted with plane trees. It has four minarets and a large dome that is visible from the water. Later repairs kept its tiles intact.'
        : '',
}));
const stories = placeStories(withText, route, 'en');
assert.deepEqual(
  stories.map((s) => s.pageid),
  [2],
  'dark lines and empty extracts drop out',
);
assert.ok(stories[0].text.length <= 241 && !stories[0].text.includes('(Turkish'), stories[0].text);
assert.equal(stories[0].url, 'https://en.wikipedia.org/wiki/Great_mosque');
assert.equal(placeStories(withText, route, 'en', { dark: true }).length, 2);
assert.equal(trimText('Short and sweet.'), 'Short and sweet.');

// Streets: run along, not across; each name once; named after someone else.
const ways = [
  { name: 'Nazım Hikmet Caddesi', qid: 'Q133400', nodes: [at(100, 3), at(200, -2), at(300, 4), at(400, 0)] },
  { name: 'Nazım Hikmet Caddesi', qid: 'Q133400', nodes: [at(450, 1), at(520, 2)] },
  { name: 'Cross Street', qid: 'Q9', nodes: [at(700, -300), at(700, 0), at(700, 300)] },
  { name: 'Far Street', qid: 'Q8', nodes: [at(0, 500), at(500, 500)] },
];
const hits = streetsPassed(ways, route);
assert.deepEqual(
  hits.map((h) => h.way.name),
  ['Nazım Hikmet Caddesi'],
);
const story = streetStory(hits[0].way, hits[0].at, { label: 'Nazım Hikmet', description: 'Türk şair' });
assert.equal(story?.who, 'Nazım Hikmet');
assert.equal(story?.url, 'https://www.wikidata.org/wiki/Q133400');
assert.equal(streetStory(hits[0].way, hits[0].at, { label: 'Nazım Hikmet Caddesi', description: null }), null, 'named after itself');
assert.equal(streetStory(hits[0].way, hits[0].at, { label: 'X', description: 'site of a massacre' }), null);
assert.equal(streetStory(hits[0].way, hits[0].at, undefined), null);

// Reading the answers.
const geo = parseGeosearch({
  query: {
    pages: [
      { pageid: 7, title: 'Galata Tower', coordinates: [{ lat: 41.0256, lon: 28.9742, primary: true, globe: 'earth' }], description: 'medieval stone tower', length: 25000 },
      { pageid: 8, title: 'No coords' },
      { pageid: 9, title: 'Moon crater', coordinates: [{ lat: 1, lon: 1, globe: 'moon' }] },
    ],
  },
});
assert.deepEqual(geo, [{ pageid: 7, title: 'Galata Tower', lat: 41.0256, lon: 28.9742, description: 'medieval stone tower', length: 25000 }]);
assert.deepEqual(parseGeosearch({ batchcomplete: true }), []);
assert.equal(parseExtracts({ query: { pages: [{ pageid: 7, extract: ' A tower. ' }, { pageid: 8 }] } }).get(7), 'A tower.');
assert.equal(parseExtracts({ query: { pages: [{ pageid: 8 }] } }).get(8), '');
const parsedWays = parseWays({
  elements: [
    { type: 'way', tags: { name: 'İstiklal Caddesi', 'name:etymology:wikidata': 'Q1;Q2' }, geometry: [{ lat: 41, lon: 29 }, { lat: 41.001, lon: 29.001 }] },
    { type: 'way', tags: { name: 'Bad', 'name:etymology:wikidata': 'nope' }, geometry: [] },
    { type: 'node', tags: { name: 'Node' } },
  ],
});
assert.deepEqual(parsedWays.map((w) => [w.name, w.qid, w.nodes.length]), [['İstiklal Caddesi', 'Q1', 2]]);
const ents = parseEntities({ entities: { Q1: { labels: { en: { value: 'Independence' } }, descriptions: { en: { value: 'state of a nation' } } }, Q2: { labels: { tr: { value: 'Atatürk' } }, descriptions: { tr: { value: 'Türk devlet adamı' } } } } }, 'tr');
assert.deepEqual(ents.get('Q1'), { label: 'Independence', description: null }, 'a description only in our language');
assert.deepEqual(ents.get('Q2'), { label: 'Atatürk', description: 'Türk devlet adamı' });

console.log('stories ok');
