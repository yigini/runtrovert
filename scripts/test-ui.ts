// npm run test:ui — the interface text in every language.
// Each language must give every line English has, in the same shape: the same
// keys, tables of the same length, and a function wherever English has one,
// taking as many values. (tsc checks the types; this catches what a cast or a
// stray `any` would let through, and runs in CI before the build.) No line may
// be empty, and a long line identical to English is a line nobody translated.
// Last, no screen may carry English straight in its JSX: new words go in
// src/i18n/ui/en.ts so every language gets them.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { SHIPPED, type Lang } from '../src/i18n/lang.ts';
import { en } from '../src/i18n/ui/en.ts';
import { UI } from '../src/i18n/ui/index.ts';

let problems: string[] = [];

function same(path: string, a: unknown, b: unknown, code: Lang) {
  if (typeof a === 'function') {
    if (typeof b !== 'function') return problems.push(`${code}: ${path} should be a function`);
    if (a.length !== b.length) problems.push(`${code}: ${path} takes ${b.length} values, English takes ${a.length}`);
    return;
  }
  if (typeof a === 'string') {
    if (typeof b !== 'string') return problems.push(`${code}: ${path} missing`);
    if (a.trim() && !b.trim()) problems.push(`${code}: ${path} is empty`);
    if (code !== 'en' && a.length > 30 && a === b) problems.push(`${code}: ${path} is still English`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return problems.push(`${code}: ${path} needs ${a.length} entries`);
    a.forEach((v, i) => same(`${path}[${i}]`, v, b[i], code));
    return;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return problems.push(`${code}: ${path} missing`);
    for (const k of Object.keys(a)) same(path ? `${path}.${k}` : k, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], code);
    for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${code}: ${path ? `${path}.` : ''}${k} is not in English (renamed?)`);
  }
}

for (const code of SHIPPED) assert.ok(UI[code], `${code} is switched on in SHIPPED but has no interface text`);
for (const [code, strings] of Object.entries(UI)) same('', en, strings, code as Lang);

// English typed straight into a screen.
const root = new URL('..', import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : files(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}
for (const file of [...files(join(root, 'src')), join(root, 'App.tsx')]) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && /[A-Za-z]{2}/.test(n.getText(sf))) {
      problems.push(`${file.slice(root.length)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} English in JSX ("${n.getText(sf).trim().slice(0, 40)}"): move it to src/i18n/ui/en.ts`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`ui ok: ${Object.keys(UI).join(', ')}`);
