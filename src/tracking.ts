/**
 * Run state machine. Sits on top of:
 *   gps/engine   – where fixes come from (expo-location or Transistor)
 *   gps/kalman   – what to believe
 *   gps/sensors  – barometer elevation, pedometer gap fill
 *   gps/recovery – survive being killed
 *
 * Everything the UI reads comes from subscribe()/getState().
 */
import { AppState } from 'react-native';
import { cueAutoPause, cueAutoResume, cueKmSplit, cueLap, setCueMode } from './cues';
import { addPoints, addSplit, createRun, finishRun, getPoints, getRun, updateRunProgress } from './db';
import { getEngine } from './gps/engine';
import { GpsFilter, type FilteredFix, type RawFix } from './gps/kalman';
import { clearSnapshot, loadSnapshot, saveSnapshot, type RunSnapshot } from './gps/recovery';
import { ElevationTracker, StepFusion } from './gps/sensors';
import { GPS_PROFILES, profileFor, readPower, type GpsProfileName } from './power';
import { beginRunNotes, batteryNote, endRunNotes, splitNote, updateLiveNote } from './runNotify';
import { DEFAULT_SETTINGS, type LatLon, type Mood, type Quiet, type Settings, type Split } from './types';

export { LOCATION_TASK } from './gps/engine';

// Auto-pause: no real movement for this long → pause. Movement again → resume.
const AUTO_PAUSE_AFTER_MS = 6000;
const MOVING_SPEED_MPS = 0.9; // ~3.2 km/h; slower than a walk
const SNAPSHOT_EVERY_MS = 5000;
const MAX_PATH_POINTS = 20000; // ~5.5 h at 1 Hz before we thin the live path
const POWER_CHECK_EVERY_MS = 120_000; // battery level moves slowly; no need to ask often

export type TrackingStatus = 'idle' | 'running' | 'paused' | 'autopaused';
export type GpsQuality = 'searching' | 'good' | 'ok' | 'weak' | 'lost';

export interface LiveSplit {
  kind: 'km' | 'lap';
  index: number;
  distanceM: number;
  durationS: number;
}

export interface TrackingState {
  status: TrackingStatus;
  runId: number | null;
  startedAt: number | null;
  distanceM: number;
  durationS: number; // active seconds, pauses excluded
  elevationGainM: number;
  speedMps: number;
  gps: GpsQuality;
  gpsAccM: number | null;
  path: LatLon[];
  here: LatLon | null; // latest raw position, shown on the map even before we've moved
  splits: LiveSplit[];
  laps: LiveSplit[];
  currentKm: { distanceM: number; durationS: number };
  currentLap: { distanceM: number; durationS: number };
  engine: string;
  elevationSource: 'barometer' | 'gps';
  stepFilledM: number;
  gpsProfile: GpsProfileName;
}

let settings: Settings = { ...DEFAULT_SETTINGS };
export function applySettings(s: Settings) {
  settings = s;
  setCueMode(s.cueMode);
}

const filter = new GpsFilter();
const elevation = new ElevationTracker();
const steps = new StepFusion();

const state: TrackingState = {
  status: 'idle',
  runId: null,
  startedAt: null,
  distanceM: 0,
  durationS: 0,
  elevationGainM: 0,
  speedMps: 0,
  gps: 'searching',
  gpsAccM: null,
  path: [],
  here: null,
  splits: [],
  laps: [],
  currentKm: { distanceM: 0, durationS: 0 },
  currentLap: { distanceM: 0, durationS: 0 },
  engine: getEngine().name,
  elevationSource: 'gps',
  stepFilledM: 0,
  gpsProfile: 'best',
};

let accumulatedS = 0;
let segmentStartedAt: number | null = null;
let lastFixTs = 0;
let lastMovementTs = 0;
let kmMarkDistance = 0;
let kmMarkDuration = 0;
let lapMarkDistance = 0;
let lapMarkDuration = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotAt = 0;
let lastPowerCheckAt = 0;
let pendingPoints: Array<{ ts: number; lat: number; lon: number; alt: number | null; acc: number | null }> = [];

type Listener = (s: TrackingState) => void;
const listeners = new Set<Listener>();

function liveDuration(): number {
  return segmentStartedAt == null ? accumulatedS : accumulatedS + (Date.now() - segmentStartedAt) / 1000;
}

function splitUnitM(): number {
  return settings.unitsKm ? 1000 : 1609.344;
}

