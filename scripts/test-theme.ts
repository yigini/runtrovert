// The dark palette: same names as the light one, and every text pair at WCAG AA.
// Reads src/theme.ts as text (it imports react-native, which Node can't load).
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/theme.ts', import.meta.url), 'utf8');

function palette(name: string): Record<string, string> {
  const m = src.match(new RegExp(`const ${name}(?:: Palette)? = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`no ${name} palette`);
  return Object.fromEntries([...m[1].matchAll(/(\w+): '([^']+)'/g)].map((x) => [x[1], x[2]]));
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const light = palette('light');
const dark = palette('dark');
let fails = 0;
const fail = (m: string) => {
  fails++;
  console.error(`FAIL ${m}`);
};

for (const k of Object.keys(light)) if (!(k in dark)) fail(`dark has no ${k}`);
for (const k of Object.keys(dark)) if (!(k in light)) fail(`light has no ${k}`);

const pairs: Array<[string, string, number]> = [];
for (const fg of ['text', 'inkSoft', 'inkMuted', 'muted']) for (const bg of ['bg', 'card', 'sunk', 'lilacSoft', 'mintSoft']) pairs.push([fg, bg, 4.5]);
for (const p of ['mint', 'lilac', 'peach', 'butter', 'sky']) {
  for (const bg of [p, 'bg', 'card']) pairs.push([`${p}Deep`, bg, 4.5]);
  pairs.push(['text', p, 4.5], ['inkMuted', p, 4.5], [`${p}Mark`, 'card', 3], [`${p}Mark`, 'bg', 3]);
}
pairs.push(['lilacDeep', 'lilacSoft', 4.5], ['mintDeep', 'mintSoft', 4.5], ['onInk', 'ink', 4.5], ['onInkMuted', 'ink', 4.5], ['ring', 'card', 3], ['danger', 'bg', 4.5], ['zoneLow', 'card', 3]);

for (const [fg, bg, need] of pairs) {
  const r = ratio(dark[fg], dark[bg]);
  if (r < need) fail(`dark ${fg} on ${bg}: ${r.toFixed(2)} < ${need}`);
}

if (fails) process.exit(1);
console.log(`theme ok: ${Object.keys(dark).length} tokens, ${pairs.length} dark pairs at AA`);
