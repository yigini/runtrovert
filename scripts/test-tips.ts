import { TIPS, TOPICS, contextsFor, pickTip, tipsByTopic } from '../src/tips.ts';

// Checks the tip list and the daily pick. Run: node --experimental-strip-types scripts/test-tips.ts
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}

const ids = new Set<string>();
for (const t of TIPS) {
  check(!ids.has(t.id), `duplicate id ${t.id}`);
  ids.add(t.id);
  check(TOPICS.some((x) => x.key === t.topic), `${t.id}: unknown topic`);
  check(t.text.length <= 200, `${t.id}: ${t.text.length} chars, keep it to two short sentences`);
  check(!/[—!]/.test(t.text), `${t.id}: no em dashes or exclamation marks in this voice`);
}
check(TIPS.length >= 60, `only ${TIPS.length} tips`);
for (const g of tipsByTopic()) check(g.tips.length >= 5, `${g.title}: only ${g.tips.length}`);

// Context mapping
const first = contextsFor({ runCount: 0, daysSinceLast: null, lastRunKm: null });
check(first.has('first') && !first.has('early'), 'no runs = first');
const wet = contextsFor({ runCount: 12, daysSinceLast: 2, lastRunKm: 5, tempC: 3, feelsC: 0, windKmh: 30, wet: true, dark: true });
for (const c of ['rain', 'cold', 'wind', 'dark'] as const) check(wet.has(c), `wet cold windy dark has ${c}`);

// Strong contexts always get a fitting tip
for (let d = 0; d < 60; d++) {
  const day = `2026-11-${d}`;
  const t = pickTip(first, [], day);
  check(!!t.when?.some((w) => first.has(w)), `first run day ${d} got ${t.id}`);
  const r = pickTip(new Set(['rain']), [], day);
  check(!!r.when?.includes('rain'), `rain day ${d} got ${r.id}`);
}

// Same day, same context: same tip
check(pickTip(wet, [], 'x').id === pickTip(wet, [], 'x').id, 'stable within a day');

// Walking through days marking each tip seen: no repeats until the pool runs out
const seen: string[] = [];
const ordinary = contextsFor({ runCount: 20, daysSinceLast: 2, lastRunKm: 5, tempC: 14, windKmh: 10 });
for (let d = 0; d < TIPS.length; d++) {
  const t = pickTip(ordinary, seen, `day${d}`);
  check(!seen.includes(t.id), `repeat ${t.id} on day ${d}`);
  seen.push(t.id);
}
console.log(`${TIPS.length} tips, ${TIPS.filter((t) => t.source).length} sourced, ${new Set(seen).size} distinct over ${TIPS.length} days`);
if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('tips ok');
