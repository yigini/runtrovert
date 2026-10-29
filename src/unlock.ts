// "Everything, once." The one-time unlock, and the only place that decides
// what it covers. Every feature asks isUnlocked() and nothing ships its own
// paywall. The split: privacy and quiet are never for sale, anything about a
// single run is free, anything built from months of runs is the unlock.
//
// Pure module, no React Native imports, so `npm run test:unlock` can check it
// under plain Node. Saving the state and the React hook live in unlockState.ts.

import type { Plan } from './training/types';

/**
 * GitHub test APKs have everything unlocked. Store builds set
 * EXPO_PUBLIC_STORE_BUILD=1 (eas.json, production), which Expo inlines at build time.
 */
export const UNLOCKED_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD !== '1';

/** Store billing is wired (billing.ts) but stays off until the store launch. */
export const BILLING_ON = false;

/** The one non-consumable product, the same id on Google Play and the App Store. */
export const UNLOCK_SKU = 'app.runtrovert.everything';

export const UNLOCK_NAME = 'Everything, once';
export const UNLOCK_PRICE = '€4.99';
export const UNLOCK_PRICE_LATER = '€6.99';
/** The one plain line under the price. */
export const PRICE_LINE = `${UNLOCK_PRICE}, once. It becomes ${UNLOCK_PRICE_LATER} when full training plans arrive.`;

/** The proactive line on the finish screen waits for this many saved runs. */
export const NUDGE_AFTER_RUNS = 10;

/** unseen: not yet earned or not yet shown. shown / dismissed: never again. */
export type NudgeState = 'unseen' | 'shown' | 'dismissed';

export interface UnlockState {
  owned: boolean; // bought (or restored) through the store
  previewLocks: boolean; // test builds only: show the app as a store build would
  nudge: NudgeState;
}

export const DEFAULT_UNLOCK: UnlockState = { owned: false, previewLocks: false, nudge: 'unseen' };

let state: UnlockState = { ...DEFAULT_UNLOCK };
const listeners = new Set<() => void>();

export function unlockState(): UnlockState {
  return state;
}

/** Replace part of the state and tell every listener. Saving is the caller's job (unlockState.ts). */
export function setUnlockState(patch: Partial<UnlockState>): UnlockState {
  state = { ...state, ...patch };
  for (const l of listeners) l();
  return state;
}

export function subscribeUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The one check. */
export function isUnlocked(): boolean {
  if (state.owned) return true;
  return UNLOCKED_BUILD && !state.previewLocks;
}

/** Whether the finish screen may show its one line about the unlock, after this run is saved. */
export function shouldNudge(savedRuns: number, s: UnlockState = state, unlocked = isUnlocked()): boolean {
  return !unlocked && s.nudge === 'unseen' && savedRuns >= NUDGE_AFTER_RUNS;
}

// ---- Training plans: week 1 is free ---------------------------------------------

/** Week 1 of any plan is yours to try; the weeks after come with the unlock. */
export function planWeekOpen(plan: Plan, weekIndex: number): boolean {
  if (isUnlocked()) return true;
  const first = plan.weeks[0];
  return !first || weekIndex === first.index;
}

/** Whether a session can be started, guided and reminded about. */
export function planSessionOpen(plan: Plan, sessionId: string): boolean {
  if (isUnlocked()) return true;
  const week = plan.weeks.find((w) => w.sessions.some((s) => s.id === sessionId));
  return !week || planWeekOpen(plan, week.index);
}

/** The plan cut to the weeks that are open, for a calendar file. */
export function openWeeks(plan: Plan): Plan {
  return isUnlocked() ? plan : { ...plan, weeks: plan.weeks.filter((w) => planWeekOpen(plan, w.index)) };
}

/** The Train line, for a plan of `weeks` weeks (null for an ongoing plan). */
export function trainLine(weeks: number | null): string {
  const rest = weeks && weeks > 1 ? `Weeks 2 to ${weeks}` : 'The weeks after';
  return `Week 1 is yours to try. ${rest} come with ${UNLOCK_NAME}, whenever you're ready. Free runs never stop.`;
}
