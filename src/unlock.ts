// "Everything, once." Training plans sit behind the one-time unlock. There is
// no billing yet, so this is a build flag: test builds are fully unlocked, and
// the gate in the Train tab is already wired for the day a purchase arrives.

export const UNLOCKED_BUILD = true;

export const UNLOCK_PRICE = '€4.99';
export const UNLOCK_LINE = `Plans are part of Everything, once. ${UNLOCK_PRICE}, yours for good.`;

export function isUnlocked(): boolean {
  return UNLOCKED_BUILD;
}
