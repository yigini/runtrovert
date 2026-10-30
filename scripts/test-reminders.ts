import { awayDays, fitNotes, inQuietHours, learnRhythm, planReminders, startOfDay, type PlanInput } from '../src/reminderPlan.ts';

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
    // Calendar days, not 24 h blocks, so a daylight-saving change keeps the wall-clock time.
    runs.push(at(2026, 10, 27 - w * 7, 18, 5)); // Tuesdays
    runs.push(at(2026, 10, 29 - w * 7, 17, 55)); // Thursdays
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
  const gap = planReminders({ ...base, runStarts: [now - 8 * DAY] });
  check('eight days off: gap lines', gap[0].kind === 'gap');
  check('eight days off: quiet from day ten', gap.every((r) => awayDays(now - 8 * DAY, r.at) < 10), gap.map((r) => fmt(r.at)).join(', '));
  check('ten days off: nothing until the next run', planReminders({ ...base, runStarts: [now - 10 * DAY] }).length === 0);
  check('eighteen days off: nothing until the next run', planReminders({ ...base, perWeek: 5, runStarts: [now - 18 * DAY] }).length === 0);
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

// ---- One or two a day (the default) ---------------------------------------

const daily: PlanInput = { ...base, perWeek: 14 };
{
  const p = planReminders(daily);
  const weekOne = p.filter((x) => x.at < now + 7 * DAY);
  const byDay = new Map<string, number>();
  for (const r of weekOne) byDay.set(new Date(r.at).toDateString(), (byDay.get(new Date(r.at).toDateString()) ?? 0) + 1);
  check('new user, 1–2 a day: something every day of week one', byDay.size >= 7, [...byDay.entries()].join(' | '));
  check('new user, 1–2 a day: never more than two a day', [...byDay.values()].every((n) => n <= 2));
  check('new user, 1–2 a day: today 17:30 still comes (it is noon)', weekOne.some((r) => r.at === at(2026, 10, 29, 17, 30)), weekOne.map((r) => fmt(r.at)).join(', '));
  const fri = weekOne.find((r) => r.at === at(2026, 10, 30, 17, 30));
  check('weekday 17:30 is a work-almost-done line', fri?.kind === 'afternoon', JSON.stringify(fri));
  const sat = weekOne.find((r) => r.at === at(2026, 10, 31, 17, 30));
  check('weekend second note is a weekend line', sat?.kind === 'weekend', JSON.stringify(sat));
  check('never in quiet hours (1–2 a day)', p.every((r) => !inQuietHours(r.at)));
  check('two on one day are hours apart', weekOne.every((a) => weekOne.every((b) => a === b || new Date(a.at).toDateString() !== new Date(b.at).toDateString() || Math.abs(a.at - b.at) >= 3 * 3600 * 1000)));
}

{
  const one = planReminders({ ...base, perWeek: 7 });
  const weekOne = one.filter((x) => x.at < now + 7 * DAY);
  check('one a day: seven in week one, all at 08:00 or the main hour', weekOne.length === 7 && weekOne.every((r) => new Date(r.at).getHours() === 8), weekOne.map((r) => fmt(r.at)).join(', '));
}

{
  // Ran this morning at 7: nothing for 12 h, so tonight's 17:30 is dropped, tomorrow comes back.
  const ranAt = at(2026, 10, 29, 7);
  const p = planReminders({ ...daily, runStarts: [ranAt], now: at(2026, 10, 29, 7, 40) });
  check('1–2 a day: nothing in the 12 h after a run', p.every((x) => x.at - ranAt >= 12 * 3600 * 1000), p.slice(0, 3).map((x) => fmt(x.at)).join(', '));
  check('1–2 a day: back the next morning', p.some((x) => x.at === at(2026, 10, 30, 8)));
}

{
  // Four days off: only the main note, and it's gentle.
  const p = planReminders({ ...daily, runStarts: [now - 4 * DAY] });
  const days = new Set(p.map((r) => new Date(r.at).toDateString()));
  check('away a few days: one a day, not two', days.size === p.length, p.map((r) => fmt(r.at)).join(', '));
  check('away a few days: quiet lines', p.filter((r) => r.kind !== 'last').every((r) => r.kind === 'quiet' || r.kind === 'gap' || r.kind === 'window' || r.kind === 'weather'));
  check('ten days off: nothing (1–2 a day)', planReminders({ ...daily, runStarts: [now - 10 * DAY] }).length === 0);
}

{
  const ignored = planReminders({ ...daily, runStarts: [now - DAY], firedSinceLastRun: 8 });
  const days = new Set(ignored.map((r) => new Date(r.at).toDateString()));
  check('ignored for a while: one a day', days.size === ignored.length);
}

{
  // Plan notes and the daily cap.
  const p = planReminders(daily);
  const fri = startOfDay(at(2026, 10, 30));
  const extra = { at: at(2026, 10, 30, 8), priority: 10, payload: 'plan' };
  const fitted = fitNotes(p, [extra], new Set([fri]), 14);
  const onFri = fitted.filter((f) => startOfDay(f.at) === fri);
  check('a plan day: only the plan note', onFri.length === 1 && onFri[0].extra?.payload === 'plan', JSON.stringify(onFri));
  const sat = startOfDay(at(2026, 10, 31));
  const crowd = fitNotes(p, [{ at: at(2026, 10, 31, 12), priority: 5, payload: 'a' }, { at: at(2026, 10, 31, 19), priority: 5, payload: 'b' }], new Set(), 14);
  const onSat = crowd.filter((f) => startOfDay(f.at) === sat);
  check('never more than two on a day, extras first', onSat.length === 2 && onSat.every((f) => f.extra), JSON.stringify(onSat.map((f) => fmt(f.at))));
  const commute = fitNotes(p, [{ at: at(2026, 10, 30, 7), priority: 5, payload: 'toWork' }, { at: at(2026, 10, 30, 16, 30), priority: 5, payload: 'home' }], new Set(), 14);
  const commuteFri = commute.filter((f) => startOfDay(f.at) === fri);
  check('two commute notes take the whole day', commuteFri.length === 2 && commuteFri.every((f) => f.extra), commuteFri.map((f) => fmt(f.at)).join(', '));
  check('reminders off: a plan note still fits', fitNotes([], [extra], new Set([fri]), 3).length === 1);
  const late = fitNotes([], [{ at: at(2026, 10, 30, 22), priority: 10, payload: 'x' }], new Set(), 14);
  check('extras never in quiet hours', late.length === 0);
}

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
