// Today's run: how much comes in with you. Three presets, the last one
// remembered, all free. Pure, so the Run tab, Settings and the run screen read
// the same words and the same rules.

import { live, ui } from './i18n/ui';

export type RunPreset = 'clear' | 'just' | 'plan';

export interface PresetInfo {
  key: RunPreset;
  /** The chip on Run home: short, so all three fit on one line. */
  chip: string;
  /** The full name, on the sheet and in Settings. */
  name: string;
  /** One line under the chips once it's picked. */
  line: string;
  /** What each one brings, as the sheet's three rows. */
  screen: string;
  voice: string;
  numbers: string;
}

export const PRESETS: PresetInfo[] = live(() => (['clear', 'just', 'plan'] as const).map((key) => ({ key, ...ui().presets[key] })));

export function presetInfo(key: RunPreset): PresetInfo {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[1];
}

/**
 * The preset this run uses. The runner's last choice wins. Before they ever
 * pick one, a day on the plan means the plan and any other day means Just run,
 * which is how the app behaved before presets. With no session to follow,
 * My plan runs as Just run.
 */
export function effectivePreset(chosen: RunPreset | null, hasSession: boolean): RunPreset {
  const p = chosen ?? (hasSession ? 'plan' : 'just');
  return p === 'plan' && !hasSession ? 'just' : p;
}

/** The phone's own date, "2026-10-29", for "Run in silence today". */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** No voice, no buzz: Clear my head, or the Listen sheet's switch for today. */
export function silentRun(preset: RunPreset, silentDay: string | null, now: number): boolean {
  return preset === 'clear' || silentDay === dayKey(now);
}
