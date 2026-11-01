/**
 * Run state machine. Sits on top of:
 *   gps/engine   – where fixes come from (expo-location or Transistor)
 *   gps/kalman   – what to believe
 *   gps/sensors  – barometer elevation, pedometer gap fill
 *   gps/recovery – survive being killed (gps/replay: fixes kept while dead)
 *
 * Everything the UI reads comes from subscribe()/getState().
 */
import { AppState } from 'react-native';
import { cueAutoPause, cueAutoResume, cueBackOnRoute, cueKmSplit, cueLap, cueOffRoute, runSilent, setCueMode } from './cues';
import { RouteWatch, simplify } from './routeFollow';
import { addPoints, addSplit, clearBufferedFixes, createRun, finishRun, getBufferedFixes, getPoints, getRun, updateRunProgress } from './db';
import { getEngine } from './gps/engine';
import { GpsFilter, type FilteredFix, type RawFix } from './gps/kalman';
import { clearSnapshot, loadSnapshot, saveSnapshot, type RunSnapshot } from './gps/recovery';
import { replayFixes } from './gps/replay';
import { autoPauseDue } from './gps/moving';
import { ElevationTracker, StepFusion } from './gps/sensors';
import { rememberPlace } from './place';
import { GPS_PROFILES, profileFor, readPower, type GpsProfileName } from './power';
import { beginRunNotes, batteryNote, endRunNotes, splitNote, updateLiveNote } from './runNotify';
import { setWearEnabled, wearLive, wearSplit } from './wear';
import { heartRun } from './heartIn';
import { strapRun } from './strap';
import { DEFAULT_SETTINGS, type LatLon, type Mood, type Quiet, type Settings, type Split } from './types';

export { LOCATION_TASK } from './gps/engine';

// Auto-pause: fixes showing no real movement for 6 s → pause (gps/moving.ts). Movement again → resume.
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
  /** Stop tapped, sensors off, finish screen showing. */
  halted: boolean;
  /** Following a route: how far off it you are, while off; null on it or not following. */
  offRouteM: number | null;
}

let settings: Settings = { ...DEFAULT_SETTINGS };
export function applySettings(s: Settings) {
  settings = s;
  setCueMode(s.cueMode);
  setWearEnabled(s.watch);
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
  halted: false,
  offRouteM: null,
};

// Following a route (src/routeFollow.ts): set after the run starts, gone when it ends.
let routeWatch: RouteWatch | null = null;

/** Follow this line for the run under way: a long buzz when you leave it, a tap when you're back. null stops. */
export function followRoute(path: LatLon[] | null): void {
  routeWatch = path && path.length > 1 ? new RouteWatch(simplify(path.map((p) => ({ lat: p.latitude, lon: p.longitude })), 4)) : null;
  state.offRouteM = null;
  emit();
}

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

// A guided session (training plan) reads progress off every tick, screen on or
// off, so its cues fire in the background where the snapshot listeners do not.
type ProgressHook = (distanceM: number, durationS: number, status: TrackingStatus) => void;
let progressHook: ProgressHook | null = null;
export function setProgressHook(h: ProgressHook | null) {
  progressHook = h;
}

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
  const runStatus = state.halted ? 'halted' : state.status;
  heartRun(state.runId, runStatus);
  strapRun(runStatus);
  wearLive({ status: runStatus, runId: state.runId, distanceM: state.distanceM, durationS: liveDuration(), unitsKm: settings.unitsKm });
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
  steps.gap.breakTrack(Date.now());
}

function openSegment() {
  segmentStartedAt = Date.now();
  lastMovementTs = Date.now();
  steps.gap.breakTrack(Date.now()); // steps taken while stopped don't count
}

/** Fixes recorded in this run that haven't been written to the database yet. */
export function unsavedPoints(): Array<{ ts: number; lat: number; lon: number; alt: number | null }> {
  return pendingPoints.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, alt: p.alt }));
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

