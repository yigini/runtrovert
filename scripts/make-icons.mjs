// Generates all app icon assets from the Runtrovert mark. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const INK = '#2b2733', CREAM = '#f6f1ea', MINT = '#c9e7d6';
const ring = (ink) => `<path d="M185.7 102.4 A 68 68 0 1 1 137.6 54.3" stroke="${ink}" stroke-width="32" stroke-linecap="round" fill="none"/><circle cx="120" cy="120" r="24" fill="${ink}"/>`;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${bg ? `<rect width="240" height="240" fill="${bg}"/>` : ''}${body}</svg>`;

// iOS: full-bleed square (Apple masks the corners). Cream tile, ink mark.
const icon = svg(ring(INK), CREAM);
// Android adaptive: foreground mark centred in the safe zone (inner 66%), background plain.
const fgScaled = `<g transform="translate(120 120) scale(0.62) translate(-120 -120)">${ring(INK)}</g>`;
const fg = svg(fgScaled, null);
const bg = svg('', CREAM);
const mono = svg(`<g transform="translate(120 120) scale(0.62) translate(-120 -120)">${ring('#000000')}</g>`, null);
// Splash: small mark on cream.
const splash = svg(`<g transform="translate(120 120) scale(0.34) translate(-120 -120)">${ring(INK)}</g>`, CREAM);
// Alternate dark tile (for marketing / dark-mode icon on iOS 18+).
const iconDark = svg(ring(CREAM), INK);
const iconMint = svg(ring(INK), MINT);

mkdirSync('assets', { recursive: true });
const out = async (name, s, size) => {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(`assets/${name}`);
  console.log('wrote', name, size);
};
await out('icon.png', icon, 1024);
await out('icon-dark.png', iconDark, 1024);
await out('icon-tinted.png', iconMint, 1024);
await out('android-icon-foreground.png', fg, 1024);
await out('android-icon-background.png', bg, 1024);
await out('android-icon-monochrome.png', mono, 1024);
await out('splash-icon.png', splash, 1024);
await out('favicon.png', icon, 64);
writeFileSync('assets/mark.svg', icon);
