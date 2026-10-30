import { allKmPaces } from './db';
import type { DeepFact } from './deepStats';
import { loadYourRuns } from './patternStore';
import { loadYou } from './you';

// What the months view of deep stats reads from the phone: every run with its
// km paces, the weather saved at the time, and the place it was logged in.
// Nothing here leaves the phone or touches the network.

export async function loadDeepFacts(): Promise<{ facts: DeepFact[]; places: Array<{ id: number; name: string }> }> {
  const [you, yours, paces] = await Promise.all([loadYou(), loadYourRuns(), allKmPaces()]);
  const facts = you.runs.map((r) => {
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
  return { facts, places: yours.places };
}
