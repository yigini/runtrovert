import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
const W = Dimensions.get('window').width;

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
  const [page, setPage] = useState(0);

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
  const paused = track.status === 'paused';
  const autoPaused = track.status === 'autopaused';
  const pages = [
    <MetricsPage key="main" km={km} t={track} />,
    <SplitPage key="split" km={km} t={track} />,
    <View key="map" style={{ width: W - spacing.md * 2 }}>
      <RouteMap path={track.path} follow height={380} />
    </View>,
  ];

  return (
    <View style={styles.screenInk}>
      <View style={styles.liveTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.dot, { backgroundColor: paused || autoPaused ? colors.butter : colors.mint }]} />
          <Text style={[type.eyebrow, { color: paused || autoPaused ? colors.butter : colors.mint, letterSpacing: 1.5 }]}>{autoPaused ? 'Auto-paused' : paused ? 'Paused' : 'Recording'}</Text>
        </View>
        <Text style={[type.eyebrow, { color: colors.onInkMuted, letterSpacing: 1.5 }]}>GPS {track.gps}</Text>
      </View>
      <FlatList
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => item}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (W - spacing.md * 2)))}
        style={{ flexGrow: 0 }}
      />
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.pageDot, i === page && styles.pageDotOn]} />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.controls}>
        <Pressable onPress={onPauseResume} accessibilityLabel={paused ? 'Resume' : 'Pause'} style={styles.roundBtn}>
          <Text style={styles.roundGlyph}>{paused ? '▶' : '❚❚'}</Text>
        </Pressable>
        <Button title="Lap" variant="secondary" onPress={() => lap()} style={{ flex: 1, height: 64 }} disabled={paused} />
        <Pressable onPress={onStop} accessibilityLabel="Stop" style={[styles.roundBtn, { backgroundColor: colors.peach }]}>
          <View style={styles.stopSquare} />
        </Pressable>
      </View>
    </View>
  );
}

function MetricsPage({ km, t }: { km: boolean; t: TrackingState }) {
  return (
    <View style={{ width: W - spacing.md * 2, gap: spacing.sm }}>
      <View style={styles.hero}>
        <Text style={styles.heroValue}>{formatDistanceNumber(t.distanceM, km)}</Text>
        <Text style={styles.heroUnit}>{km ? 'kilometres' : 'miles'}</Text>
      </View>
      <View style={styles.tiles}>
        <Tile bg={colors.mint} fg={colors.mintDeep} value={formatDuration(t.durationS)} label="time" />
        <Tile bg={colors.peach} fg={colors.peachDeep} value={formatPace(t.distanceM, t.durationS, km)} label={`avg /${distanceUnit(km)}`} />
      </View>
      <View style={styles.tiles}>
        <Tile bg={colors.lilac} fg={colors.lilacDeep} value={formatSpeedAsPace(t.speedMps, km)} label="right now" />
        <Tile bg={colors.butter} fg={colors.butterDeep} value={formatElevation(t.elevationGainM, km)} label="climb" />
      </View>
    </View>
  );
}

function SplitPage({ km, t }: { km: boolean; t: TrackingState }) {
  const cur = t.currentKm;
  const last = t.splits[t.splits.length - 1];
  return (
    <View style={{ width: W - spacing.md * 2, gap: spacing.sm }}>
      <View style={styles.hero}>
        <Text style={styles.heroValue}>{formatPace(cur.distanceM, cur.durationS, km)}</Text>
        <Text style={styles.heroUnit}>this {km ? 'km' : 'mile'}</Text>
      </View>
      <View style={styles.tiles}>
        <Tile bg={colors.mint} fg={colors.mintDeep} value={formatDistance(cur.distanceM, km)} label={`${km ? 'km' : 'mile'} ${t.splits.length + 1}`} />
        <Tile bg={colors.peach} fg={colors.peachDeep} value={formatDuration(cur.durationS)} label="split time" />
      </View>
      <View style={styles.tiles}>
        <Tile bg={colors.lilac} fg={colors.lilacDeep} value={last ? formatPace(last.distanceM, last.durationS, km) : '–'} label="last split" />
        <Tile bg={colors.butter} fg={colors.butterDeep} value={formatDuration(t.currentLap.durationS)} label="lap" />
      </View>
    </View>
  );
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
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  heroValue: { fontFamily: fonts.displayLight, fontSize: 104, lineHeight: 104, letterSpacing: -4, color: colors.cream, fontVariant: ['tabular-nums'] },
  heroUnit: { fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: colors.onInkMuted },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5a5370' },
  pageDotOn: { width: 18, backgroundColor: colors.cream },
  controls: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center', paddingBottom: spacing.sm },
  roundBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  roundGlyph: { color: colors.cream, fontSize: 18, fontFamily: fonts.bodyBold },
  stopSquare: { width: 20, height: 20, borderRadius: 5, backgroundColor: colors.ink },
  note: { minHeight: 56, borderBottomWidth: 1.5, borderBottomColor: colors.ink, paddingVertical: 10, color: colors.text, fontFamily: fonts.displayItalic, fontSize: 17, textAlignVertical: 'top' },
});
