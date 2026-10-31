// Pure helpers for the cover cache (src/coverCache.ts), kept apart so they can be
// tested without a phone.

/** One file per show, named only by its Apple id. */
export function coverFileName(id: number): string {
  return `${Math.trunc(Math.abs(id))}.jpg`;
}

/** The address of a show's cover: the bare file, no query string, nothing to tell runners apart. */
export function coverUrl(base: string, id: number): string {
  return `${base}${coverFileName(id)}`;
}

/**
 * Runs at most `limit` jobs at once, and asking twice for the same key while it
 * runs gives the same promise, so a cover scrolling past twice is fetched once.
 */
export function coverQueue(limit: number) {
  const running = new Map<string, Promise<string | null>>();
  const waiting: Array<() => void> = [];
  let active = 0;
  return function run(key: string, job: () => Promise<string | null>): Promise<string | null> {
    const same = running.get(key);
    if (same) return same;
    const p = new Promise<void>((go) => {
      const start = () => {
        active++;
        go();
      };
      if (active < limit) start();
      else waiting.push(start);
    })
      .then(job)
      .catch(() => null)
      .finally(() => {
        active--;
        running.delete(key);
        waiting.shift()?.();
      });
    running.set(key, p);
    return p;
  };
}
