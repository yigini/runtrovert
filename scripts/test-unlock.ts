import type { Plan } from '../src/training/types';
import { NUDGE_AFTER_RUNS, PRICE_LINE, UNLOCKED_BUILD, isUnlocked, openWeeks, planSessionOpen, planWeekOpen, setUnlockState, shouldNudge, subscribeUnlock, trainLine, unlockState } from '../src/unlock';

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
check(PRICE_LINE === '€4.99, once. It becomes €6.99 when full training plans arrive.', `price line: ${PRICE_LINE}`);
check(trainLine(8).startsWith('Week 1 is yours to try. Weeks 2 to 8 come with Everything, once'), trainLine(8));
check(trainLine(null).includes('The weeks after'), trainLine(null));
for (const t of [PRICE_LINE, trainLine(8)]) check(!/[—!]/.test(t), `no em dashes or exclamation marks: ${t}`);

if (fails) {
  console.log(`${fails} unlock checks failed`);
  process.exit(1);
}
console.log('unlock: all checks passed');
