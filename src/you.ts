import { eachWithBreaks, singleFlight } from './batch';
import { getPoints, listRuns, loadAllFacts, loadValue, saveFacts } from './db';
import type { Weather } from './forecast';
import { bestEfforts, type Efforts, type RunFacts, type TimedPoint } from './progress';
import type { RunWeather } from './shareLines';
import type { Run } from './types';

// The glue between stored runs and the pure you-vs-you maths in progress.ts.
// Bests inside a run are found once from its GPS points and kept in run_facts,
// with the weather at the time. Nothing here touches the network: the weather
// comes from the forecast the home screen already fetched.

/** Bump when bestEfforts changes, so old runs are worked out again. */
const FACTS_V = 1;

/** The weather at `ts` from the stored forecast, if it covers that hour. */
export async function weatherAt(ts: number): Promise<RunWeather | null> {
  const w = await loadValue<Weather>('weather').catch(() => null);
  if (!w || !w.hours?.length) return null;
  let best = w.hours[0];
  for (const h of w.hours) if (Math.abs(h.t + 1800000 - ts) < Math.abs(best.t + 1800000 - ts)) best = h;
  if (Math.abs(best.t + 1800000 - ts) > 90 * 60000) {
    // The forecast was fetched after the run started: the "now" reading still describes it.
    if (!(w.fetchedAt >= ts - 3600000 && w.fetchedAt <= ts + 3 * 3600000)) return null;
    return { sky: w.sky, tempC: w.tempC, feelsC: w.feelsC, windKmh: w.windKmh, isDay: w.isDay, sunrise: w.sunrise, sunset: w.sunset };
  }
  const sameDay = new Date(w.fetchedAt).toDateString() === new Date(ts).toDateString();
  return {
    sky: best.sky,
    tempC: best.tempC,
    feelsC: best.feelsC,
    windKmh: best.windKmh,
    isDay: best.isDay,
    sunrise: sameDay ? w.sunrise : null,
    sunset: sameDay ? w.sunset : null,
  };
}

function toFacts(r: Run, efforts: Efforts): RunFacts {
  return {
    id: r.id,
    startedAt: r.startedAt,
    distanceM: r.distanceM,
    durationS: r.durationS,
    elevationGainM: r.elevationGainM,
    moodBefore: r.moodBefore,
    moodAfter: r.moodAfter,
    efforts,
  };
}

function dedupe(points: TimedPoint[]): TimedPoint[] {
  const out: TimedPoint[] = [];
  for (const p of [...points].sort((a, b) => a.ts - b.ts)) if (!out.length || out[out.length - 1].ts !== p.ts) out.push(p);
  return out;
}

export interface YouData {
  runs: Run[];
  facts: RunFacts[];
  weather: Map<number, RunWeather | null>;
}

/**
 * Every run with its bests, working out any that haven't been yet (older runs,
 * imported runs, or after an update). Screens that ask at the same time share
 * one pass, and a long catch-up pauses between runs so scrolling stays smooth.
 */
export const loadYou: () => Promise<YouData> = singleFlight(async () => {
  const runs = await listRuns();
  const stored = await loadAllFacts();
  const missing = runs.filter((r) => {
    const f = stored.get(r.id);
    return !f || f.v !== FACTS_V;
  });
  await eachWithBreaks(missing, async (r) => {
    const pts = await getPoints(r.id);
    const f = { v: FACTS_V, efforts: bestEfforts(pts), weather: stored.get(r.id)?.weather ?? null };
    await saveFacts(r.id, f);
    stored.set(r.id, f);
  });
  const facts: RunFacts[] = [];
  const weather = new Map<number, RunWeather | null>();
  for (const r of runs) {
    const f = stored.get(r.id)!;
    facts.push(toFacts(r, f.efforts as Efforts));
    weather.set(r.id, (f.weather as RunWeather | null) ?? null);
  }
  return { runs, facts, weather };
});

/** Called when a run is kept: bests and the weather, stored with it. */
export async function recordRunFacts(runId: number, startedAt: number, durationS: number): Promise<void> {
  const pts = await getPoints(runId);
  const weather = await weatherAt(startedAt + (durationS * 1000) / 2);
  await saveFacts(runId, { v: FACTS_V, efforts: bestEfforts(pts), weather });
}

/** The run still on the finish screen, and everything before it to compare with. */
export async function liveFacts(input: {
  runId: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  unsaved: TimedPoint[];
}): Promise<{ run: RunFacts; history: RunFacts[] }> {
  const pts = dedupe([...input.unsaved, ...(await getPoints(input.runId))]);
  const { facts } = await loadYou();
  const run: RunFacts = { id: input.runId, startedAt: input.startedAt, distanceM: input.distanceM, durationS: input.durationS, elevationGainM: input.elevationGainM, moodBefore: null, moodAfter: null, efforts: bestEfforts(pts) };
  return { run, history: facts };
}