function snapshot(): TrackingState {
  const durationS = liveDuration();
  return {
    ...state,
    durationS,
    elevationGainM: elevation.gainM,
    elevationSource: elevation.source,
    stepFilledM: steps.filledM,
    path: state.path.slice(),
    splits: state.splits.slice(),
    laps: state.laps.slice(),
    currentKm: { distanceM: state.distanceM - kmMarkDistance, durationS: durationS - kmMarkDuration },
    currentLap: { distanceM: state.distanceM - lapMarkDistance, durationS: durationS - lapMarkDuration },
  };
}

function emit() {
  if (state.status !== 'idle') updateLiveNote({ status: state.status, distanceM: state.distanceM, durationS: liveDuration(), unitsKm: settings.unitsKm });
  // With the screen off or the app in the back, nobody is looking: skip the
  // snapshot (it copies the whole path) and the re-render it would cause.
  if (AppState.currentState !== 'active') return;
  const s = snapshot();
  listeners.forEach((l) => l(s));
}

AppState.addEventListener('change', (next) => {
  if (next === 'active') emit(); // catch the screen up straight away
});

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(snapshot());
  return () => listeners.delete(l);
}

export function getState(): TrackingState {
  return snapshot();
}

// ---- Segments (pause bookkeeping) -----------------------------------------

function closeSegment() {
  accumulatedS = liveDuration();
  segmentStartedAt = null;
  filter.reset(); // don't bridge the gap with a straight line when we resume
}

function openSegment() {
  segmentStartedAt = Date.now();
  lastMovementTs = Date.now();
}

/** Fixes recorded in this run that haven't been written to the database yet. */
export function unsavedPoints(): Array<{ ts: number; lat: number; lon: number }> {
  return pendingPoints.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon }));
}

// ---- Persistence ------------------------------------------------------------

async function persist(force = false) {
  if (state.runId == null || state.status === 'idle') return;
  const now = Date.now();
  if (!force && now - lastSnapshotAt < SNAPSHOT_EVERY_MS) return;
  lastSnapshotAt = now;
  const pts = pendingPoints;
  pendingPoints = [];
  if (pts.length) await addPoints(state.runId, pts);
  await updateRunProgress(state.runId, state.distanceM, Math.floor(liveDuration()), elevation.gainM);
  const snap: RunSnapshot = {
    runId: state.runId,
    status: state.status as RunSnapshot['status'],
    startedAt: state.startedAt ?? now,
    distanceM: state.distanceM,
    elevationGainM: elevation.gainM,
    accumulatedS,
    segmentStartedAt,
    kmMarkDistance,
    kmMarkDuration,
    lapMarkDistance,
    lapMarkDuration,
    splitCount: state.splits.length,
    lapCount: state.laps.length,
    savedAt: now,
  };
  await saveSnapshot(snap);
}

// ---- Splits ----------------------------------------------------------------

async function maybeCloseKmSplit() {
  const unit = splitUnitM();
  while (state.distanceM - kmMarkDistance >= unit) {
    const durationS = liveDuration();
    const index = state.splits.length + 1;
    const over = state.distanceM - kmMarkDistance - unit;
    const segDist = state.distanceM - kmMarkDistance;
    const segDur = durationS - kmMarkDuration;
    const closedDur = segDur * (1 - over / Math.max(segDist, 1));
    const split: LiveSplit = { kind: 'km', index, distanceM: unit, durationS: closedDur };
    state.splits.push(split);
    kmMarkDistance += unit;
    kmMarkDuration += closedDur;
    if (state.runId != null) {
      const row: Omit<Split, 'id' | 'runId'> = { kind: 'km', index, distanceM: unit, durationS: closedDur, atDistanceM: kmMarkDistance, atDurationS: kmMarkDuration };
      await addSplit(state.runId, row);
    }
    cueKmSplit(index, closedDur, kmMarkDuration, settings.unitsKm);
    splitNote(index, closedDur, kmMarkDistance, kmMarkDuration, settings.unitsKm);
  }
}

export async function lap(): Promise<void> {
  if (state.status === 'idle' || state.runId == null) return;
  const durationS = liveDuration();
  const index = state.laps.length + 1;
  const split: LiveSplit = { kind: 'lap', index, distanceM: state.distanceM - lapMarkDistance, durationS: durationS - lapMarkDuration };
  state.laps.push(split);
  lapMarkDistance = state.distanceM;
  lapMarkDuration = durationS;
  await addSplit(state.runId, { kind: 'lap', index, distanceM: split.distanceM, durationS: split.durationS, atDistanceM: lapMarkDistance, atDurationS: lapMarkDuration });
  cueLap(index, split.durationS);
  await persist(true);
  emit();
}

// ---- Fix pipeline ------------------------------------------------------------

function qualityFor(acc: number | null): GpsQuality {
  if (acc == null) return 'searching';
  if (acc <= 8) return 'good';
  if (acc <= 20) return 'ok';
  return 'weak';
}

