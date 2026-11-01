// Your runs › Filter: narrow hundreds of runs down by year and month,
// distance, place, where the run came from, shoes, plan or free, and a few
// words. Pure functions with no React Native imports, so
// `npm run test:run-filter` checks them under plain Node.
//
// Closed by default: an empty filter shows every run and draws nothing extra.

import type { SourceKind } from './io/types';

export type Origin = 'recorded' | 'imported' | 'manual';
export type Band = 'short' | 'mid' | 'long' | 'longest';
export type PlanSide = 'plan' | 'free';

export interface RunFilter {
  year: number | null;
  /** 0–11; only used with a year. */
  month: number | null;
  band: Band | null;
  placeId: number | null;
  origin: Origin | null;
  shoeId: string | null;
  plan: PlanSide | null;
  text: string;
}

export const NO_FILTER: RunFilter = { year: null, month: null, band: null, placeId: null, origin: null, shoeId: null, plan: null, text: '' };

/** What the filter reads about one run. */
export interface FilterRun {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  note: string | null;
  placeId: number | null;
  origin: Origin;
  shoeId: string | null;
  fromPlan: boolean;
}

/** Where a run came from: a watch counts as recorded, a file or another app as imported. */
export function originOf(kind: SourceKind | null | undefined): Origin {
  if (!kind || kind === 'watch') return 'recorded';
  return kind === 'manual' ? 'manual' : 'imported';
}

const MILE = 1609.344;
/** Band edges in metres: round numbers in the runner's unit, then the half marathon. */
export function bandEdges(km: boolean): [number, number, number] {
  return km ? [5000, 10000, 21097.5] : [3 * MILE, 6 * MILE, 21097.5];
}

export function bandOf(distanceM: number, km: boolean): Band {
  const [a, b, c] = bandEdges(km);
  return distanceM < a ? 'short' : distanceM < b ? 'mid' : distanceM < c ? 'long' : 'longest';
}

/** Lower case, no accents, single spaces: "Café  Loop" and "cafe loop" are the same words. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEmpty(f: RunFilter): boolean {
  return f.year == null && f.band == null && f.placeId == null && f.origin == null && f.shoeId == null && f.plan == null && !fold(f.text);
}

/** How many of the filter's parts are set (for "Filter · 2"). */
export function activeCount(f: RunFilter): number {
  return [f.year != null, f.band != null, f.placeId != null, f.origin != null, f.shoeId != null, f.plan != null, !!fold(f.text)].filter(Boolean).length;
}

export interface Names {
  places: Map<number, string>;
  shoes: Map<string, string>;
}

/**
 * The runs that match every part that is set. Words match the run's note, its
 * place and its shoes; every word has to be found somewhere.
 */
export function applyFilter<T extends FilterRun>(runs: T[], f: RunFilter, km: boolean, names: Names): T[] {
  if (isEmpty(f)) return runs;
  const words = fold(f.text).split(' ').filter(Boolean);
  return runs.filter((r) => {
    if (f.year != null) {
      const d = new Date(r.startedAt);
      if (d.getFullYear() !== f.year) return false;
      if (f.month != null && d.getMonth() !== f.month) return false;
    }
    if (f.band != null && bandOf(r.distanceM, km) !== f.band) return false;
    if (f.placeId != null && r.placeId !== f.placeId) return false;
    if (f.origin != null && r.origin !== f.origin) return false;
    if (f.shoeId != null && r.shoeId !== f.shoeId) return false;
    if (f.plan === 'plan' && !r.fromPlan) return false;
    if (f.plan === 'free' && r.fromPlan) return false;
    if (words.length) {
      const hay = fold(
        [r.note ?? '', r.placeId != null ? names.places.get(r.placeId) ?? '' : '', r.shoeId != null ? names.shoes.get(r.shoeId) ?? '' : ''].join(' '),
      );
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export interface Totals {
  runs: number;
  distanceM: number;
  durationS: number;
}

export function totalsOf(runs: Array<{ distanceM: number; durationS: number }>): Totals {
  let distanceM = 0;
  let durationS = 0;
  for (const r of runs) {
    distanceM += r.distanceM;
    durationS += r.durationS;
  }
  return { runs: runs.length, distanceM, durationS };
}

/** What the sheet offers: only choices that would find at least one run, newest year first. */
export interface Choices {
  years: number[];
  /** Months that have runs, for the chosen year. */
  months: number[];
  bands: Band[];
  places: number[];
  origins: Origin[];
  shoes: string[];
  plan: boolean;
}

export function choicesFor(runs: FilterRun[], year: number | null, km: boolean): Choices {
  const years = new Set<number>();
  const months = new Set<number>();
  const bands = new Set<Band>();
  const places = new Map<number, number>();
  const origins = new Set<Origin>();
  const shoes = new Map<string, number>();
  let planRuns = 0;
  for (const r of runs) {
    const d = new Date(r.startedAt);
    years.add(d.getFullYear());
    if (year != null && d.getFullYear() === year) months.add(d.getMonth());
    bands.add(bandOf(r.distanceM, km));
    if (r.placeId != null) places.set(r.placeId, (places.get(r.placeId) ?? 0) + 1);
    origins.add(r.origin);
    if (r.shoeId != null) shoes.set(r.shoeId, (shoes.get(r.shoeId) ?? 0) + 1);
    if (r.fromPlan) planRuns++;
  }
  const ORDER_B: Band[] = ['short', 'mid', 'long', 'longest'];
  const ORDER_O: Origin[] = ['recorded', 'imported', 'manual'];
  return {
    years: [...years].sort((a, b) => b - a),
    months: [...months].sort((a, b) => a - b),
    bands: ORDER_B.filter((b) => bands.has(b)),
    // Most-run first: the places and shoes you'd look for are near the front.
    places: [...places.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    // Where everything came from the same way, there's nothing to choose.
    origins: origins.size > 1 ? ORDER_O.filter((o) => origins.has(o)) : [],
    shoes: [...shoes.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    plan: planRuns > 0 && planRuns < runs.length,
  };
}

/** A filter that still makes sense after runs or places were deleted: parts that point at nothing are dropped. */
export function tidy(f: RunFilter, c: Choices): RunFilter {
  const out = { ...f };
  if (out.year != null && !c.years.includes(out.year)) {
    out.year = null;
  }
  if (out.year == null) out.month = null;
  if (out.placeId != null && !c.places.includes(out.placeId)) out.placeId = null;
  if (out.shoeId != null && !c.shoes.includes(out.shoeId)) out.shoeId = null;
  return out;
}
