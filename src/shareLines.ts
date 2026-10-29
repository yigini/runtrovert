// The line on a share card. First person, because the runner is the one
// sending it. Dry, a little pleased with itself, never loud. Every line only
// claims what the phone actually knows about the run: the weather from the
// forecast it already had, the time, your own ratings, distance, climb, and
// how it compares with your earlier runs. No invented herons. No place names.
// Pure, so `npm run test:progress` can check it under plain Node.

import type { Comparison } from './progress';

export type ShareSky = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** The weather at the time of a run, kept with the run. */
export interface RunWeather {
  sky: ShareSky;
  tempC: number;
  feelsC: number;
  windKmh: number;
  isDay: boolean;
  sunrise: number | null;
  sunset: number | null;
}

export interface ShareFacts {
  runId: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  climbM: number;
  km: boolean;
  metric: boolean; // temperatures
  quiet: 'crowded' | 'some' | 'empty' | null;
  weather: RunWeather | null;
  cmp: Comparison;
}

/** The card's colour follows what the line is about. */
export type Tone = 'mint' | 'butter' | 'sky' | 'peach' | 'lilac';

interface Pick {
  tone: Tone;
  lines: string[];
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function distWords(m: number, km: boolean): string {
  const v = km ? m / 1000 : m / 1609.344;
  return `${v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1)} ${km ? 'km' : 'miles'}`;
}

function clockWords(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}

function minutesWords(s: number): string {
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r}` : `${h} hours`;
}

function temp(c: number, metric: boolean): string {
  return `${Math.round(metric ? c : c * 1.8 + 32)}°`;
}

function clock(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function marginWords(s: number): string {
  const t = Math.round(s);
  if (t < 60) return `${t} second${t === 1 ? '' : 's'}`;
  return clock(t);
}

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];

/** Every fact that applies, strongest first, each with its own small bank of lines. */
export function candidates(f: ShareFacts): Pick[] {
  const out: Pick[] = [];
  const c = f.cmp;
  const d = distWords(f.distanceM, f.km);
  const w = f.weather;
  const hour = new Date(f.startedAt).getHours();
  const dow = new Date(f.startedAt).getDay();
  const weekend = dow === 0 || dow === 6;
  const dur = minutesWords(f.durationS);

  if (c.best) {
    const b = c.best;
    if (b.marginS == null) {
      out.push({ tone: 'mint', lines: [
        `My first ${b.label}. ${clock(b.seconds)}. Mostly just pleased I finished.`,
        `First ever ${b.label}. Told the phone, now telling you. That's the whole list.`,
        `${b.label.charAt(0).toUpperCase() + b.label.slice(1)}: done, for the first time. No medal. Didn't need one.`,
      ] });
    } else {
      out.push({ tone: 'mint', lines: [
        `New ${b.label} best. Nobody saw. That was the plan.`,
        `Fastest ${b.label} I've run. By ${marginWords(b.marginS)}. I'm not making a thing of it.`,
        `${clock(b.seconds)} for ${b.label}. My best. You're one of about three people hearing this.`,
        `Beat my old ${b.label} time by ${marginWords(b.marginS)}. The only rival I've got is me, and I won.`,
        `A ${b.label} best, witnessed by nobody. Reporting it to you, briefly.`,
      ] });
    }
  }

  if (c.firstRun) {
    out.push({ tone: 'lilac', lines: [
      `First run with Runtrovert. ${d}. A start, quietly.`,
      `Run number one. ${d}. Nobody watched, which helped.`,
    ] });
  }

  if (c.gapDays != null && c.gapDays >= 14) {
    const weeks = Math.round(c.gapDays / 7);
    const gap = weeks <= 7 ? `${NUM[weeks] ?? weeks} weeks` : `${Math.round(c.gapDays / 30)} months`;
    out.push({ tone: 'lilac', lines: [
      `First run in ${gap}. The legs remembered. Mostly.`,
      `Back out after ${gap}. No speeches. ${d}.`,
      `${gap.charAt(0).toUpperCase() + gap.slice(1)} off, then ${d}. Picking up where I left it.`,
    ] });
  }

  if (c.recentBest) {
    out.push({ tone: 'mint', lines: [
      `Fastest ${c.recentBest.label} in three months. Not my best ever. My best lately, which counts.`,
      `${clock(c.recentBest.seconds)} for ${c.recentBest.label}. Quickest in 90 days.`,
    ] });
  }

  if (c.longest) {
    out.push({ tone: 'mint', lines: c.longest === 'ever' ? [
      `Longest run yet. ${d}. I'll tell you about it. Briefly.`,
      `${d}. Further than I've ever gone. Didn't need anyone to clap.`,
      `New longest run: ${d}. The second half was just me and my thoughts. We're fine.`,
    ] : [
      `${d}, my longest in a while. Felt like it, too.`,
      `Longest run in two months. ${d} of not talking to anyone.`,
    ] });
  }

  if (c.recharge != null && c.recharge >= 2) {
    out.push({ tone: 'butter', lines: [
      `Left tired. Came back ${NUM[c.recharge]} faces lighter.`,
      `${d} of not talking. Battery: noticeably fuller.`,
      `Went out flat, came back better. ${dur} well spent.`,
    ] });
  }

  if (c.slowestThisMonth && c.recharge != null && c.recharge >= 1) {
    out.push({ tone: 'butter', lines: [
      'Slowest run this month. Best mood after. Make of that what you will.',
      `Slow on purpose, mostly. Came back happier. ${d}.`,
    ] });
  }

  if (w) {
    const t = temp(w.tempC, f.metric);
    const ft = temp(w.feelsC, f.metric);
    if (w.sky === 'storm') out.push({ tone: 'sky', lines: [`Thunder about, and I went anyway. ${d}, slightly smug.`, `Ran between storms. ${d}. The sky held off. Mostly.`] });
    else if (w.sky === 'snow') out.push({ tone: 'sky', lines: ['Fresh snow. The only footprints were mine.', `${d} in the snow. The world went quiet and so did I.`, `Snow, ${t}. Everyone else stayed in. Their loss.`] });
    else if (w.sky === 'rain') out.push({ tone: 'sky', lines: [
      f.quiet === 'empty' ? `${d} in the rain. The path was empty. Rain does that.` : `${d} in the rain. Wet, but entirely worth it.`,
      `Rain, ${clockWords(f.startedAt)}. Everyone else stayed in. I didn't.`,
      `Ran in the rain. Shoes are drying. I'm smug.`,
    ] });
    else if (w.sky === 'drizzle') out.push({ tone: 'sky', lines: [`Light rain. Just enough to keep people indoors. ${d}.`, `Drizzle, ${t}. Damp, quiet, good.`] });
    else if (w.sky === 'fog') out.push({ tone: 'sky', lines: ['Fog the whole way. Nobody could see me. Ideal.', `${d} through the fog. The world was about 50 metres wide.`] });
    if (w.feelsC <= 0) out.push({ tone: 'sky', lines: [`${ft} out. The keen ones stayed in bed. So I'm told.`, `${ft}. Cold enough to keep the crowds home. ${d}.`] });
    else if (w.tempC >= 27) out.push({ tone: 'peach', lines: [`${t} and I went anyway. Slowly, on purpose.`, `${t}. Shade first, pace second. ${d}.`] });
    if (w.windKmh >= 30) out.push({ tone: 'sky', lines: ['Out against the wind, home with it. Fair trade.', `Windy. ${d}, half of it heroic, half of it free.`] });
  }

  const beforeSunrise = w?.sunrise != null ? f.startedAt < w.sunrise : hour < 6;
  const afterDark = w ? !w.isDay && !beforeSunrise : hour >= 20;
  if (beforeSunrise) out.push({ tone: 'lilac', lines: ['Out before sunrise. The streetlights were the only crowd.', `${clockWords(f.startedAt)}. Ran before the day could ask anything of me.`] });
  else if (afterDark) out.push({ tone: 'lilac', lines: ['A run after dark. Fewer eyes, more stars.', `${d} under streetlights. The roads were mine.`] });

  if (f.quiet === 'crowded') out.push({ tone: 'peach', lines: ['It was busy out there. I ran anyway and spoke to nobody.', `Crowded route, ${d}, zero conversations. A skill.`] });
  else if (f.quiet === 'empty' && !(w && (w.sky === 'rain'))) out.push({ tone: 'lilac', lines: ['Had the whole path to myself. Not a soul.', `${d}, and I don't think I passed anyone. Perfect.`] });

  const kmCount = f.distanceM / 1000;
  if (kmCount >= 1 && f.climbM / kmCount >= 15) out.push({ tone: 'peach', lines: [`${Math.round(f.climbM)} m of climbing. Up is also a direction.`, `Hills, ${Math.round(f.climbM)} m of them. My legs have opinions now.`] });

  if (c.baselineDeltaS != null && c.baselineDeltaS <= -5) {
    const s = Math.round(-c.baselineDeltaS * (f.km ? 1 : 1.609344));
    out.push({ tone: 'mint', lines: [`${s} seconds a ${f.km ? 'kilometre' : 'mile'} quicker than my usual. Same legs, apparently better.`, `Quicker than my usual by ${s} s a ${f.km ? 'km' : 'mile'}. I'm keeping this to myself. And you.`] });
  }

  if (c.runsThisWeek >= 3 && c.runsThisWeek <= 7) out.push({ tone: 'lilac', lines: [`${ORD[c.runsThisWeek]} run this week. Quietly turning into someone who runs.`, `Run ${c.runsThisWeek} of the week. Not a streak. Just a habit with good manners.`] });

  if (weekend && hour < 9) out.push({ tone: 'lilac', lines: [`${dow === 0 ? 'Sunday' : 'Saturday'}, ${clockWords(f.startedAt)}. The town was still asleep. I didn't wake it.`] });
  else if (!weekend && hour >= 11 && hour < 14) out.push({ tone: 'lilac', lines: ['A lunchtime run. Nobody noticed I was gone.', `${d} at lunch. Back before anyone asked.`] });

  if (f.distanceM < 3000) out.push({ tone: 'lilac', lines: [`Only ${d}. Still counts. Especially to me.`, `${d}. Small run, no audience, fully counted.`] });

  if (w && w.sky === 'cloud') out.push({ tone: 'lilac', lines: [`Grey and still. Good for disappearing for ${dur}.`] });
  if (w && w.sky === 'clear' && w.isDay && w.tempC < 27 && w.feelsC > 0) out.push({ tone: 'sky', lines: [`${temp(w.tempC, f.metric)} and clear. No excuses, no audience.`, `Blue sky, ${d}, nobody to talk to. Ideal conditions.`] });

  out.push({ tone: 'lilac', lines: [
    `${d}. Nobody saw. Which was the plan.`,
    `${dur} where nobody could reach me. Recommended.`,
    `${d} of not talking to anyone. Back now. Briefly.`,
    `Went for a run. Came back. That's the news.`,
  ] });
  return out;
}

/**
 * The line for this run. `turn` is how many times "Another line" was tapped:
 * 0 is the strongest fact with a line picked by the run itself (so a run keeps
 * its line), and each tap walks on through the other facts and lines.
 */
export function pickLine(f: ShareFacts, turn = 0): { line: string; tone: Tone } {
  const picks = candidates(f);
  const seed = seedOf(`run${f.runId}:${f.startedAt}`);
  // Interleave: first line of each fact in order, then the second of each, ...
  const flat: Array<{ line: string; tone: Tone }> = [];
  const depth = Math.max(...picks.map((p) => p.lines.length));
  for (let k = 0; k < depth; k++) {
    for (const p of picks) {
      if (k < p.lines.length) flat.push({ line: p.lines[(k + seed) % p.lines.length], tone: p.tone });
    }
  }
  const seen = new Set<string>();
  const unique = flat.filter((x) => (seen.has(x.line) ? false : (seen.add(x.line), true)));
  return unique[turn % unique.length];
}

/** How many different lines a run can offer before they come round again. */
export function lineCount(f: ShareFacts): number {
  return new Set(candidates(f).flatMap((p) => p.lines)).size;
}