function onFixes(raws: RawFix[]) {
  if (state.runId == null || state.status === 'idle') return;
  const latest = raws[raws.length - 1];
  if (latest) {
    state.here = { latitude: latest.lat, longitude: latest.lon };
    state.gpsAccM = latest.acc;
    state.gps = qualityFor(latest.acc);
  }
  if (state.status === 'paused') {
    emit();
    return;
  }
  let moved = false;

  for (const raw of raws) {
    state.gpsAccM = raw.acc;
    state.gps = qualityFor(raw.acc);
    const fix: FilteredFix | null = filter.push(raw);
    if (!fix) continue;
    lastFixTs = fix.ts;
    state.speedMps = fix.speed;
    if (fix.speed >= MOVING_SPEED_MPS || fix.stepM > 0) {
      moved = true;
      lastMovementTs = fix.ts;
    }

    if (state.status === 'autopaused') {
      if (moved) {
        state.status = 'running';
        openSegment();
        cueAutoResume();
      }
      continue;
    }

    if (fix.stepM > 0) {
      state.distanceM += fix.stepM;
      steps.onGpsStep(fix.stepM, fix.ts);
      pushPath({ latitude: fix.lat, longitude: fix.lon });
      pendingPoints.push({ ts: fix.ts, lat: fix.lat, lon: fix.lon, alt: fix.alt, acc: fix.acc });
    }
    elevation.pushGpsAltitude(fix.alt);
  }

  void maybeCloseKmSplit().then(() => persist());
  emit();
}

function pushPath(p: LatLon) {
  state.path.push(p);
  if (state.path.length > MAX_PATH_POINTS) {
    // Keep every other point of the older half; the DB keeps everything.
    const half = Math.floor(state.path.length / 2);
    state.path = state.path.slice(0, half).filter((_, i) => i % 2 === 0).concat(state.path.slice(half));
  }
}

async function tick() {
  const now = Date.now();
  if (state.status === 'running') {
    if (lastFixTs && now - lastFixTs > 10000) state.gps = 'lost';
    const filled = await steps.tick(now);
    if (filled > 0) {
      state.distanceM += filled;
      lastMovementTs = now;
      await maybeCloseKmSplit();
    }
    if (settings.autoPause && lastMovementTs && now - lastMovementTs > AUTO_PAUSE_AFTER_MS) {
      state.status = 'autopaused';
      state.speedMps = 0;
      closeSegment();
      cueAutoPause();
    }
  }
  if (now - lastPowerCheckAt > POWER_CHECK_EVERY_MS) {
    lastPowerCheckAt = now;
    await applyPowerProfile('tick');
  }
  await persist();
  emit();
}

// ---- Battery ---------------------------------------------------------------

/**
 * Pick the GPS profile for the current battery and setting. At start this just
 * records it; mid-run it restarts the engine if the profile changed. We only
 * ever step down to saver mid-run, never back up: plugging in on a run is rare
 * and flip-flopping around the threshold would be worse.
 */
async function applyPowerProfile(when: 'start' | 'tick' | 'user'): Promise<void> {
  const power = await readPower();
  const next = profileFor(settings.batteryMode, power);
  if (when === 'start') {
    state.gpsProfile = next.name;
    return;
  }
  if (next.name === state.gpsProfile || (when === 'tick' && next.name === 'best')) return;
  state.gpsProfile = next.name;
  const engine = getEngine();
  try {
    await engine.stop();
    await engine.start(next);
  } catch {
    // keep whatever is running
  }
  if (when === 'tick') batteryNote(power.level != null ? Math.round(power.level * 100) : null);
}

/** Settings screen: battery mode changed. Applies to a live run straight away. */
export function onBatteryModeChanged(): void {
  if (state.status === 'idle') return;
  void applyPowerProfile('user');
}

// ---- Permissions -----------------------------------------------------------

export async function ensurePermissions(): Promise<{ ok: boolean; background: boolean }> {
  const Location = await import('expo-location');
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { ok: true, background: bg.status === 'granted' };
}

// ---- Controls --------------------------------------------------------------

function resetState() {
  state.status = 'idle';
  state.runId = null;
  state.startedAt = null;
  state.distanceM = 0;
  state.speedMps = 0;
  state.gps = 'searching';
  state.gpsAccM = null;
  state.path = [];
  state.here = null;
  state.splits = [];
  state.laps = [];
  accumulatedS = 0;
  segmentStartedAt = null;
  lastFixTs = 0;
  lastMovementTs = 0;
  kmMarkDistance = 0;
  kmMarkDuration = 0;
  lapMarkDistance = 0;
  lapMarkDuration = 0;
  lastSnapshotAt = 0;
  lastPowerCheckAt = 0;
  state.gpsProfile = 'best';
  pendingPoints = [];
  filter.reset();
  elevation.reset();
  steps.reset();
}

