// English, the original voice. Every other pack is written against this one.
// The reminder lines and tips stay in lines.ts and tips.ts, where they were
// written; this file gathers them with the lines that used to be inline.

import type { EffortKey } from '../../progress';
import { AFTER_RUN_LINES, AFTER_RUN_TITLES, AFTERNOON_LINES, LAST_LINES, LINES, PLAIN, REFLECT_LINES, REFLECT_TITLES, RHYTHM_LINES, TITLES, WEEKEND_LINES, WINDOW_LINES } from '../../lines';
import { TIPS, TOPICS } from '../../tips';
import type { VoicePack } from './types';
import { clockDigits, distNumber, word } from './util';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
const FACES = ['', 'one face', 'two faces', 'three faces', 'four faces'];

const EFFORT: Record<EffortKey, string> = { '1k': '1 km', mile: '1 mile', '5k': '5 km', '10k': '10 km', half: 'half marathon', full: 'marathon' };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function margin(s: number): string {
  const t = Math.round(s);
  if (t < 60) return `${t} second${t === 1 ? '' : 's'}`;
  return clockDigits(t);
}

function gapWords(days: number): string {
  if (days < 21) return `${Math.round(days / 7) === 1 ? 'a week' : `${days} days`}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export const en: VoicePack = {
  distance: (m, km) => `${distNumber(m, km)} ${km ? 'km' : 'miles'}`,
  minutes(s) {
    const m = Math.round(s / 60);
    if (m < 90) return `${m} minutes`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r}` : `${h} hours`;
  },
  margin,
  clockWords(ms) {
    const d = new Date(ms);
    const h = d.getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  },
  effort: EFFORT,

  share: {
    bestFirst: (k, time, w) => [
      `My first ${EFFORT[k]}. ${time}. Mostly just pleased I finished.`,
      `First ever ${EFFORT[k]}. Told the phone, now telling you. That's the whole list.`,
      `${cap(EFFORT[k])}: done, for the first time. No medal. Didn't need one.`,
    ],
    best: (k, time, m) => [
      `New ${EFFORT[k]} best. Nobody saw. That was the plan.`,
      `Fastest ${EFFORT[k]} I've run. By ${m}. I'm not making a thing of it.`,
      `${time} for ${EFFORT[k]}. My best. You're one of about three people hearing this.`,
      `Beat my old ${EFFORT[k]} time by ${m}. The only rival I've got is me, and I won.`,
      `A ${EFFORT[k]} best, witnessed by nobody. Reporting it to you, briefly.`,
    ],
    firstRun: ({ d }) => [`First run with Runtrovert. ${d}. A start, quietly.`, `Run number one. ${d}. Nobody watched, which helped.`],
    gap(days, { d }) {
      const weeks = Math.round(days / 7);
      const gap = weeks <= 7 ? `${word(NUM, weeks)} weeks` : `${Math.round(days / 30)} months`;
      return [`First run in ${gap}. The legs remembered. Mostly.`, `Back out after ${gap}. No speeches. ${d}.`, `${cap(gap)} off, then ${d}. Picking up where I left it.`];
    },
    recentBest: (k, time) => [
      `Fastest ${EFFORT[k]} in three months. Not my best ever. My best lately, which counts.`,
      `${time} for ${EFFORT[k]}. Quickest in 90 days.`,
    ],
    longestEver: ({ d }) => [
      `Longest run yet. ${d}. I'll tell you about it. Briefly.`,
      `${d}. Further than I've ever gone. Didn't need anyone to clap.`,
      `New longest run: ${d}. The second half was just me and my thoughts. We're fine.`,
    ],
    longestWhile: ({ d }) => [`${d}, my longest in a while. Felt like it, too.`, `Longest run in two months. ${d} of not talking to anyone.`],
    recharge: (n, { d, dur }) => [`Left tired. Came back ${NUM[n]} faces lighter.`, `${d} of not talking. Battery: noticeably fuller.`, `Went out flat, came back better. ${dur} well spent.`],
    slowHappy: ({ d }) => ['Slowest run this month. Best mood after. Make of that what you will.', `Slow on purpose, mostly. Came back happier. ${d}.`],
    storm: ({ d }) => [`Thunder about, and I went anyway. ${d}, slightly smug.`, `Ran between storms. ${d}. The sky held off. Mostly.`],
    snow: ({ d, t }) => ['Fresh snow. The only footprints were mine.', `${d} in the snow. The world went quiet and so did I.`, `Snow, ${t}. Everyone else stayed in. Their loss.`],
    rain: ({ d, at }, empty) => [
      empty ? `${d} in the rain. The path was empty. Rain does that.` : `${d} in the rain. Wet, but entirely worth it.`,
      `Rain, ${at}. Everyone else stayed in. I didn't.`,
      `Ran in the rain. Shoes are drying. I'm smug.`,
    ],
    drizzle: ({ d, t }) => [`Light rain. Just enough to keep people indoors. ${d}.`, `Drizzle, ${t}. Damp, quiet, good.`],
    fog: ({ d }) => ['Fog the whole way. Nobody could see me. Ideal.', `${d} through the fog. The world was about 50 metres wide.`],
    cold: ({ d, ft }) => [`${ft} out. The keen ones stayed in bed. So I'm told.`, `${ft}. Cold enough to keep the crowds home. ${d}.`],
    hot: ({ d, t }) => [`${t} and I went anyway. Slowly, on purpose.`, `${t}. Shade first, pace second. ${d}.`],
    wind: ({ d }) => ['Out against the wind, home with it. Fair trade.', `Windy. ${d}, half of it heroic, half of it free.`],
    beforeSunrise: ({ at }) => ['Out before sunrise. The streetlights were the only crowd.', `${at}. Ran before the day could ask anything of me.`],
    afterDark: ({ d }) => ['A run after dark. Fewer eyes, more stars.', `${d} under streetlights. The roads were mine.`],
    crowded: ({ d }) => ['It was busy out there. I ran anyway and spoke to nobody.', `Crowded route, ${d}, zero conversations. A skill.`],
    empty: ({ d }) => ['Had the whole path to myself. Not a soul.', `${d}, and I don't think I passed anyone. Perfect.`],
    climb: (m) => [`${m} m of climbing. Up is also a direction.`, `Hills, ${m} m of them. My legs have opinions now.`],
    quicker: (s, { km }) => [
      `${s} seconds a ${km ? 'kilometre' : 'mile'} quicker than my usual. Same legs, apparently better.`,
      `Quicker than my usual by ${s} s a ${km ? 'km' : 'mile'}. I'm keeping this to myself. And you.`,
    ],
    week: (n) => [`${ORD[n]} run this week. Quietly turning into someone who runs.`, `Run ${n} of the week. Not a streak. Just a habit with good manners.`],
    weekendEarly: (sunday, { at }) => [`${sunday ? 'Sunday' : 'Saturday'}, ${at}. The town was still asleep. I didn't wake it.`],
    lunch: ({ d }) => ['A lunchtime run. Nobody noticed I was gone.', `${d} at lunch. Back before anyone asked.`],
    short: ({ d }) => [`Only ${d}. Still counts. Especially to me.`, `${d}. Small run, no audience, fully counted.`],
    grey: ({ dur }) => [`Grey and still. Good for disappearing for ${dur}.`],
    clear: ({ d, t }) => [`${t} and clear. No excuses, no audience.`, `Blue sky, ${d}, nobody to talk to. Ideal conditions.`],
    always: ({ d, dur }) => [
      `${d}. Nobody saw. Which was the plan.`,
      `${dur} where nobody could reach me. Recommended.`,
      `${d} of not talking to anyone. Back now. Briefly.`,
      `Went for a run. Came back. That's the news.`,
    ],
  },

  sky: {
    headline: {
      storm: () => ['Thunder about.\nThe sofa is also a route.', 'Storms around.\nMaybe give it an hour.'],
      snow: (t) => ['Snow. Fresh tracks,\nall of them yours.', `${t} and snow.\nThe world went silent.`],
      rain: (t) => [`${t} and rain.\nThe air will be clean.`, 'Rain. Everyone else\nstayed in.'],
      drizzle: (t) => [`${t} and drizzle.\nEveryone else stayed in.`, 'Light rain. Just enough\nto keep people indoors.'],
      fog: (t) => ['Fog. The world\nwent quiet for you.', `${t} and fog.\nNobody can see you anyway.`],
      dark: (t) => ['Dark out.\nFewer eyes, more stars.', `${t} under streetlights.\nWear something bright.`],
      cold: (t) => [`${t}. Cold enough\nto keep the crowds home.`, `${t}. The keen ones\nare still in bed.`],
      hot: (t) => [`${t} already.\nGo early, or go slow.`, `${t}. Shade first,\npace second.`],
      wind: () => ['Windy. Out against it,\nhome with it.', 'Wind’s up. Hard out,\neasy home.'],
      clear: (t) => [`${t} and clear.\nNo excuses, no audience.`, `${t} and blue.\nGo before it gets busy.`],
      grey: (t) => [`${t}, grey and still.\nGood for disappearing.`, `Overcast, ${t}.\nNobody’s looking up.`],
    },
    bestWindow: 'Best window',
    noDryHour: 'No dry hour left today. A shell, or tomorrow.',
    dry: 'dry',
    rainChance: (p) => `${p}% rain`,
    now: (what) => `Now. ${cap(what)}.`,
    from: (time, what) => `From ${time}. ${cap(what)}.`,
    wear: 'Wear',
    kit: [
      'Thermal layer, gloves, hat',
      'Long sleeves, gloves, a hat',
      'Long sleeves, light gloves',
      'Long sleeves or a light layer',
      'T-shirt and shorts',
      'Light kit. Bring water',
      'As little as is decent. Water',
    ],
    shell: 'a shell',
    windproof: 'something windproof',
    reflective: 'something reflective',
    kitWith: (kit, extras) => `${extras.length ? `${kit}, plus ${extras.join(' and ')}` : kit}.`,
    light: 'Light',
    darkAt: (time) => `Dark at ${time}. Take a light.`,
    daylightUntil: (time) => `Daylight until ${time}.`,
    lightAgain: (time) => `Light again at ${time}. Wear something bright.`,
  },

  surprises: {
    lines: {
      'first-run': 'That’s one.\nNobody saw. Perfect.',
      marathon: 'A marathon.\nAlone, on purpose.',
      half: 'Half a marathon.\nWhole person.',
      ten: 'Ten.\nThe number agrees with you.',
      'run-100': 'A hundred runs.\nStill nobody clapping. Still good.',
      'run-50': 'Fifty runs.\nThe quiet kind of habit.',
      anniversary: 'A year ago you went out alone.\nYou kept doing it.',
      'first-snow': 'First snow of the year.\nYou were out in it.',
      longest: 'Longest yet.\nTell no one.',
      rare: 'You passed nobody\nyou had to talk to.',
      rain: 'Wet. Done.\nSmugness permitted.',
      snow: 'Snow run.\nFootprints are the only proof.',
      early: 'Up before the opinions.',
      late: 'Night run.\nThe streets kept it to themselves.',
    },
    round: (n, km) => `${n}.00 ${km ? 'km' : 'mi'}.\nSuspiciously neat.`,
    seasonal: {
      '1-1': 'New year. Same road. Good.',
      '2-14': 'Valentine’s. The route stays loyal.',
      '2-29': 'A day that mostly doesn’t exist. Use it.',
      '6-21': 'Longest day. No need to rush it.',
      '10-31': 'Everyone’s in costume. You’re in shorts.',
      '12-21': 'Shortest day. A short run counts.',
      '12-25': 'Quiet streets today. Finally.',
      '12-31': 'Last run of the year, or first of the next. Both fine.',
    },
  },

  you: {
    bestFirst: (k, time) => ({ title: `Your first ${EFFORT[k]}.`, detail: `${time}. The first one is always a best.` }),
    best: (k, time, m, month) => ({
      title: `New ${EFFORT[k]} best.\nNobody saw. You'll know.`,
      detail: `${time}, ${m < 59.5 ? `${Math.round(m)} s` : clockDigits(m)} quicker than your last best${month ? ` (${month})` : ''}.`,
    }),
    welcomeBack: (days) => ({ title: 'Welcome back.', detail: `First run in ${gapWords(days)}. The legs remember more than you'd think.` }),
    recentBest: (k, time) => ({ title: `Fastest ${EFFORT[k]} in 90 days.`, detail: `${time}. Not an all-time best, but the best of this stretch.` }),
    longestEver: { title: 'Your longest run yet.', detail: 'Further than any run on this phone.' },
    longestMonths: { title: 'Longest run in two months.', detail: 'Further than anything in the last 60 days.' },
    recharge: (n) => ({ title: `Came back ${FACES[n]} lighter.`, detail: 'That counts as much as the pace does.' }),
    quicker: (s, km) => ({ title: `${s} ${km ? 's/km' : 's/mi'} quicker than your usual.`, detail: 'Compared with your last six weeks, hills allowed for.' }),
    slowerGood: { title: 'Slower than usual. Good run.', detail: 'You came back lighter, which was the point.' },
  },

  reminders: {
    moods: LINES,
    rhythm: RHYTHM_LINES,
    window: WINDOW_LINES,
    last: LAST_LINES,
    reflectTitles: REFLECT_TITLES,
    reflectLines: REFLECT_LINES,
    afterRunTitles: AFTER_RUN_TITLES,
    afterRunLines: AFTER_RUN_LINES,
    titles: TITLES,
    afternoon: AFTERNOON_LINES,
    weekend: WEEKEND_LINES,
    plain: PLAIN,
  },

  tips: {
    topics: Object.fromEntries(TOPICS.map((t) => [t.key, t.title])) as VoicePack['tips']['topics'],
    text: Object.fromEntries(TIPS.map((t) => [t.id, t.text])),
  },
};
