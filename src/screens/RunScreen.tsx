import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Dimensions, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { DISPLAY_MAX_SCALE, spokenDistance, spokenDuration, spokenPace, spokenRun } from '../a11y';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Face } from '../components/Mark';
import { MoodPicker } from '../components/MoodPicker';
import { MusicStrip } from '../components/MusicStrip';
import { FeelPicker } from '../components/FeelPicker';
import { PainPicker } from '../components/PainPicker';
import { PlaceFinishCard } from '../components/PlaceFinishCard';
import { QuietPicker } from '../components/QuietPicker';
import { RouteMap } from '../components/RouteMap';
import { StoriesCard, storyPins, useRouteStories } from '../components/StoriesCard';
import { SavePlaceSheet } from '../components/SavePlaceSheet';
import { suggestName } from '../places';
import { createPlace, dismissLoop, finishPlace, logRun, saveSig, type FinishPlace, type Place, type PlaceDraft } from '../placeStore';
import { RunStatsView } from '../components/RunStats';
import { UnlockNudge } from '../components/UnlockNudge';
import { HowWasIt } from '../components/HowWasIt';
import { useReduceMotion } from '../motion';
import { YouLine } from '../components/YouLine';
import { useBack } from '../back';
import { cueCountdown, setRunSilent } from '../cues';
import { deleteRun, getHeartRate, getPoints, listRuns, loadValue, saveValue } from '../db';
import { cleanHeart, heartSummary, type HeartSummary } from '../heart';
import { HomeScreen } from './HomeScreen';
import { countdownFootage, type Footage } from '../footage';
import { distanceUnit, formatDistance, formatDistanceNumber, formatDuration, formatElevation, formatPace, formatSpeedAsPace } from '../geo';
import { effectivePreset, silentRun, type RunPreset } from '../presets';
import { compare, youVsYou, type RunFacts } from '../progress';
import type { StatPoint } from '../runStats';
import { useSettings } from '../settings';
import { finishSurprise, type Surprise } from '../surprises';
import { continueRun, ensureIndoorPermissions, ensurePermissions, getState, haltRun, lap, pauseRun, resumeRun, startRun, stopRun, subscribe, TrackingState, unsavedPoints } from '../tracking';
import { colors, fonts, radius, spacing, type, themedStyles, night } from '../theme';
import { applyEnergy, type PainLevel } from '../training/adapt';
import { loadPlan, nextSession, savePlan, todaySession } from '../training/store';
import type { Feel, Plan, Session, Step, StepDone } from '../training/types';
import { createWorkout, formatLeft, leftClock, stepFeel, stepLine, stepName } from '../training/workout';
import type { LatLon, Mood, Quiet, Run } from '../types';
import { planSessionOpen } from '../unlock';
import { onWatchCommand } from '../wear';
import type { WatchCommand } from '../wearProtocol';
import { cachedWeather } from '../weather';
import { isQuick } from '../training/quick';
import { parseDistance } from '../runEdit';
import { beginWorkout, endWorkout, subscribeWorkout, takeWorkoutSteps, type GuidedRun } from '../workoutRun';
import type { Offer } from '../commute';
import { lastCommuteRoute, loadCommute } from '../commuteStore';
import { liveFacts, recordRunFacts } from '../you';
import { ui } from '../i18n/ui';
import { voice } from '../i18n/voice';

type Phase = 'idle' | 'countdown' | 'active' | 'finish';

/** "Run this again" from a place: its loop as a faint line under the live one. */
export interface Ghost {
  placeId?: number;
  name: string;
  path: LatLon[];
  /** Run to work, Run home: where the run ends, ringed on the map. */
  goal?: LatLon;
}

/** Ids of the once-only finish lines already used (src/surprises.ts). */
const SEEN_KEY = 'surprises.seen';
/** Under this, Stop asks before making a run of it: a pocket tap is not a run. */
const TINY_RUN_M = 50;
/** How long Stop is held before the run ends. Long enough that a sleeve or a pocket can't do it. */
const HOLD_TO_STOP_MS = 1000;

/** Stories are only asked for on the finish screen. */
const NO_POINTS: StatPoint[] = [];

/** What the finish screen hands over with a saved run, for the plan. */
export interface RunExtra {
  pain: PainLevel | null;
  sessionId: string | null;
  feel: Feel | null;
  steps: StepDone[] | null;
}

