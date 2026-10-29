import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Face } from '../components/Mark';
import { MoodPicker } from '../components/MoodPicker';
import { MusicStrip } from '../components/MusicStrip';
import { QuietPicker } from '../components/QuietPicker';
import { RouteMap } from '../components/RouteMap';
import { SplitsTable } from '../components/SplitsTable';
import { YouLine } from '../components/YouLine';
import { cueCountdown } from '../cues';
import { deleteRun, listRuns, loadValue, saveValue } from '../db';
import { HomeScreen } from './HomeScreen';
import { countdownFootage, type Footage } from '../footage';
import { distanceUnit, formatDistance, formatDistanceNumber, formatDuration, formatElevation, formatPace, formatSpeedAsPace } from '../geo';
import { compare, youVsYou, type RunFacts } from '../progress';
import { useSettings } from '../settings';
import { finishSurprise, type Surprise } from '../surprises';
import { ensurePermissions, getState, lap, pauseRun, resumeRun, startRun, stopRun, subscribe, TrackingState, unsavedPoints } from '../tracking';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Mood, Quiet, Run } from '../types';
import { cachedWeather } from '../weather';
import { liveFacts, recordRunFacts } from '../you';

type Phase = 'idle' | 'countdown' | 'active' | 'finish';

/** Ids of the once-only finish lines already used (src/surprises.ts). */
const SEEN_KEY = 'surprises.seen';

