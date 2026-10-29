import type { Hour, Weather } from './forecast';

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
  let lines: string[];
  if (w.sky === 'storm') lines = ['Thunder about.\nThe sofa is also a route.', 'Storms around.\nMaybe give it an hour.'];
  else if (w.sky === 'snow') lines = ['Snow. Fresh tracks,\nall of them yours.', `${t} and snow.\nThe world went silent.`];
  else if (w.sky === 'rain' || rainSoon) lines = [`${t} and rain.\nThe park is yours.`, 'Rain. Everyone else\nstayed in.'];
  else if (w.sky === 'drizzle') lines = [`${t} and drizzle.\nEveryone else stayed in.`, 'Light rain. Just enough\nto keep people indoors.'];
  else if (w.sky === 'fog') lines = ['Fog. The world\nwent quiet for you.', `${t} and fog.\nNobody can see you anyway.`];
  else if (!w.isDay) lines = ['Dark out.\nFewer eyes, more stars.', `${t} under streetlights.\nThe roads are empty.`];
  else if (w.feelsC <= 0) lines = [`${t}. Cold enough\nto keep the crowds home.`, `${t}. The keen ones\nare still in bed.`];
  else if (w.tempC >= 27) lines = [`${t} already.\nGo early, or go slow.`, `${t}. Shade first,\npace second.`];
  else if (w.windKmh >= 30) lines = ['Windy. Out against it,\nhome with it.', 'Wind’s up. Hard out,\neasy home.'];
  else if (w.sky === 'clear') lines = [`${t} and clear.\nNo excuses, no audience.`, `${t} and blue.\nGo before it gets busy.`];
  else lines = [`${t}, grey and still.\nGood for disappearing.`, `Overcast, ${t}.\nNobody’s looking up.`];
  return pickFor(lines, day + w.sky);
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
  if (hours.every((h) => h.rainP >= 70)) return { label: 'Best window', text: 'No dry hour left today. A shell, or tomorrow.' };
  let best = 0;
  hours.forEach((h, i) => {
    if (score(h, i) < score(hours[best], best)) best = i;
  });
  const h = hours[best];
  const what = `${h.rainP < 20 ? 'dry' : `${h.rainP}% rain`}, ${formatTemp(h.tempC, metric)}`;
  return { label: 'Best window', text: best === 0 ? `Now. ${cap(what)}.` : `From ${clock(h.t)}. ${cap(what)}.` };
}

export function wear(w: Weather): Suggestion {
  const f = w.feelsC;
  let kit =
    f <= -5 ? 'Thermal layer, gloves, hat' :
    f <= 3 ? 'Long sleeves, gloves, a hat' :
    f <= 8 ? 'Long sleeves, light gloves' :
    f <= 13 ? 'Long sleeves or a light layer' :
    f <= 19 ? 'T-shirt and shorts' :
    f <= 24 ? 'Light kit. Bring water' :
    'As little as is decent. Water';
  const extras: string[] = [];
  if (w.sky === 'rain' || w.sky === 'drizzle' || (w.hours[0]?.rainP ?? 0) >= 50) extras.push('a shell');
  else if (w.windKmh >= 25) extras.push('something windproof');
  if (!w.isDay) extras.push('something reflective');
  if (extras.length) kit += `, plus ${extras.join(' and ')}`;
  return { label: 'Wear', text: `${kit}.` };
}

export function light(w: Weather, now = Date.now()): Suggestion | null {
  if (w.sunset && now < w.sunset && (!w.sunrise || now >= w.sunrise)) {
    const soon = w.sunset - now < 90 * 60 * 1000;
    return { label: 'Light', text: soon ? `Dark at ${clock(w.sunset)}. Take a light.` : `Daylight until ${clock(w.sunset)}.` };
  }
  const next = w.sunrise && now < w.sunrise ? w.sunrise : w.nextSunrise;
  return next ? { label: 'Light', text: `Light again at ${clock(next)}. Wear something bright.` } : null;
}

export function suggestions(w: Weather, metric: boolean, now = Date.now()): Suggestion[] {
  return [bestWindow(w, metric, now), wear(w), light(w, now)].filter((s): s is Suggestion => s != null);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
