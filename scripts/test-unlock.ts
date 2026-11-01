import { readFileSync } from 'node:fs';
import type { Plan } from '../src/training/types';
import { UI } from '../src/i18n/ui';
import { en } from '../src/i18n/ui/en';
import { NUDGE_AFTER_RUNS, calmFinish, priceLine, UNLOCKED_BUILD, isUnlocked, openWeeks, planSessionOpen, planWeekOpen, setUnlockState, shouldNudge, subscribeUnlock, trainLine, unlockState } from '../src/unlock';

// Checks the one gate. Run: npm run test:unlock
let fails = 0;
function check(ok: boolean, msg: string) {
  if (!ok) {
    fails++;
    console.log('FAIL', msg);
  }
}

// Test builds (no EXPO_PUBLIC_STORE_BUILD) are unlocked; previewing the locks turns that off.
check(UNLOCKED_BUILD, 'a build without EXPO_PUBLIC_STORE_BUILD is a test build');
check(isUnlocked(), 'test build starts unlocked');
let heard = 0;
const off = subscribeUnlock(() => heard++);
setUnlockState({ previewLocks: true });
check(!isUnlocked(), 'previewing the locks locks a test build');
check(heard === 1, 'listeners hear a change');
setUnlockState({ owned: true });
check(isUnlocked(), 'owning it unlocks, whatever the preview says');
setUnlockState({ owned: false });
off();

// The finish line: once, after ten runs, never when unlocked, never again once seen.
check(!shouldNudge(NUDGE_AFTER_RUNS - 1), 'not before run ten');
check(shouldNudge(NUDGE_AFTER_RUNS), 'on run ten');
check(shouldNudge(40), 'on the first finish after ten, for someone who already had more');
check(!shouldNudge(10, { ...unlockState(), nudge: 'shown' }), 'never twice');
check(!shouldNudge(10, { ...unlockState(), nudge: 'dismissed' }), 'not now means never');
check(!shouldNudge(10, unlockState(), true), 'never when unlocked');

// The line only on a calm finish: not after a hard, sore or drained run, or the first run back.
check(calmFinish({}), 'nothing answered is a calm finish');
check(calmFinish({ moodBefore: 3, moodAfter: 4, pain: 'none', feel: 3, daysSinceLastRun: 2 }), 'an ordinary run is calm');
check(!calmFinish({ moodAfter: 2 }), 'not when drained after');
check(!calmFinish({ moodBefore: 1 }), 'not after a drained start');
check(!calmFinish({ pain: 'niggle' }), 'not after a niggle');
check(!calmFinish({ pain: 'pain' }), 'not after pain');
check(!calmFinish({ feel: 4 }), 'not after a hard session');
check(!calmFinish({ daysSinceLastRun: 12 }), 'not on the first run back after a break');
check(calmFinish({ daysSinceLastRun: null }), 'the very first run is not a return');

// Plans: week 1 is free, the rest comes with the unlock.
const week = (index: number) => ({ index, start: index * 7, kind: 'build', targetKm: 10, sessions: [{ id: `w${index}d1` }, { id: `w${index}d3` }] });
const plan = { weeks: [1, 2, 3, 4, 5, 6, 7, 8].map(week) } as unknown as Plan;
check(planWeekOpen(plan, 1), 'week 1 open');
check(!planWeekOpen(plan, 2), 'week 2 locked');
check(planSessionOpen(plan, 'w1d3'), 'a week 1 session can start');
check(!planSessionOpen(plan, 'w5d1'), 'a week 5 session cannot');
check(planSessionOpen(plan, 'nope'), 'an unknown session is not blocked');
check(openWeeks(plan).weeks.length === 1, 'the calendar gets week 1 only');
setUnlockState({ previewLocks: false });
check(planWeekOpen(plan, 8) && openWeeks(plan).weeks.length === 8, 'unlocked: every week');

// Copy: the plain price line and the Train line.
check(priceLine() === '€4.99, once. Launch price; €6.99 later.', `price line: ${priceLine()}`);
check(trainLine(8).startsWith('Week 1 is yours to try. Weeks 2 to 8 come with Everything, once'), trainLine(8));
check(trainLine(null).includes('The weeks after'), trainLine(null));
for (const t of [priceLine(), trainLine(8)]) check(!/[—!]/.test(t), `no em dashes or exclamation marks: ${t}`);

// One list, said the same way everywhere: the unlock screen (every language) and the site's price chapter.
for (const [l, s] of Object.entries(UI)) {
  check(s!.unlock.adds.length === en.unlock.adds.length, `${l}: the unlock lists ${en.unlock.adds.length} things`);
  check(s!.unlock.free.length === en.unlock.free.length, `${l}: the free list has ${en.unlock.free.length} lines`);
}
// Taking your data out is free, always: never on the unlock's list.
for (const a of en.unlock.adds) check(!/export|backup|gpx|fit\b|zip/i.test(a), `the unlock never sells your data back: ${a}`);
check(en.unlock.free.some((f) => /GPX or FIT/.test(f) && /all at once/.test(f) && /backup/.test(f)), 'the free list says every run can go out, all at once, and the backup');
const site = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const tier = (label: string) => {
  const at = site.indexOf(`<p class="label">${label}</p>`);
  const ul = site.slice(at, site.indexOf('</ul>', at));
  return [...ul.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
};
check(JSON.stringify(tier('Free, always')) === JSON.stringify(en.unlock.free), `site free list matches the app: ${JSON.stringify(tier('Free, always'))}`);
check(JSON.stringify(tier('Everything, once')) === JSON.stringify(en.unlock.adds), `site unlock list matches the app: ${JSON.stringify(tier('Everything, once'))}`);
check(site.includes(en.unlock.nobodyPays), 'site carries the same line under the free list');

if (fails) {
  console.log(`${fails} unlock checks failed`);
  process.exit(1);
}
console.log('unlock: all checks passed');