/** quiet: closing splits found on recovery, too late to announce. */
async function maybeCloseKmSplit(quiet = false) {
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
    if (quiet) continue;
    cueKmSplit(index, closedDur, kmMarkDuration, settings.unitsKm);
    if (!runSilent()) splitNote(index, closedDur, kmMarkDistance, kmMarkDuration, settings.unitsKm);
    if (!runSilent()) wearSplit(index, closedDur, kmMarkDistance, kmMarkDuration, settings.unitsKm);
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
    rememberPlace(state.here);
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
      if (!moved) continue;
      state.status = 'running';
      openSegment();
      cueAutoResume();
      // Fall through: the step that showed you moving again is real distance.
    }

    // After a step-filled gap the first fix only adds what the steps didn't cover.
    const closesGap = steps.gap.gapOpen;
    const credit = steps.gap.onFix(fix);
    if (fix.stepM > 0 || closesGap) {
      state.distanceM += credit;
      pushPath({ latitude: fix.lat, longitude: fix.lon });
      pendingPoints.push({ ts: fix.ts, lat: fix.lat, lon: fix.lon, alt: fix.alt, acc: fix.acc });
    }
    elevation.pushGpsAltitude(fix.alt, fix.ts);
    if (routeWatch) {
      const ev = routeWatch.push({ lat: fix.lat, lon: fix.lon }, fix.acc, fix.ts);
      state.offRouteM = routeWatch.offByM;
      if (ev === 'off' || ev === 'remind') void cueOffRoute();
      else if (ev === 'back') void cueBackOnRoute();
    }
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
      // Steps cover the gap now; the filter must not also draw a line across it.
      filter.reset();
      state.distanceM += filled;
      lastMovementTs = now;
      await maybeCloseKmSplit();
    }
    if (settings.autoPause && autoPauseDue(now, lastFixTs, lastMovementTs)) {
      // The clock stops where it is. It never steps back to the last movement:
      // a timer that jumps from 0:24 to 0:17 reads as broken (YY, 1 Nov), and
      // a few seconds per stop is what Garmin and Strava's live timers count too.
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
  if (progressHook && state.status !== 'idle') progressHook(state.distanceM, liveDuration(), state.status);
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
  // Steps fill GPS gaps (tunnels, tall streets). Optional: no answer, no step fill.
  const { Pedometer } = await import('expo-sensors');
  await Pedometer.requestPermissionsAsync().catch(() => null);
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
  state.halted = false;
  state.offRouteM = null;
  routeWatch = null;
  filter.reset();
  elevation.reset();
  steps.reset();
}

async function attachSensors() {
  state.halted = false;
  const engine = getEngine();
  engine.setListener(onFixes);
  await clearBufferedFixes().catch(() => {}); // recording live again; anything kept is stale
  await elevation.start();
  await steps.start();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => void tick(), 1000);
}

/** Everything that listens, off: GPS service, foreground watch, barometer, pedometer, the clock. */
async function detachSensors() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  const engine = getEngine();
  engine.setListener(null);
  await engine.stop().catch(() => {});
  elevation.stop();
  steps.stop();
}

/**
 * The background service. Without "Always" location some Android versions
 * refuse it; the foreground watch from attachSensors() still records while the
 * app is open, so the run goes ahead instead of failing.
 */
async function startEngine() {
  try {
    await getEngine().start(GPS_PROFILES[state.gpsProfile]);
  } catch {
    // foreground watch only
  }
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
  await startEngine();
  await persist(true);
  emit();
}

/**
 * Stop was tapped. Freeze the clock and switch every sensor off straight away,
 * so nothing records while the finish screen asks keep or discard. The run
 * stays open until stopRun(); continueRun() picks it back up.
 */
export async function haltRun(): Promise<void> {
  if (state.status === 'idle' || state.halted) return;
  if (state.status === 'running') closeSegment();
  state.status = 'paused';
  state.speedMps = 0;
  state.halted = true;
  await detachSensors();
  await persist(true).catch(() => {});
  emit();
}