export function RunScreen({ onSaved, requested = null, onRequestTaken, planKey = 0, focused = true, onOpenPlan, onPlanChanged, onBrowseListen, onInk, ghost = null, onGhostTaken, onWatchStart, onCountdown }: { onSaved: (runId: number, share?: boolean, extra?: RunExtra) => void; requested?: Session | null; onRequestTaken?: () => void; planKey?: number; focused?: boolean; onOpenPlan?: () => void; onPlanChanged?: () => void; onBrowseListen?: () => void; onInk?: (ink: boolean) => void; ghost?: Ghost | null; onGhostTaken?: () => void; onWatchStart?: () => void; onCountdown?: (on: boolean) => void }) {
  const { settings } = useSettings();
  const km = settings.unitsKm;
  const [track, setTrack] = useState<TrackingState>(getState());
  const [phase, setPhase] = useState<Phase>(track.status === 'idle' ? 'idle' : 'active');
  const [count, setCount] = useState(0);
  const [moodBefore, setMoodBefore] = useState<Mood | null>(null);
  const [moodAfter, setMoodAfter] = useState<Mood | null>(null);
  const [quiet, setQuiet] = useState<Quiet | null>(null);
  const [note, setNote] = useState('');
  // Final numbers are frozen the moment the user taps Stop.
  const [final, setFinal] = useState<TrackingState | null>(null);
  // This run's bests and the runs before it, for the one you-vs-you line.
  const [live, setLive] = useState<{ run: RunFacts; history: RunFacts[] } | null>(null);
  // Every fix of the run on the finish screen, for the charts: what's saved plus what isn't yet.
  const [finishPoints, setFinishPoints] = useState<StatPoint[]>([]);
  const [finishHeart, setFinishHeart] = useState<HeartSummary | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [mapFront, setMapFront] = useState(false);
  // A finger moved the map: it stays put until "Follow me" or back to the numbers.
  const [mapHeld, setMapHeld] = useState(false);
  const [countFootage, setCountFootage] = useState<Footage>('trail-bridge');
  // The finish line for this run, when it has earned one; otherwise finishLine().
  const [surprise, setSurprise] = useState<Surprise | null>(null);
  // Your places: the loop this run is on, the third-run offer, and what the runner filled in.
  const [found, setFound] = useState<FinishPlace | null>(null);
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft | null>(null);
  const [placeSheet, setPlaceSheet] = useState(false);
  const [ghostRun, setGhostRun] = useState<Ghost | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const stories = useRouteStories(phase === 'finish' ? finishPoints : NO_POINTS);
  const veil = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  // Heights of the words and the numbers laid over the finish map, so the route is framed between them.
  const [finishPad, setFinishPad] = useState({ top: 140, bottom: 170 });
  // At large text sizes the words and numbers over the map grow; the map grows with them.
  const [finishCardH, setFinishCardH] = useState(170);
  // The plan, when there is one: today's session (or the one opened from the
  // Train tab), the guided steps during the run, and the pain line after.
  const [hasPlan, setHasPlan] = useState(false);
  const [planSession, setPlanSession] = useState<Session | null>(null);
  const [planNext, setPlanNext] = useState<Session | null>(null); // the next session, on a rest day
  const [planShown, setPlanShown] = useState<Plan | null>(null); // active or paused, for the welcome back after a break
  const [pain, setPain] = useState<PainLevel | null>(null);
  const [feel, setFeel] = useState<Feel | null>(null);
  const [guided, setGuided] = useState<GuidedRun | null>(null);
  const session = requested ?? planSession;
  const sessionOpen = !!session && !session.done && !session.skipped;
  // Today's run: a session opened from Train is always followed; otherwise the preset picks.
  const preset: RunPreset = requested && sessionOpen ? 'plan' : effectivePreset(settings.runPreset, sessionOpen);
  // The layout of the run in progress, fixed when it starts. A run picked back up after the app was killed keeps today's preset.
  const [layout, setLayout] = useState<RunPreset>(preset);
  // Clear my head: the running time stays hidden until asked for.
  const [showTime, setShowTime] = useState(false);
  // Treadmill: what the treadmill said, typed on the finish screen (in the runner's unit).
  const [treadmillText, setTreadmillText] = useState('');

  // The screen is the second-biggest drain after GPS. Off by default: the lock
  // screen (and the watch) carry the live numbers instead.
  // A treadmill run keeps it on too: the phone counts steps best with the app open, and it sits on the console anyway.
  const keepAwake = phase === 'active' && (settings.keepScreenOn || track.indoor);
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('run').catch(() => {});
    return () => {
      deactivateKeepAwake('run').catch(() => {});
    };
  }, [keepAwake]);
  useEffect(() => subscribe(setTrack), []);
  // The tab bar goes the moment the countdown starts, so the run can't begin behind another tab.
  useEffect(() => onCountdown?.(phase === 'countdown'), [phase]);
  // A run picked back up after the phone closed the app arrives after this
  // screen is drawn: show it, rather than a Start button over a live run.
  useEffect(() => {
    if (phase === 'idle' && track.status !== 'idle') setPhase('active');
  }, [phase, track.status]);
  useEffect(() => {
    if (phase === 'idle') listRuns().then(setRuns);
  }, [phase]);

  useEffect(() => {
    const runId = final?.runId;
    if (phase !== 'finish' || runId == null) {
      setFinishPoints([]);
      setFinishHeart(null);
      return;
    }
    let alive = true;
    // From a watch, if one was on the wrist. Its last readings land a moment after Stop.
    const t = setTimeout(() => {
      getHeartRate(runId)
        .then((hr) => alive && setFinishHeart(heartSummary(cleanHeart(hr, final?.startedAt ?? 0, null))))
        .catch(() => {});
    }, 1500);
    getPoints(runId)
      .then((saved) => {
        const seen = new Set(saved.map((p) => p.ts));
        const all = [...saved.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, alt: p.alt })), ...unsavedPoints().filter((p) => !seen.has(p.ts))];
        if (alive) setFinishPoints(all.sort((a, b) => a.ts - b.ts));
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [phase, final?.runId]);
  useEffect(() => {
    if (phase !== 'finish' || finishPoints.length < 2) return;
    let alive = true;
    finishPlace(final?.runId ?? null, finishPoints)
      .then((f) => alive && setFound(f))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [phase, finishPoints]);
  // "Run this again": the loop is picked and waits on the home screen; the runner
  // still sets their energy and presses Start.
  useEffect(() => {
    if (!ghost || phase !== 'idle') return;
    setGhostRun(ghost);
    onGhostTaken?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, phase]);
  useEffect(() => {
    if (phase !== 'idle') return;
    loadPlan()
      .then((p) => {
        const active = p && p.status === 'active' ? p : null;
        setHasPlan(!!active);
        setPlanShown(p && (p.status === 'active' || p.status === 'paused') ? p : null);
        // Run home only offers sessions the plan can guide; a locked week says nothing here.
        const open = (x: Session | null) => (active && x && planSessionOpen(active, x.id) ? x : null);
        const today = active ? todaySession(active) : null;
        setPlanSession(open(today));
        setPlanNext(active && !today ? open(nextSession(active)) : null);
      })
      .catch(() => {});
  }, [phase, planKey]);
  useEffect(() => subscribeWorkout(setGuided), []);
  useEffect(() => {
    // Picked back up after the app was killed: keep a quiet run quiet.
    if (getState().status !== 'idle') setRunSilent(silentRun(preset, settings.silentDay, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown: RunPreset = layout === 'plan' && !guided ? 'just' : layout;
  const ink = phase === 'active' && shown === 'just';
  useEffect(() => {
    onInk?.(ink);
  }, [ink, onInk]);
  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // The watch's buttons (src/wear.ts) do what the ones on this screen do.
  const watchRef = useRef<(c: WatchCommand) => void>(() => {});
  watchRef.current = (c) => {
    if (c === 'start' && phase === 'idle') {
      onWatchStart?.();
      void onStart();
    } else if (c === 'pause' && phase === 'active') pauseRun();
    else if (c === 'resume' && phase === 'active') resumeRun();
    else if (c === 'stop' && phase === 'active') void onStop();
  };
  useEffect(() => {
    onWatchCommand((c) => watchRef.current(c));
    return () => onWatchCommand(null);
  }, []);

  async function onStart() {
    // A route waits here: the line to follow is only drawn in Just run, so it runs as one.
    if (ghostRun) {
      await begin('just', null);
      return;
    }
    // A low face before a hard or long day: the plan gives way before the run, not after.
    // A quick workout isn't the plan's, so there is no plan to give way.
    if (session && sessionOpen && preset === 'plan' && !isQuick(session) && (session.hard || session.kind === 'long') && moodBefore != null && moodBefore <= 2) {
      Alert.alert(ui().run.lowEnergyAndXIs(session.title), ui().run.easyDaysAreAllowedNothing, [
        { text: ui().run.makeItEasy, onPress: () => giveWay('easy') },
        { text: ui().run.restToday, onPress: () => giveWay('rest') },
        { text: ui().run.runItAsPlanned, onPress: () => giveWay('planned') },
      ]);
      return;
    }
    await begin();
  }

  // Run to work, Run home: work (or home) ringed on the map, and the last run that way drawn faintly.
  async function onCommute(o: Offer) {
    const path = await loadCommute()
      .then((c) => lastCommuteRoute(o.dir, c))
      .catch(() => null);
    // Picked, not started: Start (below the energy question) begins it.
    setGhostRun({ name: o.dir === 'toWork' ? ui().commute.runToWork : ui().commute.runHome, path: path ?? [], goal: o.goal });
  }

  // Opened from Train, but not today: the runner's usual kind of run, no session behind it.
  async function onRunWithoutPlan() {
    const kind: RunPreset = settings.runPreset && settings.runPreset !== 'plan' ? settings.runPreset : 'just';
    onRequestTaken?.();
    await begin(kind, null);
  }

  // Welcome back: a free run, as Just run, whatever was picked last time.
  async function onRunFree() {
    await begin('just');
  }

  async function giveWay(choice: 'easy' | 'rest' | 'planned') {
    if (!session || moodBefore == null) return;
    try {
      const plan = await loadPlan();
      if (plan && plan.status === 'active') {
        const r = applyEnergy(plan, session.date, moodBefore, choice);
        await savePlan(r.plan);
        if (r.fatigue === 'doctor') Alert.alert(ui().run.fiveLowDaysInTwo, ui().run.thatIsMoreThanA);
        else if (r.fatigue === 'lighter') Alert.alert(ui().run.threeLowDaysThisWeek, ui().run.nextWeekIsLighterNothing);
        // The eased (or kept) session is the one that runs: state set here only shows on the next render.
        const next = r.plan.weeks.flatMap((w) => w.sessions).find((x) => x.id === session.id) ?? todaySession(r.plan);
        setPlanSession(todaySession(r.plan));
        onRequestTaken?.();
        if (choice === 'rest') return;
        await begin('plan', next);
        return;
      }
    } catch {
      // the run still happens
    }
    await begin();
  }

  /** Runs the session passed in, not the one this render happened to hold. */
  async function begin(as: RunPreset = preset, run: Session | null = session) {
    // A route to follow is outside by definition; otherwise the Home line decides.
    const indoor = settings.treadmill && !ghostRun;
    if (indoor) {
      // No location at all on a treadmill. Without a step counter the distance waits for the finish.
      if (!(await ensureIndoorPermissions())) {
        const ok = await new Promise<boolean>((resolve) =>
          Alert.alert(ui().runAids.stepsOffTitle, ui().runAids.stepsOff, [
            { text: ui().run.cancel, style: 'cancel', onPress: () => resolve(false) },
            { text: ui().run.runAnyway, onPress: () => resolve(true) },
          ], { cancelable: true, onDismiss: () => resolve(false) }),
        );
        if (!ok) return;
      }
      await countIn(as, run, true);
      return;
    }
    const perm = await ensurePermissions();
    if (!perm.ok) {
      setGhostRun(null);
      Alert.alert(ui().run.locationNeeded, ui().run.runtrovertCanOnlyRecordA, [
        { text: ui().run.cancel, style: 'cancel' },
        { text: ui().run.openPhoneSettings, onPress: () => void Linking.openSettings().catch(() => {}) },
      ]);
      return;
    }
    // Nothing starts behind the warning: the runner picks first.
    if (!perm.background) {
      const pick = await new Promise<'run' | 'settings' | 'cancel'>((resolve) =>
        Alert.alert(
          ui().run.backgroundLocation,
          ui().run.withoutAlwaysLocationTheRun,
          [
            { text: ui().run.cancel, style: 'cancel', onPress: () => resolve('cancel') },
            { text: ui().run.openPhoneSettings, onPress: () => resolve('settings') },
            { text: ui().run.runAnyway, onPress: () => resolve('run') },
          ],
          { cancelable: true, onDismiss: () => resolve('cancel') },
        ),
      );
      if (pick !== 'run') {
        setGhostRun(null);
        if (pick === 'settings') Linking.openSettings().catch(() => {});
        return;
      }
    }
    await countIn(as, run, false);
  }

  /** The countdown (or none), then the run. */
  async function countIn(as: RunPreset, run: Session | null, indoor: boolean) {
    setLayout(as);
    setShowTime(false);
    setRunSilent(silentRun(as, settings.silentDay, Date.now()));
    if (settings.countdownS > 0) {
      setCountFootage(countdownFootage());
      setPhase('countdown');
      let n = settings.countdownS;
      setCount(n);
      cueCountdown(n);
      countdownRef.current = setInterval(async () => {
        n -= 1;
        setCount(n);
        if (n <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          cueCountdown(0);
          await go(as, run, indoor);
        } else {
          cueCountdown(n);
        }
      }, 1000);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await go(as, run, indoor);
    }
  }

  async function go(as: RunPreset = preset, run: Session | null = session, indoor = false) {
    if (as === 'plan' && run && !run.done && !run.skipped) beginWorkout(run);
    try {
      await startRun(moodBefore, { indoor });
      setPhase('active');
    } catch {
      endWorkout();
      await discardNow();
      Alert.alert(ui().run.couldnTStartRecording, ui().run.locationDidnTAnswerTry);
    }
  }

  function cancelCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setRunSilent(false);
    setGhostRun(null);
    setPhase('idle');
  }

  function toggleMap() {
    Haptics.selectionAsync();
    const next = !mapFront;
    setMapFront(next);
    setMapHeld(false);
    Animated.timing(veil, { toValue: next ? 0 : 1, duration: reduceMotion ? 0 : 260, useNativeDriver: true }).start();
  }

  function onPauseResume() {
    Haptics.selectionAsync();
    // Auto-paused counts as paused here: play resumes it, it never turns into a manual pause.
    if (track.status === 'paused' || track.status === 'autopaused') resumeRun();
    else pauseRun();
  }

  // The phone's back gesture never drops a run on the floor.
  useBack(() => {
    if (phase === 'countdown') {
      cancelCountdown();
    } else if (phase === 'active') {
      Alert.alert(ui().run.stillRecording, ui().run.theRunKeepsGoingUntil, [
        { text: ui().run.keepRunning, style: 'cancel' },
        { text: ui().run.finishRun, onPress: () => void onStop() },
      ]);
    } else if (phase === 'finish') {
      Alert.alert(ui().run.keepThisRun, ui().run.pickOneBeforeYouGo, [
        { text: ui().run.notYet, style: 'cancel' },
        { text: ui().run.discard, style: 'destructive', onPress: () => void discardNow() },
        { text: ui().run.keepIt, onPress: () => void onSave() },
      ]);
    }
    return true;
  }, focused && phase !== 'idle');

  async function onStop() {
    // Sensors off the moment you stop: nothing records behind the finish screen.
    await haltRun();
    const f = getState();
    // A treadmill run without a step counter shows 0 until the treadmill's number is typed: that's not a pocket tap.
    if (f.distanceM < TINY_RUN_M && !(f.indoor && f.durationS >= 60)) {
      Alert.alert(
        ui().run.barelyMoved,
        ui().run.xAndXKeepIt(formatDuration(f.durationS), formatDistance(f.distanceM, km)),
        [
          { text: ui().run.carryOn, style: 'cancel', onPress: () => void continueRun() },
          { text: ui().run.discard, style: 'destructive', onPress: () => void discardNow() },
          { text: ui().run.keepIt, onPress: () => void showFinish(f) },
        ],
        { cancelable: false },
      );
      return;
    }
    await showFinish(f);
  }

  async function showFinish(f: TrackingState) {
    setFinal(f);
    setPhase('finish');
    setSurprise(await pickSurprise(f, runs, km));
    if (f.runId != null) {
      liveFacts({ runId: f.runId, startedAt: f.startedAt ?? Date.now(), distanceM: f.distanceM, durationS: f.durationS, elevationGainM: f.elevationGainM, unsaved: unsavedPoints() })
        .then(setLive)
        .catch(() => {});
    }
  }

  async function onSave(share = false) {
    // One tap keeps one run: a second tap while saving does nothing.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const startedAt = final?.startedAt ?? Date.now();
    const durationS = final?.durationS ?? 0;
    let id: number | null;
    try {
      id = await stopRun({ moodAfter, quiet, note: note.trim() || null, treadmillM: final?.indoor ? typedTreadmillM(treadmillText, km) : null });
    } catch {
      // Nothing is lost: the run, the answers and the note stay on this screen for another try.
      savingRef.current = false;
      setSaving(false);
      Alert.alert(ui().run.couldntSaveTheRun, ui().run.theRunIsStillHere);
      return;
    }
    // With Fewer words the line wasn't shown, so a once-only one stays for later.
    if (id != null && surprise?.once && !settings.fewerWords) {
      const seen = (await loadValue<string[]>(SEEN_KEY).catch(() => null)) ?? [];
      saveValue(SEEN_KEY, [...seen, surprise.id]).catch(() => {});
    }
    if (id != null) await recordRunFacts(id, startedAt, durationS).catch(() => {});
    if (id != null) await keepPlace(id).catch(() => {});
    const extra: RunExtra = { pain, sessionId: guided?.session.id ?? null, feel, steps: guided ? takeWorkoutSteps(final?.distanceM ?? 0, durationS) : null };
    reset();
    savingRef.current = false;
    setSaving(false);
    if (id != null) onSaved(id, share, extra);
  }

  /** The run is kept: remember its route, and log it in its place or keep it as a new one. */
  async function keepPlace(runId: number) {
    if (!found) return;
    await saveSig(runId, found.sig);
    if (found.offer.kind === 'place') await logRun(found.offer.placeId, runId);
    else if (placeDraft && found.sig) await createPlace(placeDraft, found.sig, runId, found.earlier);
  }

  function placeNotNow() {
    if (found?.sig) dismissLoop(found.sig).catch(() => {});
    setFound(null);
  }

  function onDiscard() {
    Alert.alert(ui().run.discardRun, ui().run.thisCannotBeUndone, [
      { text: ui().run.keep, style: 'cancel' },
      { text: ui().run.discard, style: 'destructive', onPress: () => void discardNow() },
    ]);
  }

  async function discardNow() {
    try {
      const id = await stopRun({ moodAfter: null, quiet: null, note: null });
      if (id != null) await deleteRun(id);
    } catch {
      // nothing left to tidy
    }
    reset();
  }

  // Stopped by mistake: straight back to recording. The clock stood still on the finish screen.
  async function onResumeRun() {
    Haptics.selectionAsync();
    await continueRun();
    setFinal(null);
    setSurprise(null);
    setLive(null);
    setFound(null);
    setPhase('active');
  }

  function reset() {
    endWorkout();
    setRunSilent(false);
    onRequestTaken?.();
    setPain(null);
    setFeel(null);
    setPhase('idle');
    setMoodBefore(null);
    setMoodAfter(null);
    setQuiet(null);
    setNote('');
    setTreadmillText('');
    setFinal(null);
    setSurprise(null);
    setLive(null);
    setFound(null);
    setPlaceDraft(null);
    setPlaceSheet(false);
    setGhostRun(null);
    setMapFront(false);
    veil.setValue(1);
  }

  /** "Run this again" from the home screen's place: the same as from the place itself. */
  function runPlace(p: Place) {
    setGhostRun({ placeId: p.id, name: p.name, path: p.sig.pts.map(([latitude, longitude]) => ({ latitude, longitude })) });
  }

  // ---- Idle ------------------------------------------------------------------
  if (phase === 'idle') {
    return <HomeScreen runs={runs} mood={moodBefore} onMood={setMoodBefore} onStart={onStart} onCommute={onCommute} onRunFree={onRunFree} planToday={session} planNext={requested ? null : planNext} plan={requested ? null : planShown} welcomeBack={!requested} onOpenPlan={onOpenPlan} onPlanChanged={onPlanChanged} onBrowseListen={onBrowseListen} onRunPlace={runPlace} route={ghostRun ? { name: ghostRun.name } : null} onClearRoute={() => setGhostRun(null)} runPreset={preset} onRunWithoutPlan={requested && sessionOpen ? onRunWithoutPlan : undefined} />;
  }

  // ---- Countdown -------------------------------------------------------------
  // Feet on the ground behind the numbers, under an ink veil so the count stays cream.
  if (phase === 'countdown') {
    return (
      <AmbientBackground style={countFootage}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(43,39,51,0.55)' }]} />
        <View style={[styles.center, { flex: 1, padding: spacing.md }]}>
          <Text style={styles.countdown}>{count}</Text>
          <Button title={ui().run.cancel} variant="onInk" onPress={cancelCountdown} style={{ marginTop: spacing.xl, width: 160 }} />
        </View>
      </AmbientBackground>
    );
  }

  // ---- Finish ----------------------------------------------------------------
  if (phase === 'finish' && final) {
    const typedM = final.indoor ? typedTreadmillM(treadmillText, km) : null;
    const shownM = typedM ?? final.distanceM;
    const partialKm = final.currentKm.distanceM > 20 ? { index: final.splits.length + 1, ...final.currentKm } : null;
    // A treadmill run has no route to frame: the words and numbers close up.
    const mapH = final.indoor ? finishPad.top + finishCardH + spacing.lg : Math.max(Math.round(Dimensions.get('window').height * 0.62), finishPad.top + finishCardH + 160);
    const askFeel = hasPlan && (!!guided || (!!session && sessionOpen && session.kind !== 'rest'));
    const you = live ? youVsYou(compare({ ...live.run, moodBefore, moodAfter }, live.history), km, settings.fewerWords) : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* The run, framed: your route fills the space between the words and the numbers. */}
        <View style={{ height: mapH, backgroundColor: colors.mintSoft }}>
          {final.indoor ? null : (
            <RouteMap
              path={final.path}
              here={final.here}
              fill
              interactive={false}
              fitPadding={{ top: finishPad.top + 24, right: 36, bottom: finishPad.bottom + 24, left: 36 }}
              pins={storyPins(stories)}
            />
          )}
          <View style={styles.finishTop} pointerEvents="box-none" onLayout={(e) => setFinishPad((p) => ({ ...p, top: e.nativeEvent.layout.y + e.nativeEvent.layout.height }))}>
            <View style={styles.finishTopRow} pointerEvents="box-none">
              <Text style={[type.eyebrow, { color: colors.mintDeep, flex: 1 }]} accessibilityRole="header">{ui().run.runDone}</Text>
              <Pressable onPress={() => void onResumeRun()} accessibilityRole="button" accessibilityLabel={ui().run.resumeRun} accessibilityHint={ui().run.notFinishedGoesBackTo} hitSlop={8} style={({ pressed }) => [styles.resumePill, pressed && { opacity: 0.85 }]}>
                <Text style={styles.resumeText}>{ui().run.resumeRun2}</Text>
              </Pressable>
            </View>
            <Text style={styles.finishTitle} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{settings.fewerWords ? ui().run.plainFinish(voice().distance(shownM, km), voice().minutes(final.durationS)) : surprise?.line ?? finishLine()}</Text>
          </View>
          <View
            style={styles.finishCard}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setFinishPad((p) => ({ ...p, bottom: mapH - y }));
              setFinishCardH(height);
            }}
          >
            <View style={styles.statRow} accessible accessibilityLabel={ui().run.xInXAverageX(spokenDistance(shownM, km), spokenDuration(final.durationS), spokenPace(shownM, final.durationS, km), formatElevation(final.elevationGainM, km))}>
              <Stat value={formatDistanceNumber(shownM, km)} label={distanceUnit(km)} big />
              <Stat value={formatDuration(final.durationS)} label={ui().run.time} />
              <Stat value={formatPace(shownM, final.durationS, km)} label={`/${distanceUnit(km)}`} />
              <Stat value={formatElevation(final.elevationGainM, km)} label={ui().run.climb} />
            </View>
            <Recharge before={moodBefore} after={moodAfter} />
          </View>
        </View>
        <View style={{ padding: spacing.md, paddingTop: spacing.lg, gap: spacing.lg }}>
          {final.indoor ? (
            <View style={styles.treadmillCard}>
              <Text style={styles.treadmillTitle}>{ui().runAids.finishAsk}</Text>
              <Text style={styles.treadmillHint}>{final.indoorSteps > 0 ? ui().runAids.finishHint(formatDistance(final.distanceM, km)) : ui().runAids.finishHintNoSteps}</Text>
              <TextInput
                style={styles.treadmillInput}
                value={treadmillText}
                onChangeText={setTreadmillText}
                keyboardType="decimal-pad"
                placeholder={formatDistanceNumber(final.distanceM, km)}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel={ui().runAids.finishLabel(distanceUnit(km))}
                maxLength={6}
              />
            </View>
          ) : null}
          {you && <YouLine title={you.title} detail={you.detail} />}
          {/* Calm order: keep it and go first. On a plan the pain question sits
              just above, so it is seen before leaving. Everything else is optional
              and comes after: one folded reflection, the details, then the extras. */}
          {hasPlan && <PainPicker value={pain} onChange={setPain} />}
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title={ui().run.discard} variant="danger" onPress={onDiscard} disabled={saving} style={{ flex: 0, paddingHorizontal: 22 }} />
              <Button title={saving ? ui().run.saving : ui().run.keepIt} onPress={() => onSave()} disabled={saving} style={{ flex: 1 }} />
            </View>
            <Button title={ui().run.keepItAndShareWith} variant="secondary" onPress={() => onSave(true)} disabled={saving} />
          </View>
          <HowWasIt plan={askFeel} answered={[askFeel && feel != null, moodAfter != null, quiet != null, note.trim().length > 0].filter(Boolean).length}>
            {askFeel && <FeelPicker value={feel} onChange={setFeel} />}
            <MoodPicker title={ui().run.andYourEnergyNow} value={moodAfter} onChange={setMoodAfter} />
            <QuietPicker value={quiet} onChange={setQuiet} />
            <TextInput style={styles.note} placeholder={ui().run.aNoteIfYouWant} placeholderTextColor={colors.inkMuted} value={note} onChangeText={setNote} multiline />
          </HowWasIt>
          <RunStatsView
            run={{ startedAt: final.startedAt ?? Date.now(), endedAt: finishPoints.length ? finishPoints[finishPoints.length - 1].ts : null, distanceM: final.distanceM, durationS: final.durationS, elevationGainM: final.elevationGainM, quiet, moodBefore, moodAfter }}
            points={finishPoints}
            splits={final.splits}
            laps={final.laps}
            partial={partialKm}
            km={km}
            hero={false}
            heart={finishHeart}
          />
          <StoriesCard stories={stories} moodBefore={moodBefore} />
          <UnlockNudge moodBefore={moodBefore} moodAfter={moodAfter} pain={pain} feel={feel} />
          <PlaceFinishCard found={found} draft={placeDraft} onOffer={() => setPlaceSheet(true)} onNotNow={placeNotNow} />
        </View>
        <SavePlaceSheet
          open={placeSheet}
          sig={found?.sig ?? null}
          initial={placeDraft ?? { name: suggestName(final.startedAt ?? Date.now()), tags: [] }}
          busy={quiet}
          onBusy={setQuiet}
          onSave={(d) => {
            setPlaceDraft(d);
            setPlaceSheet(false);
          }}
          onClose={() => setPlaceSheet(false)}
        />
      </ScrollView>
    );
  }

  // ---- Active ----------------------------------------------------------------
  // The map is always there, edge to edge, under a dusk veil. The numbers sit
  // on top. Tap "Map" and the veil lifts, the numbers shrink to one strip and
  // the map takes your fingers.
  const paused = track.status === 'paused';
  const autoPaused = track.status === 'autopaused';
  const halted = paused || autoPaused;
  const H = Dimensions.get('window').height;
  const statusLine = `${autoPaused ? ui().run.autoPaused : paused ? ui().run.paused : ui().run.recording}${track.gps === 'lost' ? ui().run.gpsLost : ''}`;
  const lightControls = (
    <View style={styles.controls}>
      <Pressable onPress={onPauseResume} accessibilityRole="button" accessibilityLabel={halted ? ui().run.resume : ui().run.pause} style={({ pressed }) => [styles.roundBtn, styles.roundLight, pressed && { opacity: 0.85 }]}>
        <Text style={[styles.roundGlyph, { color: colors.ink }]}>{halted ? '▶' : '❚❚'}</Text>
      </Pressable>
      <StopButton wide onStop={() => void onStop()} />
    </View>
  );
  // The whole Listen page, one tap away mid-run. The run keeps recording underneath.
  const listenLink = onBrowseListen ? (
    <Pressable onPress={onBrowseListen} accessibilityRole="button" accessibilityLabel={ui().listen.listen} accessibilityHint={ui().run.listenHint} hitSlop={8} style={styles.listenLink}>
      <NoteGlyph color={colors.inkMuted} />
      <Text style={styles.calmTap}>{ui().listen.listen}</Text>
    </Pressable>
  ) : null;

  // Clear my head: nothing to read. The run records, the numbers wait for the finish.
  if (shown === 'clear') {
    return (
      <View style={styles.calm}>
        <View style={styles.calmTop}>
          <Text style={type.eyebrow}>{ui().run.clearMyHead}</Text>
          <View style={styles.calmStatus} accessible accessibilityLabel={statusLine}>
            <View style={[styles.dot, { backgroundColor: halted ? colors.butterDeep : colors.mintDeep }]} />
            <Text style={styles.calmStatusText}>{statusLine}</Text>
          </View>
        </View>
        <View style={styles.calmMiddle}>
          <CalmGlyph />
          <Text style={styles.calmLine} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{ui().run.nothingToLookAtJust}</Text>
          <Pressable
            onPress={() => setShowTime((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showTime ? ui().run.xSoFarHideThe(spokenDuration(track.durationS)) : ui().run.showTheTime}
            style={styles.calmTime}
          >
            {showTime ? (
              <Text style={styles.calmClock} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
                {formatDuration(track.durationS)}
              </Text>
            ) : null}
            <Text style={styles.calmTap}>{showTime ? ui().run.soFarTapToHide : ui().run.tapToShowTheTime}</Text>
          </Pressable>
        </View>
        <Text style={styles.calmNote}>{halted ? (autoPaused ? ui().run.autoPausedItCarriesOn : ui().run.pausedNothingIsRecording) : ui().run.noVoiceNoBuzzYour}</Text>
        {listenLink}
        {lightControls}
      </View>
    );
  }

  // Follow my plan: the block you're in, big, and what comes next. Numbers second.
  if (shown === 'plan' && guided) {
    const v = guided.view;
    const step = v.step;
    const tint = blockTint(v.finished ? null : step);
    const blocks = createWorkout(guided.session.steps).steps;
    const spoken = v.finished ? ui().run.thatIsTheSession : step ? ui().run.blockXOfXX(v.index + 1, v.total, stepName(step), formatLeft(v), v.next ? ui().run.thenSpoken(stepLine(v.next)) : ui().run.lastBlockSpoken) : '';
    return (
      <View style={[styles.calm, { gap: spacing.md + 2 }]}>
        <View style={styles.calmTop}>
          <Text style={[type.eyebrow, { flex: 1 }]} numberOfLines={1}>
            {guided.session.title}
          </Text>
          <View style={styles.calmStatus} accessible accessibilityLabel={statusLine}>
            <View style={[styles.dot, { backgroundColor: halted ? colors.butterDeep : colors.mintDeep }]} />
            <Text style={styles.calmStatusText}>{statusLine}</Text>
          </View>
        </View>
        <View style={[styles.block, { backgroundColor: tint.bg }]} accessible accessibilityLabel={spoken} accessibilityLiveRegion="polite">
          <Text style={[styles.blockEyebrow, { color: tint.fg }]}>{v.finished ? ui().run.allBlocksDone : ui().run.blockXOfX(v.index + 1, v.total)}</Text>
          <Text style={[styles.blockName, { color: tint.fg }]} maxFontSizeMultiplier={DISPLAY_MAX_SCALE} numberOfLines={2} adjustsFontSizeToFit>
            {v.finished ? ui().run.thatIsTheSession : step ? stepName(step) : ''}
          </Text>
          {!v.finished ? (
            <>
              <Text style={styles.blockLeft} maxFontSizeMultiplier={DISPLAY_MAX_SCALE} numberOfLines={1} adjustsFontSizeToFit>
                {leftClock(v)}
              </Text>
              <Text style={[styles.blockFeel, { color: tint.fg }]}>{ui().run.leftInThisBlock}{step && stepFeel(step) ? ` ${stepFeel(step)}` : ''}</Text>
            </>
          ) : (
            <Text style={[styles.blockFeel, { color: tint.fg }]}>{ui().run.easyToTheDoorHold}</Text>
          )}
        </View>
        <View style={styles.segments} importantForAccessibility="no-hide-descendants">
          {blocks.map((b, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                { flex: Math.max(0.4, (b.durationS ?? (b.distanceM ?? 0) * 0.35) / 300) },
                { backgroundColor: i < v.index ? colors.mintDeep : i === v.index ? colors.mint : colors.empty },
              ]}
            />
          ))}
        </View>
        {!v.finished ? (
          <Text style={styles.blockNext} importantForAccessibility="no">
            {v.next ? (
              <>
                {ui().run.thenBefore}<Text style={{ fontFamily: fonts.bodySemi }}>{stepLine(v.next)}</Text>{ui().run.thenAfter}{settings.cueMode === 'voice' ? ui().run.aVoiceTellsYouWhen : ''}
              </>
            ) : (
              ui().run.lastBlock
            )}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={styles.planNums} accessible accessibilityLabel={spokenRun(track, km)}>
          <PlanNum value={formatDistanceNumber(track.distanceM, km)} label={distanceUnit(km)} />
          <PlanNum value={formatDuration(track.durationS)} label={ui().run.total} />
          <PlanNum value={formatPace(track.distanceM, track.durationS, km)} label={ui().run.paceX(distanceUnit(km))} />
        </View>
        {listenLink}
        {lightControls}
      </View>
    );
  }

  return (
    <View style={styles.live}>
      {track.indoor ? <View style={[StyleSheet.absoluteFill, { backgroundColor: night.ink }]} /> : <RouteMap
        path={track.path}
        here={track.here}
        follow
        hold={mapFront && mapHeld}
        onUserMove={mapFront ? () => setMapHeld(true) : undefined}
        fill
        ghost={ghostRun?.path}
        goal={ghostRun?.goal}
        interactive={mapFront}
        fps={mapFront ? undefined : 20}
        focusPadding={mapFront ? { top: 120, right: 0, bottom: 140, left: 0 } : { top: H * 0.5, right: 0, bottom: 150, left: 0 }}
      />}
      <Animated.View pointerEvents="none" style={[styles.veil, { opacity: veil }]} />

      <View style={styles.liveLayer} pointerEvents="box-none">
        <View style={styles.liveTop}>
          <View style={styles.statusPill}>
            <View style={[styles.dot, { backgroundColor: halted ? night.butter : night.mint }]} />
            <Text style={[styles.statusText, { color: halted ? night.butter : night.mint }]}>{autoPaused ? ui().run.autoPaused : paused ? ui().run.paused : ui().run.recording}</Text>
          </View>
          {/* The route being followed, by name (Run this again, Run to work). */}
          {ghostRun ? (
            <View style={[styles.statusPill, { flexShrink: 1 }]}>
              <Text style={[styles.statusText, { color: night.onInkMuted }]} numberOfLines={1}>{ghostRun.name}</Text>
            </View>
          ) : null}
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { color: night.onInkMuted }]}>{track.indoor ? ui().runAids.treadmillPill : gpsLabel(track.gps)}</Text>
          </View>
        </View>

        {mapFront ? (
          <View style={styles.strip}>
            <StripStat value={formatDistanceNumber(track.distanceM, km)} label={distanceUnit(km)} />
            <StripStat value={formatDuration(track.durationS)} label={ui().run.time} />
            <StripStat value={formatPace(track.distanceM, track.durationS, km)} label={ui().run.avgX(distanceUnit(km))} />
          </View>
        ) : (
          <LiveNumbers km={km} t={track} guided={guided} />
        )}

        <View style={{ flex: 1 }} pointerEvents="none" />

        {settings.musicStrip && <MusicStrip appKey={settings.musicApp} />}

        <View style={styles.toggleRow}>
          {mapFront && mapHeld ? (
            <Pressable onPress={() => setMapHeld(false)} accessibilityRole="button" style={({ pressed }) => [styles.mapToggle, pressed && { opacity: 0.85 }]}>
              <Text style={styles.mapToggleText}>{ui().run.followMe}</Text>
            </Pressable>
          ) : null}
          {onBrowseListen ? (
            <Pressable onPress={onBrowseListen} accessibilityRole="button" accessibilityLabel={ui().listen.listen} accessibilityHint={ui().run.listenHint} style={({ pressed }) => [styles.mapToggle, styles.listenPill, pressed && { opacity: 0.85 }]}>
              <NoteGlyph color={night.ink} />
              <Text style={styles.mapToggleText}>{ui().listen.listen}</Text>
            </Pressable>
          ) : null}
          {track.indoor ? null : (
            <Pressable onPress={toggleMap} accessibilityRole="button" accessibilityLabel={mapFront ? ui().run.showNumbers : ui().run.showMap} style={({ pressed }) => [styles.mapToggle, pressed && { opacity: 0.85 }]}>
              <Text style={styles.mapToggleText}>{mapFront ? ui().run.numbers : ui().run.map}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.controls}>
          <Pressable onPress={onPauseResume} accessibilityRole="button" accessibilityLabel={halted ? ui().run.resume : ui().run.pause} style={styles.roundBtn}>
            <Text style={styles.roundGlyph}>{halted ? '▶' : '❚❚'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              void lap();
            }}
            disabled={halted}
            accessibilityRole="button"
            accessibilityLabel={track.laps.length ? `${ui().run.lap}, ${ui().run.lapsDone(track.laps.length)}` : ui().run.lap}
            style={({ pressed }) => [styles.lapBtn, pressed && { opacity: 0.85 }, halted && { opacity: 0.4 }]}
          >
            <Text style={styles.lapText}>{ui().run.lap}</Text>
            {/* The count is the confirmation: it ticks up the moment a lap is marked. */}
            {track.laps.length > 0 && <Text style={styles.lapCount}>{ui().run.lapsDone(track.laps.length)}</Text>}
          </Pressable>
          <StopButton onStop={() => void onStop()} />
        </View>
      </View>
    </View>
  );
}