export function RunScreen({ onSaved }: { onSaved: (runId: number, share?: boolean) => void }) {
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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [mapFront, setMapFront] = useState(false);
  const [countFootage, setCountFootage] = useState<Footage>('cobbles');
  // The finish line for this run, when it has earned one; otherwise finishLine().
  const [surprise, setSurprise] = useState<Surprise | null>(null);
  const veil = useRef(new Animated.Value(1)).current;
  // Heights of the words and the numbers laid over the finish map, so the route is framed between them.
  const [finishPad, setFinishPad] = useState({ top: 140, bottom: 170 });

  // The screen is the second-biggest drain after GPS. Off by default: the lock
  // screen (and the watch) carry the live numbers instead.
  const keepAwake = phase === 'active' && settings.keepScreenOn;
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('run').catch(() => {});
    return () => {
      deactivateKeepAwake('run').catch(() => {});
    };
  }, [keepAwake]);
  useEffect(() => subscribe(setTrack), []);
  useEffect(() => {
    if (phase === 'idle') listRuns().then(setRuns);
  }, [phase]);
  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  async function onStart() {
    const perm = await ensurePermissions();
    if (!perm.ok) {
      Alert.alert('Location needed', 'Runtrovert can only record a run with location access. Nothing leaves your phone.');
      return;
    }
    if (!perm.background) {
      Alert.alert('Background location', 'Without "Always" location the run may stop recording when the screen is off. You can change this in Settings later.');
    }
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
          await startRun(moodBefore);
          setPhase('active');
        } else {
          cueCountdown(n);
        }
      }, 1000);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await startRun(moodBefore);
      setPhase('active');
    }
  }

  function cancelCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setPhase('idle');
  }

  function toggleMap() {
    Haptics.selectionAsync();
    const next = !mapFront;
    setMapFront(next);
    Animated.timing(veil, { toValue: next ? 0 : 1, duration: 260, useNativeDriver: true }).start();
  }

  function onPauseResume() {
    Haptics.selectionAsync();
    if (track.status === 'paused') resumeRun();
    else pauseRun();
  }

  async function onStop() {
    const s = getState();
    if (s.status !== 'paused') pauseRun();
    const f = getState();
    setFinal(f);
    setPhase('finish');
    if (f.runId != null) {
      liveFacts({ runId: f.runId, startedAt: f.startedAt ?? Date.now(), distanceM: f.distanceM, durationS: f.durationS, elevationGainM: f.elevationGainM, unsaved: unsavedPoints() })
        .then(setLive)
        .catch(() => {});
    }
    setSurprise(await pickSurprise(f, runs, km));
  }

  async function onSave(share = false) {
    const startedAt = final?.startedAt ?? Date.now();
    const durationS = final?.durationS ?? 0;
    const id = await stopRun({ moodAfter, quiet, note: note.trim() || null });
    if (id != null) await recordRunFacts(id, startedAt, durationS).catch(() => {});
    if (id != null && surprise?.once) {
      const seen = (await loadValue<string[]>(SEEN_KEY).catch(() => null)) ?? [];
      saveValue(SEEN_KEY, [...seen, surprise.id]).catch(() => {});
    }
    reset();
    if (id != null) onSaved(id, share);
  }

  function onDiscard() {
    Alert.alert('Discard run?', 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          const id = await stopRun({ moodAfter: null, quiet: null, note: null });
          if (id != null) await deleteRun(id);
          reset();
        },
      },
    ]);
  }

  function reset() {
    setPhase('idle');
    setMoodBefore(null);
    setMoodAfter(null);
    setQuiet(null);
    setNote('');
    setFinal(null);
    setLive(null);
    setSurprise(null);
    setMapFront(false);
    veil.setValue(1);
  }

  // ---- Idle ------------------------------------------------------------------
  if (phase === 'idle') {
    return <HomeScreen runs={runs} mood={moodBefore} onMood={setMoodBefore} onStart={onStart} />;
  }

  // ---- Countdown -------------------------------------------------------------
  // Feet on the ground behind the numbers, under an ink veil so the count stays cream.
  if (phase === 'countdown') {
    return (
      <AmbientBackground style={countFootage} still={settings.batteryMode === 'saver'}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(43,39,51,0.55)' }]} />
        <View style={[styles.center, { flex: 1, padding: spacing.md }]}>
          <Text style={styles.countdown}>{count}</Text>
          <Button title="Cancel" variant="onInk" onPress={cancelCountdown} style={{ marginTop: spacing.xl, width: 160 }} />
        </View>
      </AmbientBackground>
    );
  }

  // ---- Finish ----------------------------------------------------------------
  if (phase === 'finish' && final) {
    const partialKm = final.currentKm.distanceM > 20 ? { index: final.splits.length + 1, ...final.currentKm } : null;
    const mapH = Math.round(Dimensions.get('window').height * 0.62);
    const you = live ? youVsYou(compare({ ...live.run, moodBefore, moodAfter }, live.history), km) : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* The run, framed: your route fills the space between the words and the numbers. */}
        <View style={{ height: mapH, backgroundColor: colors.mintSoft }}>
          <RouteMap
            path={final.path}
            fill
            interactive={false}
            fitPadding={{ top: finishPad.top + 24, right: 36, bottom: finishPad.bottom + 24, left: 36 }}
          />
          <View style={styles.finishTop} pointerEvents="none" onLayout={(e) => setFinishPad((p) => ({ ...p, top: e.nativeEvent.layout.y + e.nativeEvent.layout.height }))}>
            <Text style={[type.eyebrow, { color: colors.mintDeep }]}>Run done</Text>
            <Text style={styles.finishTitle}>{surprise?.line ?? finishLine()}</Text>
          </View>
          <View style={styles.finishCard} onLayout={(e) => setFinishPad((p) => ({ ...p, bottom: mapH - e.nativeEvent.layout.y }))}>
            <View style={styles.statRow}>
              <Stat value={formatDistanceNumber(final.distanceM, km)} label={distanceUnit(km)} big />
              <Stat value={formatDuration(final.durationS)} label="time" />
              <Stat value={formatPace(final.distanceM, final.durationS, km)} label={`/${distanceUnit(km)}`} />
              <Stat value={formatElevation(final.elevationGainM, km)} label="climb" />
            </View>
            <Recharge before={moodBefore} after={moodAfter} />
          </View>
        </View>
        <View style={{ padding: spacing.md, paddingTop: spacing.lg, gap: spacing.lg }}>
          {you && <YouLine title={you.title} detail={you.detail} />}
          <MoodPicker title="And your energy now?" value={moodAfter} onChange={setMoodAfter} />
          <QuietPicker value={quiet} onChange={setQuiet} />
          <TextInput style={styles.note} placeholder="A note, if you want one" placeholderTextColor={colors.inkMuted} value={note} onChangeText={setNote} multiline />
          <SplitsTable title={`Splits per ${distanceUnit(km)}`} rows={final.splits} km={km} partial={partialKm} />
          {final.laps.length > 0 && <SplitsTable title="Laps" rows={final.laps} km={km} />}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Discard" variant="danger" onPress={onDiscard} style={{ flex: 0, paddingHorizontal: 22 }} />
            <Button title="Keep it" onPress={() => onSave()} style={{ flex: 1 }} />
          </View>
          <Button title="Keep it and share with someone" variant="secondary" onPress={() => onSave(true)} style={{ marginTop: -spacing.sm }} />
        </View>
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

  return (
    <View style={styles.live}>
      <RouteMap
        path={track.path}
        here={track.here}
        follow
        fill
        interactive={mapFront}
        fps={mapFront ? undefined : 20}
        focusPadding={mapFront ? { top: 120, right: 0, bottom: 140, left: 0 } : { top: H * 0.5, right: 0, bottom: 150, left: 0 }}
      />
      <Animated.View pointerEvents="none" style={[styles.veil, { opacity: veil }]} />

      <View style={styles.liveLayer} pointerEvents="box-none">
        <View style={styles.liveTop}>
          <View style={styles.statusPill}>
            <View style={[styles.dot, { backgroundColor: halted ? colors.butter : colors.mint }]} />
            <Text style={[styles.statusText, { color: halted ? colors.butter : colors.mint }]}>{autoPaused ? 'Auto-paused' : paused ? 'Paused' : 'Recording'}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { color: colors.onInkMuted }]}>{gpsLabel(track.gps)}</Text>
          </View>
        </View>

        {mapFront ? (
          <View style={styles.strip}>
            <StripStat value={formatDistanceNumber(track.distanceM, km)} label={distanceUnit(km)} />
            <StripStat value={formatDuration(track.durationS)} label="time" />
            <StripStat value={formatPace(track.distanceM, track.durationS, km)} label={`avg /${distanceUnit(km)}`} />
          </View>
        ) : (
          <LiveNumbers km={km} t={track} />
        )}

        <View style={{ flex: 1 }} pointerEvents="none" />

        {settings.musicStrip && <MusicStrip appKey={settings.musicApp} />}

        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={toggleMap} accessibilityRole="button" accessibilityLabel={mapFront ? 'Show numbers' : 'Show map'} style={({ pressed }) => [styles.mapToggle, pressed && { opacity: 0.85 }]}>
            <Text style={styles.mapToggleText}>{mapFront ? 'Numbers' : 'Map'}</Text>
          </Pressable>
        </View>

        <View style={styles.controls}>
          <Pressable onPress={onPauseResume} accessibilityLabel={paused ? 'Resume' : 'Pause'} style={styles.roundBtn}>
            <Text style={styles.roundGlyph}>{paused ? '▶' : '❚❚'}</Text>
          </Pressable>
          <Pressable onPress={() => lap()} disabled={paused} accessibilityRole="button" style={({ pressed }) => [styles.lapBtn, pressed && { opacity: 0.85 }, paused && { opacity: 0.4 }]}>
            <Text style={styles.lapText}>Lap</Text>
          </Pressable>
          <Pressable onPress={onStop} accessibilityLabel="Stop" style={[styles.roundBtn, { backgroundColor: colors.peach }]}>
            <View style={styles.stopSquare} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function LiveNumbers({ km, t }: { km: boolean; t: TrackingState }) {
  const cur = t.currentKm;
  return (
    <View style={{ gap: spacing.md }} pointerEvents="none">
      <View style={styles.hero}>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>{formatDistanceNumber(t.distanceM, km)}</Text>
        <Text style={styles.heroUnit}>{km ? 'kilometres' : 'miles'}</Text>
      </View>
      <View style={styles.numRow}>
        <LiveStat value={formatDuration(t.durationS)} label="time" color={colors.mint} />
        <LiveStat value={formatPace(t.distanceM, t.durationS, km)} label={`avg /${distanceUnit(km)}`} color={colors.peach} />
        <LiveStat value={formatSpeedAsPace(t.speedMps, km)} label="right now" color={colors.lilac} />
      </View>
      <Text style={styles.splitLine}>
        {km ? 'km' : 'mile'} {t.splits.length + 1} · {formatPace(cur.distanceM, cur.durationS, km)} · climb {formatElevation(t.elevationGainM, km)}
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
        <Text style={styles.liveStatLabel}>{label}</Text>
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

function gpsLabel(q: TrackingState['gps']): string {
  if (q === 'searching') return 'Finding you…';
  if (q === 'lost') return 'GPS lost';
  return `GPS ${q}`;
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
      <Text style={[styles.statValue, big && styles.statValueBig]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Energy before → after, the run's recharge. Fills in as you pick below. */
function Recharge({ before, after }: { before: Mood | null; after: Mood | null }) {
  if (before == null && after == null) {
    return <Text style={styles.rechargeText}>How’s your energy now? Pick it below.</Text>;
  }
  const d = before != null && after != null ? after - before : null;
  const verdict =
    d == null ? (after == null ? 'and now? Pick it below.' : '') : d > 0 ? `Recharged +${d}` : d === 0 ? 'Held steady' : 'Spent. That counts too.';
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
  const lines = ['Nobody saw that.\nWhich was the plan.', 'That’s one.\nQuietly logged.', 'Done.\nGo be unavailable.', 'Legs did the talking.'];
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
  screenInk: { flex: 1, backgroundColor: colors.ink, padding: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.sm + 2 },
  tile: { flex: 1, borderRadius: radius.lg, padding: 16 },
  tileValue: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: fonts.bodySemi, fontSize: 12, marginTop: 2 },
  countdown: { fontFamily: fonts.displayLight, fontSize: 140, color: colors.cream, fontVariant: ['tabular-nums'] },
  finishTop: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md, paddingTop: spacing.lg, paddingBottom: 14, gap: 10, backgroundColor: 'rgba(246,241,234,0.9)' },
  finishCard: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, padding: spacing.md, gap: 12, borderRadius: radius.lg, backgroundColor: 'rgba(246,241,234,0.94)' },
  recharge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rechargeFaces: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lilacSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  rechargeArrow: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep },
  rechargeText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted },
  finishTitle: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8, color: colors.text },
  statRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  statValue: { fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  statValueBig: { fontSize: 52, lineHeight: 54, letterSpacing: -2.5 },
  statLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  live: { flex: 1, backgroundColor: colors.ink },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(43,39,51,0.66)' },
  liveLayer: { flex: 1, padding: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(43,39,51,0.72)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hero: { alignItems: 'center', paddingTop: spacing.lg },
  heroValue: { fontFamily: fonts.displayLight, fontSize: 112, lineHeight: 116, letterSpacing: -4, color: colors.cream, fontVariant: ['tabular-nums'] },
  heroUnit: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: colors.onInkMuted },
  numRow: { flexDirection: 'row', gap: spacing.sm },
  liveStat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.lg, backgroundColor: 'rgba(246,241,234,0.08)' },
  liveStatValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.cream, fontVariant: ['tabular-nums'] },
  liveStatLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.onInkMuted },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  splitLine: { textAlign: 'center', fontFamily: fonts.body, fontSize: 14, color: colors.onInkMuted, fontVariant: ['tabular-nums'] },
  strip: { flexDirection: 'row', backgroundColor: 'rgba(43,39,51,0.82)', borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: spacing.sm },
  stripValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.cream, fontVariant: ['tabular-nums'] },
  stripLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.onInkMuted },
  mapToggle: { backgroundColor: 'rgba(246,241,234,0.92)', borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 10 },
  mapToggleText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  controls: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center', paddingBottom: spacing.sm },
  roundBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  roundGlyph: { color: colors.cream, fontSize: 18, fontFamily: fonts.bodyBold },
  lapBtn: { flex: 1, height: 64, borderRadius: radius.pill, backgroundColor: 'rgba(232,226,245,0.94)', alignItems: 'center', justifyContent: 'center' },
  lapText: { fontFamily: fonts.bodySemi, fontSize: 17, color: colors.lilacDeep },
  stopSquare: { width: 20, height: 20, borderRadius: 5, backgroundColor: colors.ink },
  note: { minHeight: 56, borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingVertical: 10, color: colors.text, fontFamily: fonts.displayItalic, fontSize: 17, textAlignVertical: 'top' },
});
