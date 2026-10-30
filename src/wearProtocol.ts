/**
 * The phone's half of the phone <-> watch contract (docs/WATCHES.md; the watch's
 * half is wear/app/src/main/java/app/runtrovert/wear/Protocol.kt). Pure, so it
 * runs under plain Node in test:heart.
 */

export const PATHS = {
  live: '/runtrovert/live',
  split: '/runtrovert/split',
  cmd: '/runtrovert/cmd',
  hello: '/runtrovert/hello',
  hr: '/runtrovert/hr',
} as const;

/** idle, recording, paused, or halted: stopped, the finish screen asking keep or discard. */
export type WatchStatus = 'idle' | 'running' | 'paused' | 'autopaused' | 'halted';
export type WatchCommand = 'start' | 'pause' | 'resume' | 'stop';

export interface LiveForWatch {
  status: WatchStatus;
  distanceM: number;
  durationS: number;
  unitsKm: boolean;
}

/** needsOpen: a Start came while the app was in the background; the watch opens it on the phone. */
export function liveJson(l: LiveForWatch, needsOpen = false): string {
  const o: Record<string, unknown> = { status: l.status, distanceM: Math.round(l.distanceM * 10) / 10, durationS: Math.round(l.durationS * 10) / 10, unitsKm: l.unitsKm };
  if (needsOpen) o.needsOpen = true;
  return JSON.stringify(o);
}

export function splitJson(index: number, durationS: number, distanceM: number, totalS: number, unitsKm: boolean): string {
  return JSON.stringify({ index, durationS, distanceM, totalS, unitsKm });
}

export function parseCommand(data: string): WatchCommand | null {
  try {
    const c = JSON.parse(data)?.cmd;
    return c === 'start' || c === 'pause' || c === 'resume' || c === 'stop' ? c : null;
  } catch {
    return null;
  }
}

export function parseHello(data: string): boolean | null {
  try {
    const o = JSON.parse(data)?.open;
    return typeof o === 'boolean' ? o : null;
  } catch {
    return null;
  }
}

/** Heart-rate samples from the watch, [epoch ms, bpm]. Anything odd is dropped. */
export function parseHeart(data: string): Array<[number, number]> {
  try {
    const s = JSON.parse(data)?.s;
    if (!Array.isArray(s)) return [];
    return s.filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] >= 25 && p[1] <= 250).map((p) => [Math.round(p[0]), Math.round(p[1])]);
  } catch {
    return [];
  }
}

/** How long the watch counts as looking after its last "I'm open" (it repeats every 30 s). */
export const OPEN_FOR_MS = 45_000;

/**
 * Whether a live update goes to the watch now. With the watch app open, once a
 * second; with it closed, only when the state changes (it wakes the watch).
 */
export function shouldSend(now: number, last: { at: number; status: WatchStatus } | null, status: WatchStatus, watchOpenUntil: number): boolean {
  if (!last || last.status !== status) return true;
  if (now < watchOpenUntil) return now - last.at >= 1000;
  return false;
}
