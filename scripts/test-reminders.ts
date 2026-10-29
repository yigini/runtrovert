import { inQuietHours, learnRhythm, planReminders, type PlanInput } from '../src/reminderPlan.ts';

// Checks the reminder rules with fixed dates. Local time throughout, like the phone.
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const DAY = 86400000;
const fmt = (t: number) => new Date(t).toString().slice(0, 21);

// Thursday 29 Oct 2026, 12:00
const now = at(2026, 10, 29, 12);
const base: PlanInput = { now, perWeek: 3, hour: 8, minute: 0, auto: true, runStarts: [], firedSinceLastRun: 0 };

{
  const p = planReminders(base);
  const days = p.map((r) => new Date(r.at).getDay());
  check('new user: Mon/Wed/Fri at 08:00 in week one', p.slice(0, -1).every((r) => [1, 3, 5].includes(new Date(r.at).getDay()) && new Date(r.at).getHours() === 8), p.map((r) => fmt(r.at)).join(', '));
  check('new user: three in week one plus one last line', p.length === 4 && p[3].kind === 'last', `${p.length}: ${days}`);
  check('nothing beyond the horizon', p.every((r) => r.at < now + 14 * DAY));
  check('kinds are nudges', p.slice(0, -1).every((r) => r.kind === 'nudge'));
}

{
  check('off means nothing', planReminders({ ...base, perWeek: 0 }).length === 0);
}

{
  // Tue and Thu evenings, ~18:00, for 4 weeks.
  const runs: number[] = [];
  for (let w = 1; w <= 4; w++) {
    runs.push(at(2026, 10, 27, 18, 5) - w * 7 * DAY); // Tuesdays
    runs.push(at(2026, 10, 29, 17, 55) - w * 7 * DAY); // Thursdays
  }
  runs.push(at(2026, 10, 27, 18, 5)); // and this Tuesday
  const thursdays = runs;
  const r = learnRhythm(thursdays, now, 3);
  check('rhythm learned from history', r.learned && r.days.includes(2) && r.days.includes(4), JSON.stringify(r));
  check('rhythm fires ~45 min before the usual start', r.minuteOfDay != null && r.minuteOfDay >= 17 * 60 + 10 && r.minuteOfDay <= 17 * 60 + 25, String(r.minuteOfDay));
  const p = planReminders({ ...base, runStarts: thursdays });
  check('rhythm reminders use the rhythm kind', p.some((x) => x.kind === 'rhythm'), p.map((x) => `${fmt(x.at)} ${x.kind}`).join(', '));
  const fixed = planReminders({ ...base, runStarts: thursdays, auto: false });
  check('auto off keeps the chosen hour', fixed.every((x) => new Date(x.at).getHours() === 8));
}

{
  // Ran this morning: nothing within 20 h.
  const ranAt = at(2026, 10, 29, 7);
  const p = planReminders({ ...base, runStarts: [ranAt], now: at(2026, 10, 29, 7, 40) });
  check('no reminder within 20 h of a run', p.every((x) => x.at - ranAt >= 20 * 3600 * 1000));
  // Tuesday evening run, Wednesday 08:00 is only 14 h later.
  const tue = at(2026, 10, 27, 18);
  const q = planReminders({ ...base, runStarts: [tue], now: at(2026, 10, 27, 19) });
  check('Wednesday 08:00 skipped after a Tuesday evening run', !q.some((x) => new Date(x.at).getDate() === 28), q.map((x) => fmt(x.at)).join(', '));
}

{
  const p = planReminders({ ...base, perWeek: 5, firedSinceLastRun: 3, runStarts: [now - 5 * DAY] });
  const weekOne = p.filter((x) => x.at < now + 7 * DAY);
  check('ignored three times: one a week', weekOne.length === 1, String(weekOne.length));
  check('backed-off line is gentle', weekOne[0].kind === 'quiet');
  const gap = planReminders({ ...base, runStarts: [now - 10 * DAY] });
  check('ten days off: gap lines', gap[0].kind === 'gap');
}

{
  const p = planReminders({ ...base });
  const ats = p.map((x) => x.at);
  const days = new Set(ats.map((t) => new Date(t).toDateString()));
  check('never two on one day', days.size === ats.length);
  check('never in quiet hours', ats.every((t) => !inQuietHours(t)));
  const late = planReminders({ ...base, hour: 23, auto: false });
  check('a late hour is pulled back before 21:00', late.every((x) => new Date(x.at).getHours() < 21), late.map((x) => fmt(x.at)).join(', '));
}

{
  // Friday 30 Oct 08:00 is wet, dry from 11:00.
  const fri8 = at(2026, 10, 30, 8);
  const forecast = Array.from({ length: 30 }, (_, i) => {
    const t = at(2026, 10, 29, 12) + i * 3600 * 1000;
    const wet = t >= at(2026, 10, 30, 6) && t < at(2026, 10, 30, 11);
    return { t, rainP: wet ? 80 : 10, sky: wet ? 'rain' : 'cloud' };
  });
  const p = planReminders({ ...base, forecast });
  const fri = p.find((x) => x.at === fri8);
  check('wet slot becomes a quiet-window line', fri?.kind === 'window' && fri.dryFrom === at(2026, 10, 30, 11), JSON.stringify(fri));
  const fog = forecast.map((h) => (h.sky === 'rain' ? { ...h, sky: 'fog', rainP: 0 } : h));
  const f = planReminders({ ...base, forecast: fog }).find((x) => x.at === fri8);
  check('fog becomes a weather line', f?.kind === 'weather', JSON.stringify(f));
  const mon = p.find((x) => new Date(x.at).getDay() === 1);
  check('outside the forecast nothing changes', mon?.kind === 'nudge');
}

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