async function attachSensors() {
  const engine = getEngine();
  engine.setListener(onFixes);
  await elevation.start();
  await steps.start();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => void tick(), 1000);
}

export async function startRun(moodBefore: Mood | null): Promise<void> {
  if (state.status !== 'idle') return;
  resetState();
  const now = Date.now();
  const runId = await createRun(now, moodBefore);
  state.status = 'running';
  state.runId = runId;
  state.startedAt = now;
  openSegment();
  await applyPowerProfile('start');
  lastPowerCheckAt = Date.now();
  await beginRunNotes(settings.runNotes);
  await attachSensors();
  await getEngine().start(GPS_PROFILES[state.gpsProfile]);
  await persist(true);
  emit();
}

export function pauseRun(): void {
  if (state.status !== 'running' && state.status !== 'autopaused') return;
  if (state.status === 'running') closeSegment();
  state.status = 'paused';
  state.speedMps = 0;
  void persist(true);
  emit();
}

export function resumeRun(): void {
  if (state.status !== 'paused') return;
  openSegment();
  state.status = 'running';
  void persist(true);
  emit();
}

export async function stopRun(extra: { moodAfter: Mood | null; quiet: Quiet | null; note: string | null }): Promise<number | null> {
  if (state.status === 'idle' || state.runId == null) return null;
  const runId = state.runId;
  const durationS = Math.floor(liveDuration());
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  const engine = getEngine();
  engine.setListener(null);
  await engine.stop();
  elevation.stop();
  steps.stop();
  if (pendingPoints.length) await addPoints(runId, pendingPoints);
  pendingPoints = [];
  await finishRun(runId, {
    endedAt: Date.now(),
    distanceM: state.distanceM,
    durationS,
    elevationGainM: elevation.gainM,
    moodAfter: extra.moodAfter,
    quiet: extra.quiet,
    note: extra.note,
  });
  await clearSnapshot();
  await endRunNotes();
  resetState();
  emit();
  return runId;
}

// ---- Recovery ---------------------------------------------------------------

/**
 * Called once at launch. If a run was in progress when the app died, rebuild
 * it and keep going. Returns true if a run was restored.
 */
export async function recoverRun(): Promise<boolean> {
  try {
    return await recoverRunInner();
  } catch {
    await clearSnapshot().catch(() => {});
    return false;
  }
}

async function recoverRunInner(): Promise<boolean> {
  const snap = await loadSnapshot();
  if (!snap) {
    await getEngine().stop(); // stray service from a crashed session with no snapshot
    return false;
  }
  const run = await getRun(snap.runId);
  if (!run || run.endedAt != null) {
    await clearSnapshot();
    await getEngine().stop();
    return false;
  }

  resetState();
  state.runId = snap.runId;
  state.startedAt = snap.startedAt;
  state.distanceM = snap.distanceM;
  accumulatedS = snap.accumulatedS;
  kmMarkDistance = snap.kmMarkDistance;
  kmMarkDuration = snap.kmMarkDuration;
  lapMarkDistance = snap.lapMarkDistance;
  lapMarkDuration = snap.lapMarkDuration;

  // Time between the last snapshot and now: if we were running, count it as
  // paused rather than inventing distance we didn't record.
  state.status = snap.status === 'running' ? 'running' : snap.status;
  if (snap.status === 'running' && snap.segmentStartedAt != null) {
    accumulatedS += (snap.savedAt - snap.segmentStartedAt) / 1000;
  }
  if (state.status === 'running') openSegment();

  const pts = await getPoints(snap.runId);
  state.path = pts.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  // Rebuild split lists from what we know (durations come from the splits table via the detail screen).
  const { getSplits } = await import('./db');
  const splits = await getSplits(snap.runId);
  state.splits = splits.filter((s) => s.kind === 'km').map((s) => ({ kind: 'km' as const, index: s.index, distanceM: s.distanceM, durationS: s.durationS }));
  state.laps = splits.filter((s) => s.kind === 'lap').map((s) => ({ kind: 'lap' as const, index: s.index, distanceM: s.distanceM, durationS: s.durationS }));

  await applyPowerProfile('start');
  lastPowerCheckAt = Date.now();
  await beginRunNotes(settings.runNotes);
  await attachSensors();
  const engine = getEngine();
  if (!(await engine.isRunning())) await engine.start(GPS_PROFILES[state.gpsProfile]);
  emit();
  return true;
}
