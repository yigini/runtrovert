// npm run test:voice — the app's voice in every language.
// English must come out word for word as it did before the text moved into
// src/i18n/voice (scripts/fixtures/voice-en.json); every other language must
// cover every tip, keep enough reminder lines to rotate, keep its placeholders,
// and never leak "undefined", "NaN" or an unfilled {slot}.
import './tz-amsterdam.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot } from './voice-snapshot.ts';
import { withLang, LANGS, type Lang } from '../src/i18n/lang.ts';
import { PACKS } from '../src/i18n/voice/index.ts';
import { en } from '../src/i18n/voice/en.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/voice-en.json', import.meta.url), 'utf8'));
assert.deepEqual(JSON.parse(JSON.stringify(withLang('en', snapshot))), fixture, 'English voice changed');

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}

for (const { code } of LANGS) {
  const pack = PACKS[code as Lang];
  if (!pack || code === 'en') continue;
  const snap = withLang(code as Lang, snapshot);
  const all = strings(snap);
  for (const s of all) {
    assert.ok(s.trim().length > 0, `${code}: empty line`);
    assert.ok(!/undefined|NaN|\[object/.test(s), `${code}: broken line "${s}"`);
  }
  const shown = strings({ home: snap.home, surprises: snap.surprises, share: snap.share, you: snap.you, tips: snap.tips });
  for (const s of shown) assert.ok(!/\{\w+\}/.test(s), `${code}: unfilled slot in "${s}"`);

  // Every tip, in every language: some of them are medical.
  for (const id of Object.keys(en.tips.text)) assert.ok(pack.tips.text[id], `${code}: tip ${id} missing`);
  for (const k of Object.keys(en.tips.topics)) assert.ok(pack.tips.topics[k as keyof typeof en.tips.topics], `${code}: topic ${k} missing`);

  // Enough reminder lines that a few a week don't repeat for months.
  const r = pack.reminders;
  for (const [mood, lines] of Object.entries(r.moods)) assert.ok(lines.length >= 6, `${code}: only ${lines.length} ${mood} lines`);
  assert.ok(r.rhythm.length >= 3 && r.rhythm.every((l) => l.includes('{day}') || !/\{/.test(l)), `${code}: rhythm lines`);
  assert.ok(r.rhythm.some((l) => l.includes('{day}')), `${code}: no rhythm line names the day`);
  assert.ok(r.window.length >= 3 && r.window.every((l) => l.includes('{time}')), `${code}: window lines need {time}`);
  for (const k of ['last', 'reflectTitles', 'reflectLines', 'afterRunTitles', 'afterRunLines', 'titles'] as const) assert.ok(r[k].length >= 2, `${code}: ${k}`);

  // Headlines are set big, two lines; keep each line about as short as English's longest.
  const limit = code === 'ja' ? 16 : 30;
  for (const sky of Object.keys(en.sky.headline) as Array<keyof typeof en.sky.headline>)
    for (const h of pack.sky.headline[sky]('-12°'))
      for (const part of h.split('\n')) assert.ok([...part].length <= limit, `${code}: headline line too long: "${part}"`);
}
console.log(`voice ok: ${Object.keys(PACKS).join(', ')}`);