/**
 * Stop is held, not tapped: the button fills for a second and the run ends. A
 * short tap only says "Hold to stop". With TalkBack or VoiceOver on, holding is
 * awkward, so a double tap asks first instead.
 */
function StopButton({ onStop, wide }: { onStop: () => void; wide?: boolean }) {
  const fill = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState(false);
  const [reader, setReader] = useState(false);
  const held = useRef(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setReader).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setReader);
    return () => {
      sub.remove();
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  function pressIn() {
    if (reader) return;
    held.current = false;
    setHint(false);
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(fill, { toValue: 1, duration: HOLD_TO_STOP_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      held.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      fill.setValue(0);
      onStop();
    });
  }

  function pressOut() {
    if (reader || held.current) return;
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 2200);
  }

  function press() {
    if (!reader) return;
    Alert.alert(ui().run.stopTheRun, undefined, [
      { text: ui().run.keepRunning, style: 'cancel' },
      { text: ui().run.stop, onPress: onStop },
    ]);
  }

  return (
    <View style={wide ? { flex: 1 } : { alignItems: 'center' }}>
      {hint && (
        <View style={styles.holdHint} pointerEvents="none">
          <Text style={styles.holdHintText}>{ui().run.holdToStop}</Text>
        </View>
      )}
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={ui().run.stopRun}
        accessibilityHint={reader ? ui().run.asksBeforeEndingTheRun : ui().run.holdForASecondTo}
        style={[wide ? styles.stopWide : styles.roundBtn, { backgroundColor: wide ? colors.peach : night.peach, overflow: 'hidden' }]}
      >
        {wide ? (
          <>
            {/* The pill fills from the left as you hold. */}
            <Animated.View pointerEvents="none" style={[styles.stopFillWide, { transform: [{ scaleX: fill }] }]} />
            <Text style={styles.stopWideText}>{ui().run.holdToStop}</Text>
          </>
        ) : (
          <>
            <Animated.View pointerEvents="none" style={[styles.stopFill, { transform: [{ scale: fill }] }]} />
            <View style={styles.stopSquare} />
          </>
        )}
      </Pressable>
      {/* Said all the time, so nobody has to find out by tapping. */}
      {!wide && (
        <Text style={styles.stopCaption} importantForAccessibility="no" accessibilityElementsHidden>
          {ui().run.holdToStop}
        </Text>
      )}
    </View>
  );
}

