// Shoe mileage: which shoes each run was in, and how far each pair has gone.
// Pure: no React Native, so `npm run test:shoes` runs it in Node. The list
// lives on the phone under one key (shoeStore.ts) and goes into a backup with
// the rest of the settings table. Free, always.

export type Shoe = {
  id: string;
  name: string;
  /** Distance already on them when they were added, metres. */
  startM: number;
  /** Where the replace note starts, metres. */
  limitM: number;
  addedAt: number;
  /** Put away: kept with their runs, never offered for new ones. */
  retiredAt: number | null;
};

export type ShoeBook = {
  shoes: Shoe[];
  /** New runs go to this pair (null: none). */
  defaultId: string | null;
  /** Run id → shoe id. A run left out wasn't in any pair you listed. */
  runs: Record<string, string>;
  /** Shoes whose replace note was put aside ("Not yet"), so it doesn't come back for them. */
  noted: string[];
};

export const EMPTY_BOOK: ShoeBook = { shoes: [], defaultId: null, runs: {}, noted: [] };

/** Most running shoes are worth a look somewhere between 500 and 800 km. */
export const DEFAULT_LIMIT_M = 700_000;

export function newShoeId(now: number, taken: string[]): string {
  let id = `s${now.toString(36)}`;
  let n = 1;
  while (taken.includes(id)) id = `s${now.toString(36)}-${n++}`;
  return id;
}

export function cleanBook(b: Partial<ShoeBook> | null | undefined): ShoeBook {
  const shoes = Array.isArray(b?.shoes) ? b!.shoes.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string') : [];
  const ids = new Set(shoes.map((s) => s.id));
  const runs: Record<string, string> = {};
  for (const [k, v] of Object.entries(b?.runs ?? {})) if (ids.has(v)) runs[k] = v;
  const defaultId = b?.defaultId && ids.has(b.defaultId) && !shoes.find((s) => s.id === b.defaultId)?.retiredAt ? b.defaultId : null;
  return { shoes, defaultId, runs, noted: (b?.noted ?? []).filter((id) => ids.has(id)) };
}

/** Distance on each pair: what was on them, plus every run of yours that's still on the phone. */
export function totals(book: ShoeBook, runs: Array<{ id: number; distanceM: number }>): Map<string, { distanceM: number; runs: number }> {
  const out = new Map<string, { distanceM: number; runs: number }>();
  for (const s of book.shoes) out.set(s.id, { distanceM: Math.max(0, s.startM), runs: 0 });
  for (const r of runs) {
    const id = book.runs[String(r.id)];
    const t = id ? out.get(id) : undefined;
    if (!t) continue;
    t.distanceM += Math.max(0, r.distanceM);
    t.runs++;
  }
  return out;
}

export function addShoe(book: ShoeBook, name: string, startM: number, limitM: number, now: number): ShoeBook {
  const id = newShoeId(now, book.shoes.map((s) => s.id));
  const shoe: Shoe = { id, name: name.trim(), startM: Math.max(0, startM), limitM: limitM > 0 ? limitM : DEFAULT_LIMIT_M, addedAt: now, retiredAt: null };
  // The first pair (or a new pair while none is the default) is the one new runs use.
  return { ...book, shoes: [...book.shoes, shoe], defaultId: book.defaultId ?? id };
}

export function editShoe(book: ShoeBook, id: string, patch: Partial<Pick<Shoe, 'name' | 'startM' | 'limitM'>>): ShoeBook {
  return { ...book, shoes: book.shoes.map((s) => (s.id === id ? { ...s, ...patch, name: (patch.name ?? s.name).trim() || s.name } : s)) };
}

export function retireShoe(book: ShoeBook, id: string, now: number | null): ShoeBook {
  const shoes = book.shoes.map((s) => (s.id === id ? { ...s, retiredAt: now } : s));
  let defaultId = book.defaultId;
  if (now != null && defaultId === id) defaultId = shoes.find((s) => !s.retiredAt)?.id ?? null;
  return { ...book, shoes, defaultId };
}

/** Removes the pair; its runs simply have no shoes afterwards. The runs themselves stay. */
export function removeShoe(book: ShoeBook, id: string): ShoeBook {
  const runs = Object.fromEntries(Object.entries(book.runs).filter(([, v]) => v !== id));
  const shoes = book.shoes.filter((s) => s.id !== id);
  return cleanBook({ ...book, shoes, runs, defaultId: book.defaultId === id ? (shoes.find((s) => !s.retiredAt)?.id ?? null) : book.defaultId });
}

export function setRunShoe(book: ShoeBook, runId: number, shoeId: string | null): ShoeBook {
  const runs = { ...book.runs };
  if (shoeId && book.shoes.some((s) => s.id === shoeId)) runs[String(runId)] = shoeId;
  else delete runs[String(runId)];
  return { ...book, runs };
}

/** A new run goes to the default pair, unless it already has one. */
export function giveDefault(book: ShoeBook, runId: number): ShoeBook {
  if (!book.defaultId || book.runs[String(runId)]) return book;
  return setRunShoe(book, runId, book.defaultId);
}

/** Pairs past their replace distance that are still in use and haven't been put aside. */
export function dueForReplacing(book: ShoeBook, t: Map<string, { distanceM: number }>): Shoe[] {
  return book.shoes.filter((s) => !s.retiredAt && !book.noted.includes(s.id) && (t.get(s.id)?.distanceM ?? 0) >= s.limitM);
}

/** 0..1 of the way to the replace distance, for the quiet bar. */
export function wear(shoe: Shoe, distanceM: number): number {
  return shoe.limitM > 0 ? Math.max(0, Math.min(1, distanceM / shoe.limitM)) : 0;
}

/** Whole km or mi typed in a field, as metres. null if it isn't a number. */
export function parseWholeDistance(text: string, km: boolean): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return Math.round(n * (km ? 1000 : 1609.344));
}

export function wholeDistance(m: number, km: boolean): string {
  return String(Math.round(m / (km ? 1000 : 1609.344)));
}
