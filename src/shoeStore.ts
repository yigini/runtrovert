// The shoe list on the phone, under one key in the settings table (so a
// backup carries it with everything else). See shoes.ts for the rules.

import { useEffect, useState } from 'react';
import { loadValue, saveValue } from './db';
import { cleanBook, EMPTY_BOOK, giveDefault, type ShoeBook } from './shoes';

const KEY = 'shoes';

let current: ShoeBook | null = null;
const listeners = new Set<(b: ShoeBook) => void>();

export async function loadShoes(): Promise<ShoeBook> {
  if (current) return current;
  current = cleanBook(await loadValue<ShoeBook>(KEY).catch(() => null));
  return current;
}

/** Drop what was read, so the next load comes from the database again (after a restore). */
export function forgetShoes(): void {
  current = null;
}

export async function saveShoes(next: ShoeBook): Promise<ShoeBook> {
  const clean = cleanBook(next);
  current = clean;
  await saveValue(KEY, clean);
  listeners.forEach((l) => l(clean));
  return clean;
}

export async function changeShoes(fn: (b: ShoeBook) => ShoeBook): Promise<ShoeBook> {
  return saveShoes(fn(await loadShoes()));
}

/** A run just kept: it goes to the pair new runs use, if there is one. */
export async function shoesForNewRun(runId: number): Promise<void> {
  const b = await loadShoes();
  if (!b.defaultId) return;
  await saveShoes(giveDefault(b, runId));
}

export function useShoes(): ShoeBook | null {
  const [book, setBook] = useState<ShoeBook | null>(current);
  useEffect(() => {
    let alive = true;
    loadShoes()
      .then((b) => alive && setBook(b))
      .catch(() => alive && setBook(EMPTY_BOOK));
    listeners.add(setBook);
    return () => {
      alive = false;
      listeners.delete(setBook);
    };
  }, []);
  return book;
}
