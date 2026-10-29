import type { Hour, Weather } from './forecast';
import { finish } from './i18n/lang';
import { voice } from './i18n/voice';
import type { HeadlineSky } from './i18n/voice/types';

// What the home screen says about the weather. Dry, a little on your side,
// never a lecture. Pure functions so they can be checked off the phone.

export interface Suggestion {
  label: string;
  text: string;
}

export function formatTemp(c: number, metric: boolean): string {
  return `${Math.round(metric ? c : c * 1.8 + 32)}°`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Same line all day for the same sky, so the screen doesn't shuffle every time you open it. */
function pickFor(lines: string[], seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return lines[h % lines.length];
}

export function headline(w: Weather, metric: boolean, now = Date.now()): string {
  const t = formatTemp(w.tempC, metric);
  const rainSoon = (w.hours[0]?.rainP ?? 0) >= 60;
  const day = new Date(now).toDateString();
  const kind: HeadlineSky =
    w.sky === 'storm' ? 'storm' :
    w.sky === 'snow' ? 'snow' :
    w.sky === 'rain' || rainSoon ? 'rain' :
    w.sky === 'drizzle' ? 'drizzle' :
    w.sky === 'fog' ? 'fog' :
    !w.isDay ? 'dark' :
    w.feelsC <= 0 ? 'cold' :
    w.tempC >= 27 ? 'hot' :
    w.windKmh >= 30 ? 'wind' :
    w.sky === 'clear' ? 'clear' :
    'grey';
  return finish(pickFor(voice().sky.headline[kind](t), day + w.sky));
}

function score(h: Hour, i: number): number {
  return h.rainP + Math.abs(h.feelsC - 12) * 2 + Math.max(0, h.feelsC - 22) * 2 + (h.isDay ? 0 : 12) + (h.windKmh > 25 ? 10 : 0) + (h.sky === 'storm' ? 80 : 0) + i * 1.5;
}

/** The best hour to go in what's left of today (up to 22:00, at most 12 hours ahead). */
export function bestWindow(w: Weather, metric: boolean, now = Date.now()): Suggestion | null {
  const end = new Date(now);
  end.setHours(22, 0, 0, 0);
  const limit = Math.min(end.getTime(), now + 12 * 3600 * 1000);
  const hours = w.hours.filter((h) => h.t + 3600 * 1000 > now && h.t <= limit);
  if (!hours.length) return null;
  const v = voice().sky;
  if (hours.every((h) => h.rainP >= 70)) return { label: v.bestWindow, text: finish(v.noDryHour) };
  let best = 0;
  hours.forEach((h, i) => {
    if (score(h, i) < score(hours[best], best)) best = i;
  });
  const h = hours[best];
  const what = `${h.rainP < 20 ? v.dry : v.rainChance(h.rainP)}${v.sep ?? ', '}${formatTemp(h.tempC, metric)}`;
  return { label: v.bestWindow, text: finish(best === 0 ? v.now(what) : v.from(clock(h.t), what)) };
}

export function wear(w: Weather): Suggestion {
  const v = voice().sky;
  const f = w.feelsC;
  const kit = v.kit[f <= -5 ? 0 : f <= 3 ? 1 : f <= 8 ? 2 : f <= 13 ? 3 : f <= 19 ? 4 : f <= 24 ? 5 : 6];
  const extras: string[] = [];
  if (w.sky === 'rain' || w.sky === 'drizzle' || (w.hours[0]?.rainP ?? 0) >= 50) extras.push(v.shell);
  else if (w.windKmh >= 25) extras.push(v.windproof);
  if (!w.isDay) extras.push(v.reflective);
  return { label: v.wear, text: finish(v.kitWith(kit, extras)) };
}

export function light(w: Weather, now = Date.now()): Suggestion | null {
  const v = voice().sky;
  if (w.sunset && now < w.sunset && (!w.sunrise || now >= w.sunrise)) {
    const soon = w.sunset - now < 90 * 60 * 1000;
    return { label: v.light, text: finish(soon ? v.darkAt(clock(w.sunset)) : v.daylightUntil(clock(w.sunset))) };
  }
  const next = w.sunrise && now < w.sunrise ? w.sunrise : w.nextSunrise;
  return next ? { label: v.light, text: finish(v.lightAgain(clock(next))) } : null;
}

export function suggestions(w: Weather, metric: boolean, now = Date.now()): Suggestion[] {
  return [bestWindow(w, metric, now), wear(w), light(w, now)].filter((s): s is Suggestion => s != null);
}
