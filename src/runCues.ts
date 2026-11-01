/**
 * Run aids during a run: the voice on its own interval with the numbers the
 * runner picked, and the pace and heart-rate alerts. Fed by the tracking tick
 * (screen on or off) and by each km/mile split. The rules are in runAids.ts.
 *
 * All on the phone; nothing is sent anywhere. A guided session (training plan
 * or quick workout) has its own steps and ranges, so the alerts stand aside
 * while one runs. A quiet run silences all of it (cues.ts).
 */
import { cueAlert, cueKmSplit, cueSay, cueSplitBuzz, runSilent } from './cues';
import { decimal } from './i18n/lang';
import { ui } from './i18n/ui';
import { formatDuration, minSec, MILE_M } from './geo';
import { latestHeart } from './heartIn';
import {
  ALERT_WARMUP_S,
  cleanHeart,
  cleanPace,
  DEFAULT_HEART_ALERT,
  DEFAULT_PACE_ALERT,
  intervalDue,
  isDefaultVoice,
  PaceWindow,
  RangeWatch,
  spokenFields,
  stretchPace,
  type CueMark,
  type HeartAlert,
  type PaceAlert,
  type VoiceEvery,
  type VoiceField,
} from './runAids';

interface AidSettings {
  unitsKm: boolean;
  voiceEvery: VoiceEvery;
  voiceSays: VoiceField[];
  paceAlert: PaceAlert;
  heartAlert: HeartAlert;
}

let s: AidSettings = { unitsKm: true, voiceEvery: 'split', voiceSays: [], paceAlert: DEFAULT_PACE_ALERT, heartAlert: DEFAULT_HEART_ALERT };

export function setAidSettings(next: AidSettings) {
  s = { ...next, paceAlert: cleanPace(next.paceAlert ?? DEFAULT_PACE_ALERT), heartAlert: cleanHeart(next.heartAlert ?? DEFAULT_HEART_ALERT) };
}

const paceWindow = new PaceWindow();
const paceWatch = new RangeWatch();
const heartWatch = new RangeWatch();
let mark: CueMark = { distanceM: 0, durationS: 0 };

/** A run starts, or one is picked back up: count from where it is, so nothing fires in a burst. */
export function beginAids(distanceM = 0, durationS = 0) {
  mark = { distanceM, durationS };
  paceWindow.reset();
  paceWatch.clear();
  heartWatch.clear();
}

export interface AidTick {
  now: number;
  status: 'running' | 'paused' | 'autopaused';
  distanceM: number;
  durationS: number;
  /** A guided session is running: it has its own cues and ranges. */
  guided: boolean;
}

function unitM() {
  return s.unitsKm ? 1000 : MILE_M;
}

/** Once a second from tracking.tick(). */
export function aidsTick(t: AidTick) {
  if (t.status !== 'running') {
    // A stop is not a slow stretch: start the pace window again after it.
    paceWindow.reset();
    paceWatch.reset();
    heartWatch.reset();
    return;
  }
  paceWindow.push(t.now, t.distanceM, t.durationS);

  const next = intervalDue(s.voiceEvery, mark, t.distanceM, t.durationS, unitM());
  if (next) {
    if (!runSilent()) cueSay(sentence(t.distanceM, t.durationS, stretchPace(mark.distanceM, mark.durationS, t.distanceM, t.durationS, unitM())));
    mark = next;
  }

  if (t.guided || runSilent()) return;
  if (s.paceAlert.on && t.durationS >= ALERT_WARMUP_S) {
    const side = paceWatch.push(paceWindow.secPerKm(), t.now, s.paceAlert.fastS, s.paceAlert.slowS);
    // Fewer seconds per km is quicker: 'below' the range is too fast.
    if (side) void cueAlert(side === 'below' ? ui().runAids.paceFast : ui().runAids.paceSlow);
  }
  if (s.heartAlert.on) {
    const side = heartWatch.push(latestHeart(t.now), t.now, s.heartAlert.low, s.heartAlert.high);
    if (side) void cueAlert(side === 'above' ? ui().runAids.heartHigh : ui().runAids.heartLow);
  }
}

/** Each km or mile, from tracking. Splits are recorded the same whatever is said. */
export function aidsSplit(index: number, splitDurationS: number, totalDistanceM: number, totalDurationS: number) {
  if (isDefaultVoice(s.voiceEvery, s.voiceSays)) {
    // Exactly what every build before this one said.
    void cueKmSplit(index, splitDurationS, totalDurationS, s.unitsKm);
    return;
  }
  void cueSplitBuzz();
  if (s.voiceEvery !== 'split' || runSilent()) return;
  cueSay(sentence(totalDistanceM, totalDurationS, splitDurationS));
  mark = { distanceM: totalDistanceM, durationS: totalDurationS };
}

const spoken = (clock: string) => clock.replace(/:/g, ' ');

/** "3 kilometres. 5 40 per kilometre. Average 5 52. 17 05 total. Heart rate 148." with only the fields picked. */
function sentence(distanceM: number, durationS: number, stretchS: number | null): string {
  const a = ui().runAids;
  const km = s.unitsKm;
  const units = distanceM / unitM();
  const rounded = Math.round(units * 10) / 10;
  const n = Number.isInteger(rounded) ? String(rounded) : decimal(rounded.toFixed(1));
  const parts: string[] = [];
  for (const f of spokenFields(s.voiceSays)) {
    if (f === 'distance') parts.push(a.sayDistance(n, rounded === 1, km));
    else if (f === 'pace' && stretchS != null && stretchS < 3600) parts.push(a.sayPace(spoken(minSec(stretchS)), km));
    else if (f === 'avg' && distanceM > 50) parts.push(a.sayAvg(spoken(minSec((durationS / distanceM) * unitM()))));
    else if (f === 'time') parts.push(a.sayTime(spoken(formatDuration(durationS))));
    else if (f === 'heart') {
      const bpm = latestHeart(Date.now());
      if (bpm != null) parts.push(a.sayHeart(Math.round(bpm)));
    }
  }
  return parts.join(' ');
}
