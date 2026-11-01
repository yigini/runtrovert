// Small helpers for work that walks every run (worked-out bests, deep
// summaries). With a few hundred imported runs these loops are long, so they
// pause now and then to let the screen draw, and two screens asking at once
// share one pass instead of doing it twice. Pure, so `npm run test:runs-perf`
// can check them under plain Node.

/** Lets the JS thread draw a frame before the next slice of work. */
export function breather(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Calls `fn` for each item in order, pausing after every `sliceMs` of work.
 * Returns how many pauses it took (for tests).
 */
export async function eachWithBreaks<T>(items: T[], fn: (item: T, i: number) => Promise<void> | void, sliceMs = 12, clock: () => number = Date.now): Promise<number> {
  let pauses = 0;
  let since = clock();
  for (let i = 0; i < items.length; i++) {
    await fn(items[i], i);
    if (clock() - since >= sliceMs && i < items.length - 1) {
      await breather();
      pauses++;
      since = clock();
    }
  }
  return pauses;
}

/** One shared run of `fn` while it is in flight; the next call after it settles starts fresh. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      inflight = fn().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}

/**
 * Like singleFlight, and the last answer is kept until `version()` moves on
 * (db.ts dataVersion(): any write to the runs). Opening a run, Your runs or the
 * finish screen again then costs nothing until a run is added, changed or removed.
 */
export function keptUntilChanged<T>(version: () => number, fn: () => Promise<T>): () => Promise<T> {
  let kept: { v: number; value: T } | null = null;
  const shared = singleFlight(async () => {
    const v = version();
    const value = await fn();
    if (version() === v) kept = { v, value };
    return value;
  });
  return () => (kept && kept.v === version() ? Promise.resolve(kept.value) : shared());
}
