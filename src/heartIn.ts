import { addHeartRate } from './db';
import { keepReading, type HeartFrom } from './heart';
import type { WatchStatus } from './wearProtocol';

/**
 * Where heart rate comes in, whichever device sends it: the Wear OS app
 * (src/wear.ts) or a Bluetooth strap or broadcasting watch (src/strap.ts).
 * Readings go into the run on this phone and nowhere else, and the guided
 * session hears the latest one for its ranges and the "could be easier" word.
 */

let runId: number | null = null;
let status: WatchStatus = 'idle';
let strapAt = 0;
let listener: ((bpm: number, ts: number) => void) | null = null;

/** From the tracking tick. */
export function heartRun(id: number | null, s: WatchStatus): void {
  runId = id;
  status = s;
}

/** The latest reading during a run, for the guided session. One listener; null to stop. */
export function setHeartListener(l: ((bpm: number, ts: number) => void) | null): void {
  listener = l;
}

/**
 * Readings, [epoch ms, bpm]. false when there's no run to put them in. Kept
 * while the finish screen is up: the last few seconds arrive just after Stop.
 */
export function heartIn(from: HeartFrom, samples: Array<[number, number]>): boolean {
  if (runId == null || status === 'idle') return false;
  const now = Date.now();
  if (from === 'strap' && samples.length) strapAt = now;
  if (!keepReading(from, now, strapAt) || !samples.length) return true;
  void addHeartRate(runId, samples).catch(() => {});
  const [ts, bpm] = samples[samples.length - 1];
  if (status === 'running' || status === 'autopaused') listener?.(bpm, ts);
  return true;
}
