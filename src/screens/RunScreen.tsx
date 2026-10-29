import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { MoodPicker } from '../components/MoodPicker';
import { QuietPicker } from '../components/QuietPicker';
import { RouteMap } from '../components/RouteMap';
import { SplitsTable } from '../components/SplitsTable';
import { cueCountdown } from '../cues';
import { deleteRun, listRuns } from '../db';
import { HomeScreen } from './HomeScreen';
import { distanceUnit, formatDistance, formatDistanceNumber, formatDuration, formatElevation, formatPace, formatSpeedAsPace } from '../geo';
import { useSettings } from '../settings';
import { ensurePermissions, getState, lap, pauseRun, resumeRun, startRun, stopRun, subscribe, TrackingState } from '../tracking';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Mood, Quiet, Run } from '../types';

type Phase = 'idle' | 'countdown' | 'active' | 'finish';

export function RunScreen({ onSaved }: { onSaved: (runId: number) => void }) {
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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [mapFront, setMapFront] = useState(false);
  const veil = useRef(new Animated.Value(1)).current;

  useKeepAwake();
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

  function onStop() {
    const s = getState();
    if (s.status !== 'paused') pauseRun();
    setFinal(getState());
    setPhase('finish');
  }

  async function onSave() {
    const id = await stopRun({ moodAfter, quiet, note: note.trim() || null });
    reset();
    if (id != null) onSaved(id);
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
    setMapFront(false);
    veil.setValue(1);
  }

  // ---- Idle ------------------------------------------------------------------
  if (phase === 'idle') {
    return <HomeScreen runs={runs} mood={moodBefore} onMood={setMoodBefore} onStart={onStart} />;
  }

  // ---- Countdown -------------------------------------------------------------
  if (phase === 'countdown') {
    return (
      <View style={[styles.screenInk, styles.center]}>
        <Text style={styles.countdown}>{count}</Text>
        <Button title="Cancel" variant="onInk" onPress={cancelCountdown} style={{ marginTop: spacing.xl, width: 160 }} />
      </View>
    );
  }

  // ---- Finish ----------------------------------------------------------------
  if (phase === 'finish' && final) {
    const partialKm = final.currentKm.distanceM > 20 ? { index: final.splits.length + 1, ...final.currentKm } : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.finishHero}>
          <Text style={[type.eyebrow, { color: colors.mintDeep }]}>Run done</Text>
          <Text style={styles.finishTitle}>{finishLine()}</Text>
          <View style={styles.statRow}>
            <Stat value={formatDistanceNumber(final.distanceM, km)} label={distanceUnit(km)} big />
            <Stat value={formatDuration(final.durationS)} label="time" />
            <Stat value={formatPace(final.distanceM, final.durationS, km)} label={`/${distanceUnit(km)}`} />
            <Stat value={formatElevation(final.elevationGainM, km)} label="climb" />
          </View>
        </View>
        <View style={{ padding: spacing.md, paddingTop: spacing.lg, gap: spacing.lg }}>
          <RouteMap path={final.path} height={180} />
          <MoodPicker title="And your energy now?" value={moodAfter} onChange={setMoodAfter} />
          <QuietPicker value={quiet} onChange={setQuiet} />
          <TextInput style={styles.note} placeholder="A note, if you want one" placeholderTextColor={colors.inkMuted} value={note} onChangeText={setNote} multiline />
          <SplitsTable title={`Splits per ${distanceUnit(km)}`} rows={final.splits} km={km} partial={partialKm} />
          {final.laps.length > 0 && <SplitsTable title="Laps" rows={final.laps} km={km} />}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Discard" variant="danger" onPress={onDiscard} style={{ flex: 0, paddingHorizontal: 22 }} />
            <Button title="Keep it" onPress={onSave} style={{ flex: 1 }} />
          </View>
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

function finishLine(): string {
  const lines = ['Nobody saw that.\nWhich was the plan.', 'That’s one.\nQuietly logged.', 'Done.\nGo be unavailable.', 'Legs did the talking.'];
  return lines[Math.floor(Date.now() / 60000) % lines.length];
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
  finishHero: { padding: spacing.md, paddingTop: spacing.lg, gap: 14 },
  finishTitle: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -0.8, color: colors.text },
  statRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 18, marginTop: 6 },
  statValue: { fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  statValueBig: { fontSize: 60, lineHeight: 60, letterSpacing: -3 },
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
