/**
 * Auto-pause rules, pure so npm run test:accuracy can check them.
 *
 * Only fixes that keep arriving and show no movement mean you've stopped. No
 * fixes at all (a tunnel, or a phone that holds back location updates with the
 * screen off and then hands over a batch) is not a stop: pausing then would
 * take running time off the clock and make the pace look quicker than it was.
 *
 * When it does pause, the clock stops there and never steps back: the ~6 s it
 * took to be sure you'd stopped stay in moving time.
 */
export const AUTO_PAUSE_AFTER_MS = 6000;
const FRESH_FIX_MS = 10000;

export function autoPauseDue(now: number, lastFixTs: number, lastMovementTs: number): boolean {
  if (!lastMovementTs || !lastFixTs) return false;
  const stillFor = lastFixTs - lastMovementTs; // fixes kept coming, none moved
  return stillFor > AUTO_PAUSE_AFTER_MS && now - lastFixTs < FRESH_FIX_MS;
}
