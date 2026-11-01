import { eachWithBreaks, keptUntilChanged } from './batch';
import { allKmPaces, dataVersion, getPoints, loadDeepSummaries, placeLoops, pointCounts, saveDeepSummary } from './db';
import type { DeepFact } from './deepStats';
import type { LongFact } from './deepLong';
import { RUN_SUMMARY_V, runSummary, type RunSummary } from './deepMore';
import { loadYourRuns } from './patternStore';
import { loadYou } from './you';

// What the months view of deep stats reads from the phone: every run with its
// km paces, the weather saved at the time, the place it was logged in, and a
// small summary worked out once from its points (kept in deep_summaries).
// Nothing here leaves the phone or touches the network.

export interface DeepFacts {
  facts: DeepFact[];
  places: Array<{ id: number; name: string }>;
  long: LongFact[];
  loops: Array<{ id: number; name: string; distanceM: number }>;
}

const EMPTY: Omit<RunSummary, 'v'> = { heldM: null, upS: null, lat: null, lon: null, cells: [] };

export const loadDeepFacts: () => Promise<DeepFacts> = keptUntilChanged(dataVersion, async () => {
  const [you, yours, paces, stored, counts, loops] = await Promise.all([loadYou(), loadYourRuns(), allKmPaces(), loadDeepSummaries(), pointCounts(), placeLoops()]);
  const facts: DeepFact[] = you.runs.map((r) => {
    const w = you.weather.get(r.id) ?? null;
    return {
      id: r.id,
      startedAt: r.startedAt,
      distanceM: r.distanceM,
      durationS: r.durationS,
      elevationGainM: r.elevationGainM,
      moodBefore: r.moodBefore,
      moodAfter: r.moodAfter,
      tempC: w?.tempC ?? null,
      windKmh: w?.windKmh ?? null,
      placeId: yours.placeOf.get(r.id) ?? null,
      kmPaces: paces.get(r.id) ?? [],
    };
  });
  const long: LongFact[] = [];
  // A long catch-up (hundreds of imported runs) pauses between runs so the screen keeps drawing.
  await eachWithBreaks(facts, async (f) => {
    const key = `${f.startedAt}:${counts.get(f.id) ?? 0}`;
    const row = stored.get(f.id);
    let summary: Omit<RunSummary, 'v'> = EMPTY;
    if (row && row.v === RUN_SUMMARY_V && row.k === key) {
      try {
        summary = JSON.parse(row.data);
      } catch {
        summary = EMPTY;
      }
    } else {
      // Worked out once per run, the first time the months view opens after it.
      const pts = await getPoints(f.id).catch(() => []);
      const { v: _v, ...rest } = runSummary(pts, f.elevationGainM);
      summary = rest;
      await saveDeepSummary(f.id, RUN_SUMMARY_V, key, JSON.stringify(rest)).catch(() => {});
    }
    long.push({ ...f, ...summary, placeId: f.placeId });
  });
  return { facts, places: yours.places, long, loops };
});