/** The block card's colour: the pastel that owns that kind of effort. */
function blockTint(step: Step | null): { bg: string; fg: string } {
  if (!step) return { bg: colors.mint, fg: colors.mintDeep };
  if (step.kind === 'hard') return { bg: colors.peach, fg: colors.peachDeep };
  if (step.kind === 'walk') return { bg: colors.lilac, fg: colors.lilacDeep };
  if (step.kind === 'stride') return { bg: colors.butter, fg: colors.butterDeep };
  return { bg: colors.mint, fg: colors.mintDeep };
}

function PlanNum({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.planNumValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.planNumLabel}>{label}</Text>
    </View>
  );
}

/** Clear my head: two quiet rings and a line drawn once round. Nothing moves. */
function CalmGlyph() {
  return (
    <Svg width={168} height={168} viewBox="0 0 180 180" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={90} cy={90} r={80} fill={colors.lilacSoft} />
      <Circle cx={90} cy={90} r={56} fill={colors.lilac} />
      <Path d="M90 46 a44 44 0 1 1 -38 22" fill="none" stroke={colors.lilacDeep} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

function LiveNumbers({ km, t, guided }: { km: boolean; t: TrackingState; guided: GuidedRun | null }) {
  const cur = t.currentKm;
  // One sentence for a screen reader instead of seven loose numbers.
  const now = t.speedMps >= 0.5 ? spokenPace(1000, 1000 / t.speedMps, km) : ui().run.noPace;
  const step = guided && !guided.view.finished && guided.view.step ? `${stepLine(guided.view.step)}, ${formatLeft(guided.view)}. ` : '';
  const spoken = ui().run.xXRightNowX(step, spokenRun(t, km), now, formatElevation(t.elevationGainM, km));
  return (
    <View style={{ gap: spacing.md }} pointerEvents="none" accessible accessibilityLabel={spoken}>
      {guided && <GuidedStrip g={guided} />}
      <View style={styles.hero}>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{formatDistanceNumber(t.distanceM, km)}</Text>
        <Text style={styles.heroUnit}>{ui().run.unitWord(km)}</Text>
      </View>
      <View style={styles.numRow}>
        <LiveStat value={formatDuration(t.durationS)} label={ui().run.time} color={night.mint} />
        <LiveStat value={formatPace(t.distanceM, t.durationS, km)} label={ui().run.avgX(distanceUnit(km))} color={night.peach} />
        <LiveStat value={formatSpeedAsPace(t.speedMps, km)} label={ui().run.rightNow} color={night.lilac} />
      </View>
      <Text style={styles.splitLine} numberOfLines={1} adjustsFontSizeToFit>
        {ui().run.splitLine(km, t.splits.length + 1, formatPace(cur.distanceM, cur.durationS, km), formatElevation(t.elevationGainM, km))}
      </Text>
    </View>
  );
}

/** The guided session, one line: which step, how it should feel, what is left. */
function GuidedStrip({ g }: { g: GuidedRun }) {
  const v = g.view;
  const step = v.step;
  const fill = v.finished ? night.mint : step?.kind === 'hard' ? night.peach : step?.kind === 'walk' ? night.lilac : step?.kind === 'stride' ? night.butter : night.mint;
  return (
    <View style={styles.guided}>
      <View style={styles.guidedTop}>
        <View style={[styles.statDot, { backgroundColor: fill }]} />
        <Text style={styles.guidedLabel} numberOfLines={1}>
          {v.finished ? ui().run.xDone(g.session.title) : ui().run.stepXOfXX(v.index + 1, v.total, g.session.title)}
        </Text>
      </View>
      <Text style={styles.guidedStep} numberOfLines={2}>
        {v.finished ? ui().run.thatIsTheSessionEasy : step ? `${stepLine(step)}${g.range ? ` · ${ui().zones.rangeX(g.range[0], g.range[1])}` : ''}` : ''}
      </Text>
      {!v.finished && (
        <View style={styles.guidedBar}>
          <View style={[styles.guidedFill, { backgroundColor: fill, width: `${Math.round(v.fraction * 100)}%` as `${number}%` }]} />
        </View>
      )}
      <Text style={styles.guidedNext} numberOfLines={1}>
        {v.finished ? '' : `${formatLeft(v)}${v.next ? ui().run.thenX(stepLine(v.next)) : ui().run.lastStep}`}
      </Text>
    </View>
  );
}

function LiveStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.liveStat}>
      <Text style={styles.liveStatValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[styles.statDot, { backgroundColor: color }]} />
        <Text style={styles.liveStatLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      </View>
    </View>
  );
}

function StripStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.stripValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.stripLabel}>{label}</Text>
    </View>
  );
}

/** The treadmill's number as typed (in the runner's unit), in metres; null when empty or not a distance. Same reading as Correct distance. */
function typedTreadmillM(text: string, km: boolean): number | null {
  return text.trim() ? parseDistance(text, km) : null;
}

function gpsLabel(q: TrackingState['gps']): string {
  if (q === 'searching') return ui().run.findingYou;
  if (q === 'lost') return ui().run.gpsLost2;
  return ui().run.gps[q] ?? `GPS ${q}`;
}

function Tile({ bg, fg, value, label, small }: { bg: string; fg: string; value: string; label: string; small?: boolean }) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }, small && { padding: 12 }]}>
      <Text style={[styles.tileValue, small && { fontSize: 24, lineHeight: 28 }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Stat({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <View>
      <Text style={[styles.statValue, big && styles.statValueBig]} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Energy before → after, the run's recharge. Fills in as you pick below. */
function Recharge({ before, after }: { before: Mood | null; after: Mood | null }) {
  if (before == null && after == null) {
    return <Text style={styles.rechargeText}>{ui().run.howSYourEnergyNow}</Text>;
  }
  const d = before != null && after != null ? after - before : null;
  const verdict =
    d == null ? (after == null ? ui().run.andNowPickItBelow : '') : d > 0 ? ui().run.rechargedX(d) : d === 0 ? ui().run.heldSteady : ui().run.spentThatCountsToo;
  return (
    <View style={styles.recharge}>
      <View style={styles.rechargeFaces}>
        {before != null && <Face level={before} size={28} />}
        {before != null && after != null && <Text style={styles.rechargeArrow}>→</Text>}
        {after != null && <Face level={after} size={28} />}
      </View>
      {!!verdict && <Text style={[styles.rechargeText, d != null && d > 0 && { color: colors.mintDeep, fontFamily: fonts.bodySemi }]}>{verdict}</Text>}
    </View>
  );
}

function finishLine(): string {
  const lines = [ui().run.nobodySawThatWhichWas, ui().run.thatSOneQuietlyLogged, ui().run.doneGoBeUnavailable, ui().run.legsDidTheTalking];
  return lines[Math.floor(Date.now() / 60000) % lines.length];
}

/** The rare line, from this run, the runs before it, the last weather reading and what's been said already. */
async function pickSurprise(f: TrackingState, history: Run[], metric: boolean): Promise<Surprise | null> {
  try {
    const [seen, w] = await Promise.all([loadValue<string[]>(SEEN_KEY), cachedWeather()]);
    return finishSurprise({ startedAt: f.startedAt ?? Date.now(), distanceM: f.distanceM, durationS: f.durationS }, history, w?.sky ?? null, seen ?? [], metric);
  } catch {
    return null;
  }
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
  screenInk: { flex: 1, backgroundColor: night.ink, padding: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.sm + 2 },
  tile: { flex: 1, borderRadius: radius.lg, padding: 16 },
  tileValue: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: fonts.bodySemi, fontSize: 12, marginTop: 2 },
  countdown: { fontFamily: fonts.displayLight, fontSize: 140, color: night.cream, fontVariant: ['tabular-nums'] },
  finishTop: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md, paddingTop: spacing.lg, paddingBottom: 14, gap: 10, backgroundColor: colors.wash },
  finishCard: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, padding: spacing.md, gap: 12, borderRadius: radius.lg, backgroundColor: colors.wash },
  recharge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rechargeFaces: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lilacSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  rechargeArrow: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep },
  rechargeText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted },
  finishTitle: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8, color: colors.text },
  statRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  statValue: { fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  statValueBig: { fontSize: 52, lineHeight: 54, letterSpacing: -2.5 },
  statLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  live: { flex: 1, backgroundColor: night.ink },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(43,39,51,0.66)' },
  liveLayer: { flex: 1, padding: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(43,39,51,0.72)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hero: { alignItems: 'center', paddingTop: spacing.lg },
  heroValue: { fontFamily: fonts.displayLight, fontSize: 112, lineHeight: 116, letterSpacing: -4, color: night.cream, fontVariant: ['tabular-nums'] },
  heroUnit: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: night.onInkMuted },
  numRow: { flexDirection: 'row', gap: spacing.sm },
  liveStat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.lg, backgroundColor: 'rgba(246,241,234,0.08)' },
  liveStatValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: night.cream, fontVariant: ['tabular-nums'] },
  liveStatLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: night.onInkMuted },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  guided: { backgroundColor: 'rgba(246,241,234,0.1)', borderRadius: radius.lg, padding: 12, gap: 6 },
  guidedTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guidedLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: night.onInkMuted },
  guidedStep: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: night.cream },
  guidedBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(246,241,234,0.15)', overflow: 'hidden' },
  guidedFill: { height: 4, borderRadius: 2 },
  guidedNext: { fontFamily: fonts.body, fontSize: 13, color: night.onInkMuted, fontVariant: ['tabular-nums'] },
  splitLine: { textAlign: 'center', fontFamily: fonts.body, fontSize: 14, color: night.onInkMuted, fontVariant: ['tabular-nums'] },
  strip: { flexDirection: 'row', backgroundColor: 'rgba(43,39,51,0.82)', borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: spacing.sm },
  stripValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: night.cream, fontVariant: ['tabular-nums'] },
  stripLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: night.onInkMuted },
  mapToggle: { backgroundColor: 'rgba(246,241,234,0.92)', borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 10 },
  toggleRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  listenPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18 },
  listenLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  mapToggleText: { fontFamily: fonts.bodySemi, fontSize: 15, color: night.ink },
  controls: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center', paddingBottom: spacing.sm },
  roundBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: night.ink, alignItems: 'center', justifyContent: 'center' },
  roundGlyph: { color: night.cream, fontSize: 18, fontFamily: fonts.bodyBold },
  lapBtn: { flex: 1, height: 64, borderRadius: radius.pill, backgroundColor: 'rgba(232,226,245,0.94)', alignItems: 'center', justifyContent: 'center' },
  lapText: { fontFamily: fonts.bodySemi, fontSize: 17, color: night.lilacDeep },
  lapCount: { fontFamily: fonts.bodySemi, fontSize: 12, color: night.lilacDeep },
  stopSquare: { width: 20, height: 20, borderRadius: 5, backgroundColor: night.ink },
  stopFill: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: night.peachDeep, opacity: 0.45 },
  holdHint: { position: 'absolute', bottom: 74, right: -6, backgroundColor: 'rgba(246,241,234,0.94)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minWidth: 110, alignItems: 'center' },
  holdHintText: { fontFamily: fonts.bodySemi, fontSize: 13, color: night.ink },
  stopCaption: { marginTop: 4, fontFamily: fonts.bodySemi, fontSize: 12, color: night.onInkMuted },
  calm: { flex: 1, backgroundColor: colors.cream, padding: spacing.md + 4, paddingTop: spacing.lg },
  calmTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  calmStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calmStatusText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  calmMiddle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  calmLine: { fontFamily: fonts.displayItalic, fontSize: 26, lineHeight: 32, textAlign: 'center', color: colors.text },
  calmTime: { minHeight: 48, minWidth: 200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  calmClock: { fontFamily: fonts.displayLight, fontSize: 44, lineHeight: 50, color: colors.text, fontVariant: ['tabular-nums'] },
  calmTap: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, textDecorationLine: 'underline' },
  calmNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkMuted, textAlign: 'center', marginBottom: 14 },
  roundLight: { backgroundColor: colors.white },
  stopWide: { flex: 1, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stopFillWide: { ...StyleSheet.absoluteFill, backgroundColor: colors.peachDeep, opacity: 0.3, transformOrigin: 'left' },
  stopWideText: { fontFamily: fonts.bodySemi, fontSize: 17, color: colors.peachDeep },
  block: { borderRadius: 28, padding: 22, gap: 6 },
  blockEyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' },
  blockName: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46 },
  blockLeft: { fontFamily: fonts.display, fontSize: 64, lineHeight: 68, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  blockFeel: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { height: 10, borderRadius: radius.pill },
  blockNext: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  planNums: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  planNumValue: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  planNumLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  finishTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resumePill: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  resumeText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.cream },
  treadmillCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  treadmillTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  treadmillHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  treadmillInput: { borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingVertical: 8, color: colors.text, fontFamily: fonts.bodySemi, fontSize: 22 },
  note: { minHeight: 56, borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingVertical: 10, color: colors.text, fontFamily: fonts.displayItalic, fontSize: 17, textAlignVertical: 'top' },
}));

function NoteGlyph({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 16 16">
      <Path d="M6 12 V3.4 L13 2 V10.8" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={4.2} cy={12} r={1.9} stroke={color} strokeWidth={1.6} fill="none" />
      <Circle cx={11.2} cy={10.8} r={1.9} stroke={color} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}
