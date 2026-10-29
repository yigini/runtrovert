import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import type { CueMode } from './types';
import { formatDuration, formatPace } from './geo';
import { duck } from './music';

/**
 * Cues never shout. Voice is a single calm sentence; haptic is a short pattern;
 * silent is exactly that.
 */

let chosen: CueMode = 'haptic';
// A quiet run (Clear my head, or "Run in silence today") holds cues at silent
// until it ends, whatever the settings say meanwhile.
let hush = false;
let mode: CueMode = 'haptic';
export function setCueMode(m: CueMode) {
  chosen = m;
  mode = hush ? 'silent' : m;
}

export function setRunSilent(on: boolean) {
  hush = on;
  mode = on ? 'silent' : chosen;
}

/** True while a quiet run holds everything still: the km notes that buzz stay off too. */
export function runSilent(): boolean {
  return hush;
}

async function buzz(pattern: Haptics.NotificationFeedbackType | 'double' | 'triple') {
  try {
    if (pattern === 'double') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise((r) => setTimeout(r, 180));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (pattern === 'triple') {
      for (let i = 0; i < 3; i++) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await new Promise((r) => setTimeout(r, 150));
      }
    } else {
      await Haptics.notificationAsync(pattern);
    }
  } catch {
    // haptics unavailable (simulator)
  }
}

// Music dips while we talk and comes back when we're done. Each sentence gets
// an id so a stopped one can't lift the duck under the one that replaced it.
let spoken = 0;
function say(text: string) {
  const id = ++spoken;
  const release = () => {
    if (id === spoken) duck(false);
  };
  try {
    Speech.stop();
    duck(true);
    Speech.speak(text, { rate: 0.95, pitch: 1.0, onDone: release, onStopped: release, onError: release });
  } catch {
    release();
  }
}

export async function cueKmSplit(km: number, splitDurationS: number, totalDurationS: number, unitsKm: boolean) {
  if (mode === 'silent') return;
  await buzz('double');
  if (mode === 'voice') {
    const unit = unitsKm ? 'kilometre' : 'mile';
    const pace = formatPace(unitsKm ? 1000 : 1609.344, splitDurationS);
    say(`${km} ${unit}${km === 1 ? '' : 's'}. ${pace.replace(':', ' ')} per ${unit}. ${formatDuration(totalDurationS).replace(':', ' ')} total.`);
  }
}

export async function cueLap(lap: number, lapDurationS: number) {
  if (mode === 'silent') return;
  await buzz(Haptics.NotificationFeedbackType.Success);
  if (mode === 'voice') say(`Lap ${lap}, ${formatDuration(lapDurationS).replace(':', ' ')}.`);
}

export async function cueAutoPause() {
  if (mode === 'silent') return;
  await buzz('triple');
  if (mode === 'voice') say('Paused.');
}

export async function cueAutoResume() {
  if (mode === 'silent') return;
  await buzz(Haptics.NotificationFeedbackType.Success);
  if (mode === 'voice') say('Resumed.');
}

export async function cueCountdown(n: number) {
  // Countdown is always haptic-only unless voice is on; never jarring.
  if (mode === 'silent') return;
  await buzz(n === 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  if (mode === 'voice') say(n === 0 ? 'Go.' : String(n));
}

/** A guided session moved on to its next step: two taps, and the step in a few words. */
export async function cueWorkoutStep(text: string, finished = false) {
  if (mode === 'silent') return;
  await buzz(finished ? Haptics.NotificationFeedbackType.Success : 'double');
  if (mode === 'voice') say(text);
}
