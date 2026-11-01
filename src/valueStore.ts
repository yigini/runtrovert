// A small value kept on the phone under its own key in the settings table
// (so a backup carries it), read once and shared by every screen that shows
// it. For things that aren't Settings fields: the weekly goal, Tell someone.

import { useEffect, useState } from 'react';
import { loadValue, saveValue } from './db';

export type ValueStore<T> = {
  load: () => Promise<T>;
  save: (patch: Partial<T>) => Promise<T>;
  /** Drop what was read, so the next load comes from the database again (after a restore). */
  forget: () => void;
  use: () => T | null;
};

const all: Array<ValueStore<unknown>> = [];

export function valueStore<T>(key: string, clean: (saved: Partial<T> | null) => T): ValueStore<T> {
  let current: T | null = null;
  const listeners = new Set<(v: T) => void>();
  const load = async () => {
    if (current) return current;
    current = clean(await loadValue<Partial<T>>(key).catch(() => null));
    return current;
  };
  const save = async (patch: Partial<T>) => {
    const next = clean({ ...(await load()), ...patch });
    current = next;
    listeners.forEach((l) => l(next));
    await saveValue(key, next);
    return next;
  };
  const use = () => {
    const [v, setV] = useState<T | null>(current);
    useEffect(() => {
      let alive = true;
      load()
        .then((x) => alive && setV(x))
        .catch(() => alive && setV(clean(null)));
      listeners.add(setV);
      return () => {
        alive = false;
        listeners.delete(setV);
      };
    }, []);
    return v;
  };
  const store: ValueStore<T> = { load, save, forget: () => (current = null), use };
  all.push(store as ValueStore<unknown>);
  return store;
}

/** After a restore: every value store reads the database again. */
export function forgetValues(): void {
  for (const s of all) s.forget();
}
