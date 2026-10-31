// npm run test:credits — the Credits and licences screen lists what actually ships.
// Every app dependency in package.json must be in src/credits/libraries.json with the
// version and licence package-lock.json has, and every licence it names needs its text.
// When this fails after adding or updating a dependency: npm run credits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PEXELS } from '../src/footage.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const lock = read('package-lock.json');
const credits = read('src/credits/libraries.json') as {
  libraries: Array<{ name: string; version?: string; licence: string; copyright: string[]; url: string }>;
  fonts: string[];
  texts: Record<string, string>;
};

const byName = new Map(credits.libraries.map((l) => [l.name, l]));
for (const name of Object.keys(pkg.dependencies)) {
  const lib = byName.get(name);
  assert.ok(lib, `${name} is a dependency but not in the credits (npm run credits)`);
  const entry = lock.packages[`node_modules/${name}`];
  assert.equal(lib.version, entry.version, `${name}: credits say ${lib.version}, lockfile ${entry.version} (npm run credits)`);
  assert.ok(entry.license.split(' AND ').includes(lib.licence), `${name}: credits say ${lib.licence}, lockfile ${entry.license}`);
}
for (const lib of credits.libraries) {
  assert.ok(lib.licence === 'public-domain' || credits.texts[lib.licence], `${lib.name}: no text for ${lib.licence}`);
  assert.ok(/^https:\/\//.test(lib.url), `${lib.name}: link ${lib.url}`);
  if (lib.licence !== 'public-domain') assert.ok(lib.copyright.length > 0, `${lib.name}: no copyright line`);
}
assert.ok(credits.texts['OFL-1.1'], 'the fonts need the OFL text');
assert.equal(credits.fonts.length, 2, 'DM Sans and Fraunces');
// Footage credits come straight from src/footage.ts; CREDITS.md should agree.
const md = readFileSync(new URL('../assets/CREDITS.md', import.meta.url), 'utf8');
for (const [name, id] of Object.entries(PEXELS)) assert.ok(md.includes(`| bg-${name} | ${id} |`), `assets/CREDITS.md is missing bg-${name}`);
console.log(`credits ok: ${credits.libraries.length} libraries, ${Object.keys(PEXELS).length} videos`);