/** Changed your mind on the finish screen: sensors back on, clock running. */
export async function continueRun(): Promise<void> {
  if (state.status === 'idle') return;
  if (state.halted) {
    await attachSensors();
    await startEngine();
  }
  resumeRun();
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
  if (state.status !== 'paused' && state.status !== 'autopaused') return;
  // Auto-paused and the runner taps play: they're going now, so auto-pause
  // starts counting stillness from this moment, not from the crossing.
  if (state.status === 'autopaused') lastMovementTs = Date.now();
  openSegment();
  state.status = 'running';
  void persist(true);
  emit();
}

export async function stopRun(extra: { moodAfter: Mood | null; quiet: Quiet | null; note: string | null }): Promise<number | null> {
  if (state.status === 'idle' || state.runId == null) return null;
  const runId = state.runId;
  const durationS = Math.floor(liveDuration());
  await detachSensors();
  state.halted = false;
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
  await clearBufferedFixes().catch(() => {});
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
    // Couldn't pick it back up. Never lose it for that: the snapshot stays,
    // the launch tidy-up (closeUnfinishedRuns) closes the run where its
    // recording stopped, and the next launch drops the snapshot of a run
    // that has ended.
    resetState();
    await detachSensors().catch(() => {});
    await getEngine().stop().catch(() => {});
    return false;
  }
}

async function recoverRunInner(): Promise<boolean> {
  const snap = await loadSnapshot();
  if (!snap) {
    await getEngine().stop(); // stray service from a crashed session with no snapshot
    await clearBufferedFixes().catch(() => {});
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

  elevation.gainM = snap.elevationGainM ?? 0;

  const pts = await getPoints(snap.runId);
  state.path = pts.map((p) => ({ latitude: p.lat, longitude: p.lon }));

  // Fixes the background task kept while the app was dead. Only a running
  // run gets them: a paused one wasn't recording anyway.
  const buffered = await getBufferedFixes().catch(() => []);
  const last = pts.length ? pts[pts.length - 1] : null;
  const replay = snap.status === 'running' ? replayFixes(last, buffered.filter((f) => f.ts > snap.savedAt)) : null;
  if (replay && replay.points.length) {
    state.distanceM += replay.distanceM;
    for (const p of replay.points) pushPath({ latitude: p.lat, longitude: p.lon });
    await addPoints(snap.runId, replay.points);
  }

  // Time: a running clock counts up to the last sign of movement (the last
  // snapshot, or the last replayed fix that moved). The rest, up to now, is
  // counted as paused rather than invented.
  state.status = snap.status;
  if (snap.status === 'running' && snap.segmentStartedAt != null) {
    const until = Math.max(snap.savedAt, replay?.lastMovingTs ?? 0);
    accumulatedS += Math.max(0, until - snap.segmentStartedAt) / 1000;
  }
  if (state.status === 'running') openSegment();
  // Rebuild split lists from what we know (durations come from the splits table via the detail screen).
  const { getSplits } = await import('./db');
  const splits = await getSplits(snap.runId);
  state.splits = splits.filter((s) => s.kind === 'km').map((s) => ({ kind: 'km' as const, index: s.index, distanceM: s.distanceM, durationS: s.durationS }));
  state.laps = splits.filter((s) => s.kind === 'lap').map((s) => ({ kind: 'lap' as const, index: s.index, distanceM: s.distanceM, durationS: s.durationS }));

  await applyPowerProfile('start');
  lastPowerCheckAt = Date.now();
  await beginRunNotes(settings.runNotes);
  await attachSensors();
  for (const a of replay?.alts ?? []) elevation.pushGpsAltitude(a.alt, a.ts); // no-op with a barometer
  if (!(await getEngine().isRunning())) await startEngine();
  if (replay?.points.length) await maybeCloseKmSplit(true);
  await persist(true);
  emit();
  return true;
}
