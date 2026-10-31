// Generates every icon asset from the Runtrovert mark. Run: node scripts/make-icons.mjs
// The mark (Oct 2026, "Loop"): one hand-drawn loop whose finish runs just past its start.
// A run that comes home. Same path as src/components/Mark.tsx and the watch's ic_mark.xml.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

export const LOOP = 'M104 176 C 56 160, 40 100, 76 66 C 112 32, 184 40, 198 96 C 210 148, 180 196, 136 200';
const INK = '#2b2733', CREAM = '#f6f1ea', MINT = '#c9e7d6';
const loop = (ink, width = 28) => `<path d="${LOOP}" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${bg ? `<rect width="240" height="240" fill="${bg}"/>` : ''}${body}</svg>`;
const scaled = (s, body) => `<g transform="translate(120 120) scale(${s}) translate(-120 -120)">${body}</g>`;

// iOS: full-bleed square (Apple masks the corners). Cream tile, ink mark.
const icon = svg(loop(INK), CREAM);
// Android adaptive: foreground mark centred in the safe zone (inner 66%), background plain.
const fg = svg(scaled(0.62, loop(INK)), null);
const bg = svg('', CREAM);
// Android 13+ themed icon: the system tints this silhouette from the wallpaper.
const mono = svg(scaled(0.62, loop('#000000')), null);
const splash = svg(scaled(0.34, loop(INK)), CREAM);
const iconDark = svg(loop(CREAM), INK);
const iconMint = svg(loop(INK), MINT);
// Android status-bar notification icon: white silhouette on transparent, a touch heavier so it holds at 24 dp.
const notification = svg(scaled(1.08, loop('#ffffff', 32)), null);
// Round watch launcher icon: cream disc, ink mark.
const watch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="120" fill="${CREAM}"/>${scaled(0.86, loop(INK))}</svg>`;

mkdirSync('assets', { recursive: true });
const out = async (path, s, size, fmt = 'png') => {
  const img = sharp(Buffer.from(s)).resize(size, size);
  await (fmt === 'webp' ? img.webp({ lossless: true }) : img.png()).toFile(path);
  console.log('wrote', path, size);
};
await out('assets/icon.png', icon, 1024);
await out('assets/icon-dark.png', iconDark, 1024);
await out('assets/icon-tinted.png', iconMint, 1024);
await out('assets/android-icon-foreground.png', fg, 1024);
await out('assets/android-icon-background.png', bg, 1024);
await out('assets/android-icon-monochrome.png', mono, 1024);
await out('assets/splash-icon.png', splash, 1024);
await out('assets/notification-icon.png', notification, 96);
await out('assets/favicon.png', icon, 64);
writeFileSync('assets/mark.svg', icon);

// Landing site (site/): header mark, favicons.
writeFileSync('site/mark.svg', icon);
await out('site/favicon.png', icon, 64);
await out('site/apple-touch-icon.png', icon, 180);
const ico16 = await sharp(Buffer.from(icon)).resize(16, 16).png().toBuffer();
const ico32 = await sharp(Buffer.from(icon)).resize(32, 32).png().toBuffer();
writeFileSync('site/favicon.ico', ico([ico16, 16], [ico32, 32]));
console.log('wrote site/favicon.ico 16+32');

// Wear OS launcher icons.
for (const [dir, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144]]) {
  await out(`wear/app/src/main/res/mipmap-${dir}/ic_launcher.webp`, watch, size, 'webp');
}

// A minimal .ico holding PNG images.
function ico(...imgs) {
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let offset = head.length;
  imgs.forEach(([buf, size], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size, e); head.writeUInt8(size, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...imgs.map(([b]) => b)]);
}
