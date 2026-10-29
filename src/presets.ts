// Today's run: how much comes in with you. Three presets, the last one
// remembered, all free. Pure, so the Run tab, Settings and the run screen read
// the same words and the same rules.

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

export const PRESETS: PresetInfo[] = [
  {
    key: 'clear',
    chip: 'Clear my head',
    name: 'Clear my head',
    line: 'Silent recording. The time if you tap for it. Every number waits for the finish.',
    screen: 'Nothing, or just the time',
    voice: 'Silent',
    numbers: 'All of them, after',
  },
  {
    key: 'just',
    chip: 'Just run',
    name: 'Just run',
    line: 'Distance, time, pace and the map, with your usual cues.',
    screen: 'Distance, time, pace, map',
    voice: 'Your usual cues',
    numbers: 'Live',
  },
  {
    key: 'plan',
    chip: 'My plan',
    name: 'Follow my plan',
    line: 'Today’s session, block by block. A voice when a block changes.',
    screen: 'Today’s session, block by block',
    voice: 'When a block changes',
    numbers: 'Kept second',
  },
];

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
