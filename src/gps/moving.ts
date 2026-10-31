/**
 * Auto-pause rules, pure so npm run test:accuracy can check them.
 *
 * Only fixes that keep arriving and show no movement mean you've stopped. No
 * fixes at all (a tunnel, or a phone that holds back location updates with the
 * screen off and then hands over a batch) is not a stop: pausing then would
 * take running time off the clock and make the pace look quicker than it was.
 */
export const AUTO_PAUSE_AFTER_MS = 6000;
const FRESH_FIX_MS = 10000;

export function autoPauseDue(now: number, lastFixTs: number, lastMovementTs: number): boolean {
  if (!lastMovementTs || !lastFixTs) return false;
  const stillFor = lastFixTs - lastMovementTs; // fixes kept coming, none moved
  return stillFor > AUTO_PAUSE_AFTER_MS && now - lastFixTs < FRESH_FIX_MS;
}

/**
 * Seconds to take back off the clock when auto-pause starts: the wait that
 * proved you'd stopped wasn't running. Never more than the segment itself, and
 * never back past a split or lap that has already closed.
 */
export function idleToRemove(now: number, lastMovementTs: number, segmentStartedAt: number, accumulatedS: number, floorS: number): number {
  const idle = Math.max(0, Math.min(now - lastMovementTs, now - segmentStartedAt)) / 1000;
  return Math.max(0, Math.min(idle, accumulatedS - floorS));
}
