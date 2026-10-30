// The plan's evening, Sunday and race-week notes, through the one scheduler's
// fit: never at night, never more than the day allows, never about the unlock.
//   npm run test:plan-notes
import { PLANS, type RunnerProfile } from '../src/training/catalogue.ts';
import { addDays, dayStart, weekdayOf } from '../src/training/dates.ts';
import { generate } from '../src/training/generate.ts';
import { planExtras, PRIORITY } from '../src/training/planNotes.ts';
import type { Plan, PlanSetup } from '../src/training/types.ts';
import { fitNotes, inQuietHours, perDayCap, startOfDay } from '../src/reminderPlan.ts';
import { ui } from '../src/i18n/ui/index.ts';

let failures = 0;
let checked = 0;
function fail(msg: string) {
  failures++;
  console.log('  ✗ ' + msg);
}

const monday = dayStart(Date.UTC(2026, 10, 2, 12));
const runner: RunnerProfile = { weeklyKm: 30, longestKm30: 12, runsPerWeek: 4, easyPaceSPerKm: 360 };

for (const spec of PLANS) {
  const days = spec.daysOptions[0];
  const runDays = { 2: [2, 6], 3: [2, 4, 0], 4: [2, 3, 5, 0], 5: [1, 2, 4, 5, 0], 6: [1, 2, 3, 4, 6, 0] }[days]!;
  const raceDate = spec.raceKm == null ? null : addDays(monday, spec.weeks * 7 - 1);
  const setup: PlanSetup = { planId: spec.id, startDate: monday, raceDate, runDays, longRunDay: runDays.includes(0) ? 0 : runDays[runDays.length - 1], daysPerWeek: days, extraRecovery: false, race: null };
  const res = generate({ spec, setup, runner, paces: null });
  if (!res.ok) continue;
  const plan: Plan = { id: 1, setup, name: spec.name, weeks: res.weeks, runner, paces: null, status: 'active', createdAt: monday, healthCheckAt: monday, log: [] };
  // Look from the start, and from ten days before the race (or the end).
  const lastDay = plan.weeks[plan.weeks.length - 1].start;
  for (const from of [monday + 9 * 3600e3, addDays(lastDay, -3) + 9 * 3600e3]) {
    for (const perWeek of [3, 7, 14]) {
      checked++;
      const notes = planExtras({ plan, now: from, perWeek, unitsKm: true, timeBased: spec.timeBased, open: () => true });
      const tag = `${spec.id} ${perWeek}/wk from ${new Date(from).toISOString().slice(0, 10)}`;
      for (const n of notes) {
        if (inQuietHours(n.at)) fail(`${tag}: a note at ${new Date(n.at).getHours()}:00 is in the quiet hours`);
        if (n.at <= from) fail(`${tag}: a note in the past`);
        const text = `${n.payload.title} ${n.payload.body}`;
        if (text.includes(ui().unlock.name) || /unlock/i.test(text)) fail(`${tag}: a note mentions the unlock`);
        if (/undefined|NaN/.test(text)) fail(`${tag}: "${text}"`);
      }
      if (perWeek < 7 && notes.some((n) => n.priority !== PRIORITY.raceEve)) fail(`${tag}: extras beyond the race eve at a weekly cadence`);
      const race = plan.weeks.flatMap((w) => w.sessions).find((s) => s.kind === 'race');
      if (race && race.date > dayStart(from) && race.date <= addDays(dayStart(from), 14) && !notes.some((n) => n.priority === PRIORITY.raceEve && startOfDay(n.at) === addDays(race.date, -1))) fail(`${tag}: no note the evening before the race`);
      if (perWeek >= 7 && notes.filter((n) => n.priority === PRIORITY.preview || n.priority === PRIORITY.raceWeek).some((n) => weekdayOf(startOfDay(n.at)) !== 0)) fail(`${tag}: a week preview not on a Sunday`);
      // With the session-day notes at 08:00, the day's cap and the three hours hold.
      const dayNotes = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.kind !== 'strength' && s.kind !== 'rest' && s.date > dayStart(from)).map((s) => ({ at: s.date + 8 * 3600e3, priority: 10, payload: s.id }));
      const fitted = fitNotes([], [...dayNotes, ...notes.map((n) => ({ ...n, payload: n.payload.title }))], new Set(), perWeek);
      const perDay = new Map<number, number>();
      for (const f of fitted) perDay.set(startOfDay(f.at), (perDay.get(startOfDay(f.at)) ?? 0) + 1);
      if ([...perDay.values()].some((n) => n > Math.max(1, perDayCap(perWeek)))) fail(`${tag}: more than ${perDayCap(perWeek)} notes on a day`);
      if (race && race.date > dayStart(from) && race.date <= addDays(dayStart(from), 14) && !fitted.some((f) => f.extra?.priority === PRIORITY.raceEve)) fail(`${tag}: the race eve note lost its place`);
    }
  }
  // Paused plans say nothing.
  if (planExtras({ plan: { ...plan, status: 'paused' }, now: monday, perWeek: 14, unitsKm: true, timeBased: false, open: () => true }).length) fail(`${spec.id}: a paused plan sent notes`);
}

console.log(`\n${checked} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
