import { getDb, listRuns } from './db';
import type { PatternPlace, PatternRun } from './patterns';
import type { Run } from './types';

// What Your runs reads from the phone: every finished run, which place each
// one is logged in, and the places' names. Nothing here leaves the phone.

export interface YourRunsData {
  runs: Run[];
  /** run id → place id, for runs logged in one of your places. */
  placeOf: Map<number, number>;
  places: PatternPlace[];
}

export async function loadYourRuns(): Promise<YourRunsData> {
  const db = await getDb();
  const [runs, visits, places] = await Promise.all([
    listRuns(),
    db.getAllAsync('SELECT run_id, place_id FROM place_visits WHERE run_id IS NOT NULL') as Promise<Array<{ run_id: number; place_id: number }>>,
    db.getAllAsync('SELECT id, name FROM places') as Promise<Array<{ id: number; name: string }>>,
  ]);
  const placeOf = new Map<number, number>();
  for (const v of visits) placeOf.set(v.run_id, v.place_id);
  return { runs, placeOf, places: places.map((p) => ({ id: p.id, name: p.name })) };
}

export function patternRuns({ runs, placeOf }: YourRunsData): PatternRun[] {
  return runs.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    distanceM: r.distanceM,
    durationS: r.durationS,
    moodBefore: r.moodBefore,
    moodAfter: r.moodAfter,
    placeId: placeOf.get(r.id) ?? null,
  }));
}
