// npm run wear:strings — writes the watch app's text from the one strings file.
// The Wear OS app is Kotlin and can't read src/i18n, so each language's `watch`
// section becomes wear/app/src/main/res/values(-xx)/strings.xml. {n} becomes %1$s.
// npm run test:wear runs this with --check: CI fails when the XML is out of date.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { finish, SHIPPED, type Lang } from '../src/i18n/lang.ts';
import { UI } from '../src/i18n/ui/index.ts';

const RES = new URL('../wear/app/src/main/res/', import.meta.url).pathname;

function xmlText(s: string): string {
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\{n\}/g, '%1$s');
  return /^[@?]/.test(escaped) ? `\\${escaped}` : escaped;
}

export function wearXml(code: Lang): string {
  const words = UI[code]!.watch as Record<string, string>;
  const lines = Object.entries(words).map(([k, v]) => `  <string name="${k}">${xmlText(finish(v, code))}</string>`);
  if (code === 'en') lines.unshift('  <string name="app_name" translatable="false">Runtrovert</string>');
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Written by scripts/make-wear-strings.ts from src/i18n/ui/${code}.ts. Edit there, then npm run wear:strings. -->\n<resources>\n${lines.join('\n')}\n</resources>\n`;
}

const check = process.argv.includes('--check');
const stale: string[] = [];
for (const code of SHIPPED) {
  const dir = join(RES, code === 'en' ? 'values' : `values-${code}`);
  const file = join(dir, 'strings.xml');
  const xml = wearXml(code);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== xml) stale.push(file);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, xml);
}
if (stale.length) {
  console.error(`Watch text out of date (run npm run wear:strings):\n${stale.join('\n')}`);
  process.exit(1);
}
console.log(check ? `wear strings ok: ${SHIPPED.join(', ')}` : `wrote watch text for ${SHIPPED.join(', ')}`);
