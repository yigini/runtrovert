// Generates ambient background loops for the splash / welcome / start screens.
// Everything is drawn in code from the brand palette: original, tiny, seamless.
//
//   node scripts/make-bg-video.mjs            # all styles
//   node scripts/make-bg-video.mjs painterly  # one style
//   node scripts/make-bg-video.mjs --frames   # preview frames only (no ffmpeg)
//
// Output per style: assets/bg-<style>.mp4 (1080x1920, 30 fps, 12 s loop, muted)
//                   assets/bg-<style>-poster.png
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const W = 1080, H = 1920, FPS = 30, SECONDS = 12, FRAMES = FPS * SECONDS;
const C = { cream: '#f6f1ea', ink: '#2b2733', mint: '#c9e7d6', mint2: '#a9d4bd', mint3: '#8fc3a6', lilac: '#d9d0f0', lilacDeep: '#4a3f6b', peach: '#f7c9b6', butter: '#f5e3a8', sky: '#c5dcf0', sky2: '#d7e6f4' };

// ---- deterministic noise ----------------------------------------------------
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
function perm() { const p = []; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return [...p, ...p]; }
const P = perm();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + t * (b - a);
const grad = (h, x, y) => { const v = h & 3; return (v & 1 ? -x : x) + (v & 2 ? -y : y); };
function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = P[X] + Y, b = P[X + 1] + Y;
  return lerp(lerp(grad(P[a], x, y), grad(P[b], x - 1, y), u), lerp(grad(P[a + 1], x, y - 1), grad(P[b + 1], x - 1, y - 1), u), v);
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); a *= 0.5; f *= 2; } return s; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---- shared helpers ---------------------------------------------------------
function hillY(x, yBase, amp, freq, phase, t) {
  return yBase + Math.sin((x / W) * Math.PI * freq + phase + t) * amp + Math.sin((x / W) * Math.PI * freq * 2.3 + phase * 1.7 + t * 1.3) * amp * 0.3;
}
function hillPath(ctx, yBase, amp, freq, phase, t, step = 12) {
  ctx.beginPath(); ctx.moveTo(-50, H);
  for (let x = -50; x <= W + 50; x += step) ctx.lineTo(x, hillY(x, yBase, amp, freq, phase, t));
  ctx.lineTo(W + 50, H); ctx.closePath();
}
function cloud(ctx, cx, cy, s, alpha) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 1], [0.7, 0.1, 0.75], [-0.7, 0.15, 0.7], [0.3, -0.35, 0.65], [-0.3, -0.3, 0.6]]) {
    ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s * 0.6, r * s, r * s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function creamFade(ctx, from = 0.78) {
  const f = ctx.createLinearGradient(0, H * from, 0, H);
  f.addColorStop(0, 'rgba(246,241,234,0)'); f.addColorStop(1, 'rgba(246,241,234,0.96)');
  ctx.fillStyle = f; ctx.fillRect(0, H * from, W, H * (1 - from));
}
function grain(ctx, i, amount = 10) {
  const img = ctx.getImageData(0, 0, W, H); const d = img.data; let s = (i * 2654435761) >>> 0;
  for (let k = 0; k < d.length; k += 4) { s = (s * 1664525 + 1013904223) >>> 0; const n = ((s >>> 16) & 0xff) / 255 - 0.5; const g = n * amount; d[k] += g; d[k + 1] += g; d[k + 2] += g; }
  ctx.putImageData(img, 0, 0);
}
function runnerDot(ctx, x, y, r = 22) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

// ---- STYLE: flat (the original motion graphic) ------------------------------
function drawFlat(ctx, i) {
  const t = (i / FRAMES) * Math.PI * 2;
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  g.addColorStop(0, '#b9d2ec'); g.addColorStop(0.55, C.sky); g.addColorStop(1, '#e9dfe6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sunY = 520 + Math.sin(t) * 28, sunX = 780 + Math.cos(t) * 10;
  ctx.fillStyle = C.butter; ctx.beginPath(); ctx.arc(sunX, sunY, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.35; ctx.fillStyle = C.peach; ctx.beginPath(); ctx.arc(sunX, sunY, 210 + Math.sin(t * 2) * 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  const span = W + 600;
  for (const [k, baseX, y, s, a] of [[0, 160, 420, 150, 0.65], [1, 620, 300, 110, 0.55], [2, 980, 560, 90, 0.5]]) cloud(ctx, ((baseX + (i / FRAMES) * span) % span) - 300, y + Math.sin(t + k) * 8, s, a);
  hillPath(ctx, 1180, 70, 1.8, 0.4, t); ctx.fillStyle = C.mint; ctx.fill();
  hillPath(ctx, 1340, 90, 1.4, 2.1, t); ctx.fillStyle = C.mint2; ctx.fill();
  hillPath(ctx, 1520, 110, 1.1, 4.0, t); ctx.fillStyle = C.mint3; ctx.fill();
  ctx.strokeStyle = C.cream; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.setLineDash([2, 34]); ctx.lineDashOffset = -((i / FRAMES) * 36 * 8) % 36;
  ctx.beginPath(); for (let x = 80; x <= W - 80; x += 10) { const y = hillY(x, 1340, 90, 1.4, 2.1, t) - 22; x === 80 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
  const p = (1 - Math.cos(t)) / 2, rx = 220 + p * (W - 440);
  runnerDot(ctx, rx, hillY(rx, 1340, 90, 1.4, 2.1, t) - 48 - Math.abs(Math.sin(i * 0.5)) * 8);
  creamFade(ctx);
}

// ---- STYLE: painterly (photographic dawn, graded into the palette) ----------
function drawPainterly(ctx, i) {
  const t = (i / FRAMES) * Math.PI * 2;
  const u = i / FRAMES;

  // Sky: gradient + slow-moving haze. Computed at quarter resolution then scaled.
  const top = hex('#9fb8d8'), midc = hex(C.sky), hor = hex('#f3d9c6');
  const sw = W / 4, sh = Math.ceil((H * 0.64) / 4);
  const small = createCanvas(sw, sh); const sctx = small.getContext('2d');
  const img = sctx.createImageData(sw, sh); const d = img.data;
  for (let y = 0; y < sh; y++) {
    const fy = (y * 4) / H;
    for (let x = 0; x < sw; x++) {
      const k = (y * sw + x) * 4;
      const s = fy / 0.64;
      let col = s < 0.5 ? mix(top, midc, s * 2) : mix(midc, hor, Math.min(1, (s - 0.5) * 2));
      const n = fbm((x * 4) / 520 + Math.sin(t) * 0.6, (y * 4) / 420 + Math.cos(t) * 0.3, 3);
      const hz = Math.max(0, n) * (0.35 + fy * 0.5);
      col = mix(col, hex(C.cream), hz * 0.55);
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.fillStyle = rgb(hor); ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, sw, sh, 0, 0, W, H * 0.64);

  // Sun: soft disc with wide warm bloom
  const sunX = 760 + Math.cos(t) * 10, sunY = 700 + Math.sin(t) * 22;
  for (const [r, a, c] of [[520, 0.10, C.peach], [380, 0.16, C.peach], [260, 0.22, C.butter], [170, 0.55, C.butter], [120, 0.9, '#fbeccb']]) {
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
    g.addColorStop(0, rgb(hex(c), a)); g.addColorStop(1, rgb(hex(c), 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI * 2); ctx.fill();
  }

  // Distant ridges: bluish, soft; mid: mint; near: deeper mint
  const ridges = [
    { yb: 1140, amp: 55, fq: 2.2, ph: 0.3, col: mix(hex('#b9cfe0'), hex(C.lilac), 0.4), blur: 0.55, par: 0.25 },
    { yb: 1250, amp: 75, fq: 1.7, ph: 1.9, col: mix(hex(C.mint), hex('#b9cfe0'), 0.35), blur: 0.3, par: 0.5 },
    { yb: 1400, amp: 95, fq: 1.3, ph: 3.6, col: hex(C.mint2), blur: 0.0, par: 1.0 },
  ];
  const drawRidge = (r) => {
    const col = mix(r.col, hex('#dfe6ee'), r.blur);
    hillPath(ctx, r.yb, r.amp, r.fq, r.ph, t * r.par * 0.6, 8);
    ctx.fillStyle = rgb(col); ctx.fill();
    ctx.strokeStyle = rgb(hex(C.cream), 0.18 + r.blur * 0.2); ctx.lineWidth = 26 + r.blur * 40; ctx.lineCap = 'round';
    ctx.beginPath(); for (let x = -50; x <= W + 50; x += 8) { const y = hillY(x, r.yb, r.amp, r.fq, r.ph, t * r.par * 0.6) - 4; x === -50 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  };
  drawRidge(ridges[0]); drawRidge(ridges[1]);

  // Tree line on the mid ridge: small, varied, fog-faded, clustered — reads as a distant wood
  const treeCol = mix(hex(C.mint2), hex(C.lilacDeep), 0.45);
  seed = 11;
  for (let k = 0; k < 46; k++) {
    const bx = -20 + k * 25 + rnd() * 14;
    const by = hillY(bx, 1250, 75, 1.7, 1.9, t * 0.5 * 0.6) + 3;
    const h = 22 + rnd() * 30, w = 7 + rnd() * 8;
    const sway = Math.sin(t * 2 + k * 0.7) * 1.2;
    const fog = 0.35 + 0.45 * Math.max(0, fbm(bx / 260 + Math.sin(t) * 0.5, 2.2, 2) + 0.4);
    ctx.fillStyle = rgb(mix(treeCol, hex('#dfe6ee'), 1 - Math.min(1, fog)));
    ctx.beginPath();
    ctx.moveTo(bx + sway, by - h);
    ctx.quadraticCurveTo(bx + w + sway, by - h * 0.45, bx + w * 0.6, by);
    ctx.lineTo(bx - w * 0.6, by);
    ctx.quadraticCurveTo(bx - w + sway, by - h * 0.45, bx + sway, by - h);
    ctx.closePath(); ctx.fill();
  }

  drawRidge(ridges[2]);

  // Ground mist drifting across the valley (periodic)
  for (const [k, yb, a, sp] of [[0, 1330, 0.5, 1], [1, 1480, 0.65, -1]]) {
    const mg = ctx.createLinearGradient(0, yb - 120, 0, yb + 120);
    mg.addColorStop(0, rgb(hex(C.cream), 0)); mg.addColorStop(0.5, rgb(hex(C.cream), a)); mg.addColorStop(1, rgb(hex(C.cream), 0));
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.moveTo(-50, yb + 140);
    for (let x = -50; x <= W + 50; x += 14) ctx.lineTo(x, yb + Math.sin((x / W) * 6 + k + sp * t) * 40 + fbm(x / 250 + Math.sin(t) * sp, k * 9, 2) * 90);
    ctx.lineTo(W + 50, yb + 140); ctx.closePath(); ctx.fill();
  }

  // Foreground: darker soft band with the dotted path and the dot
  hillPath(ctx, 1560, 60, 1.6, 5.2, t * 0.6, 8); ctx.fillStyle = rgb(mix(hex(C.mint3), hex(C.ink), 0.18)); ctx.fill();
  ctx.strokeStyle = rgb(hex(C.cream), 0.85); ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.setLineDash([2, 30]); ctx.lineDashOffset = -((u * 32 * 8) % 32);
  ctx.beginPath(); for (let x = 60; x <= W - 60; x += 10) { const y = hillY(x, 1560, 60, 1.6, 5.2, t * 0.6) - 18; x === 60 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
  const p = (1 - Math.cos(t)) / 2, rx = 200 + p * (W - 400);
  runnerDot(ctx, rx, hillY(rx, 1560, 60, 1.6, 5.2, t * 0.6) - 44 - Math.abs(Math.sin(i * 0.5)) * 7, 20);

  // Vignette, cream fade, fine grain
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.95);
  vg.addColorStop(0, 'rgba(43,39,51,0)'); vg.addColorStop(1, 'rgba(43,39,51,0.10)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  creamFade(ctx, 0.8);
  grain(ctx, i, 9);
}

// ---- STYLE: abstract (breathing gradients, light leaks, one sharp dot) -------
function drawAbstract(ctx, i) {
  const t = (i / FRAMES) * Math.PI * 2;
  const u = i / FRAMES;
  const ang = t * 0.5;
  const cx = W / 2, cy = H / 2, L = H * 0.75;
  const g = ctx.createLinearGradient(cx - Math.cos(ang) * L, cy - Math.sin(ang) * L, cx + Math.cos(ang) * L, cy + Math.sin(ang) * L);
  g.addColorStop(0, C.sky); g.addColorStop(0.5, C.cream); g.addColorStop(1, C.lilac);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const fields = [[C.mint, 0.0, 420, 0.55], [C.peach, 2.1, 380, 0.5], [C.butter, 4.2, 330, 0.45], [C.lilac, 1.0, 460, 0.4]];
  for (const [c, ph, r, a] of fields) {
    const x = cx + Math.cos(t + ph) * 300, y = cy + Math.sin(t + ph * 1.3) * 520;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rgb(hex(c), a)); rg.addColorStop(1, rgb(hex(c), 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const lx = -400 + u * (W + 800);
  const lg = ctx.createLinearGradient(lx, 0, lx + 360, H);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.28)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = rgb(hex(C.ink), 0.22); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.setLineDash([2, 26]); ctx.lineDashOffset = -((u * 28 * 6) % 28);
  ctx.beginPath(); ctx.moveTo(120, 1250); ctx.quadraticCurveTo(540, 980, 960, 1200); ctx.stroke(); ctx.setLineDash([]);
  const p = (1 - Math.cos(t)) / 2;
  const qx = (1 - p) * (1 - p) * 120 + 2 * (1 - p) * p * 540 + p * p * 960;
  const qy = (1 - p) * (1 - p) * 1250 + 2 * (1 - p) * p * 980 + p * p * 1200;
  runnerDot(ctx, qx, qy - 30, 22);
  creamFade(ctx, 0.8);
  grain(ctx, i, 7);
}

const STYLES = { flat: drawFlat, painterly: drawPainterly, abstract: drawAbstract };

async function render(name, draw) {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  draw(ctx, 0); writeFileSync(`assets/bg-${name}-poster.png`, canvas.toBuffer('image/png'));
  if (process.argv.includes('--frames')) {
    for (const i of [0, 120, 240]) { draw(ctx, i); writeFileSync(`assets/_prev-${name}-${i}.png`, canvas.toBuffer('image/png')); }
    return;
  }
  const tmp = `assets/bg-${name}.tmp.mp4`;
  const ff = spawn('ffmpeg', ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let i = 0; i < FRAMES; i++) {
    draw(ctx, i); const buf = canvas.data();
    if (!ff.stdin.write(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('exit', r));
  if (code !== 0) throw new Error('ffmpeg failed for ' + name);
  renameSync(tmp, `assets/bg-${name}.mp4`); console.log('wrote', `assets/bg-${name}.mp4`);
}

mkdirSync('assets', { recursive: true });
const wanted = process.argv.filter((a) => STYLES[a]);
for (const name of wanted.length ? wanted : Object.keys(STYLES)) await render(name, STYLES[name]);
