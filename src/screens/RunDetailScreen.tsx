import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { MoodPicker } from '../components/MoodPicker';
import { RouteMap } from '../components/RouteMap';
import { ShareSheet } from '../components/ShareSheet';
import { RunStatsView } from '../components/RunStats';
import { YouLine } from '../components/YouLine';
import { deleteRun, getPoints, getRun, getRunSource, getSplits, setMoodAfter, type RunSource } from '../db';
import { shareRunGpx } from '../io/store';
import { placeForRun, type Place } from '../placeStore';
import { forgetRun } from '../training/store';
import { compare, youVsYou, type RunFacts } from '../progress';
import type { RunWeather } from '../shareLines';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { StatPoint } from '../runStats';
import type { LatLon, Mood, Run, Split } from '../types';
import { loadYou } from '../you';
import { ui } from '../i18n/ui';
import { dateLocale } from '../i18n/lang';

export function RunDetailScreen({
  runId,
  onBack,
  onDeleted,
  onOpenPlace,
  shareOnOpen,
}: {
  runId: number;
  onBack: () => void;
  onDeleted: () => void;
  onOpenPlace?: (id: number) => void;
  shareOnOpen?: boolean;
}) {
  const km = useSettings().settings.unitsKm;
  const [run, setRun] = useState<Run | null>(null);
  const [path, setPath] = useState<LatLon[]>([]);
  const [points, setPoints] = useState<StatPoint[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [facts, setFacts] = useState<RunFacts[] | null>(null);
  const [weather, setWeather] = useState<RunWeather | null>(null);
  const [sharing, setSharing] = useState(!!shareOnOpen);
  const [source, setSource] = useState<RunSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    (async () => {
      setRun(await getRun(runId));
      const pts = await getPoints(runId);
      setPath(pts.map((p) => ({ latitude: p.lat, longitude: p.lon })));
      setPoints(pts.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, alt: p.alt })));
      setSplits(await getSplits(runId));
      setSource(await getRunSource(runId).catch(() => null));
      setPlace(await placeForRun(runId).catch(() => null));
      const you = await loadYou().catch(() => null);
      if (you) {
        setFacts(you.facts);
        setWeather(you.weather.get(runId) ?? null);
      }
    })();
  }, [runId]);

  const cmp = useMemo(() => {
    const mine = facts?.find((f) => f.id === runId);
    return mine && facts ? compare(mine, facts) : null;
  }, [facts, runId]);

  if (!run) return <View style={styles.screen} />;
  const line = cmp ? youVsYou(cmp, km) : null;

  const d = new Date(run.startedAt);
  const kmSplits = splits.filter((s) => s.kind === 'km');
  const laps = splits.filter((s) => s.kind === 'lap');
  const lastKm = kmSplits[kmSplits.length - 1];
  const tail = lastKm ? run.distanceM - lastKm.atDistanceM : run.distanceM;
  const tailDur = lastKm ? run.durationS - lastKm.atDurationS : run.durationS;
  const partial = tail > 20 ? { index: kmSplits.length + 1, distanceM: tail, durationS: tailDur } : null;

  async function onSaveGpx() {
    setSaving(true);
    try {
      await shareRunGpx(runId);
    } catch (e) {
      Alert.alert(ui().runDetail.couldnTSaveTheGpx, String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    Alert.alert(ui().runDetail.deleteRun, ui().runDetail.thisCannotBeUndone, [
      { text: ui().runDetail.keep, style: 'cancel' },
      {
        text: ui().runDetail.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteRun(runId);
          await forgetRun(runId).catch(() => {});
          onDeleted();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label={ui().runDetail.yourRuns} onPress={onBack} />
      <Text style={styles.date}>{d.toLocaleString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text>
      {source ? (
        <Text style={styles.source}>
          {ui().runDetail.broughtIn(source.kind === 'health' ? ui().runDetail.healthConnect : source.fileName ?? ui().runDetail.aXFile(source.kind.toUpperCase()), new Date(source.importedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }))}
        </Text>
      ) : null}
      {place && onOpenPlace ? (
        <Pressable
          onPress={() => onOpenPlace(place.id)}
          accessibilityRole="button"
          accessibilityLabel={ui().runDetail.oneOfYourPlacesX(place.name)}
          accessibilityHint={ui().runDetail.opensThisPlace}
          hitSlop={8}
          style={({ pressed }) => [styles.place, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.placeText}>{place.name} ›</Text>
        </Pressable>
      ) : null}
      <RouteMap path={path} height={260} />
      {line && <YouLine title={line.title.replace('\n', ' ')} detail={line.detail} />}
      <RunStatsView run={run} points={points} splits={kmSplits} laps={laps} partial={partial} sun={weather} km={km} />
      {run.moodAfter == null && run.endedAt != null ? (
        <MoodPicker
          title={ui().runDetail.andYourEnergyNow}
          value={null}
          onChange={(m: Mood) => {
            setRun({ ...run, moodAfter: m });
            setMoodAfter(runId, m).catch(() => {});
          }}
        />
      ) : null}
      {run.note ? <Text style={styles.note}>{run.note}</Text> : null}
      {cmp && <Button title={ui().runDetail.shareWithSomeone} variant="secondary" onPress={() => setSharing(true)} style={{ marginTop: spacing.sm }} />}
      {path.length > 1 ? <Button title={saving ? ui().runDetail.saving : ui().runDetail.saveAsGpx} variant="secondary" onPress={onSaveGpx} disabled={saving} /> : null}
      <Button title={ui().runDetail.deleteRun2} variant="danger" onPress={onDelete} style={{ marginTop: spacing.lg }} />
      {cmp && <ShareSheet visible={sharing} onClose={() => setSharing(false)} run={run} path={path} cmp={cmp} weather={weather} km={km} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  source: { ...type.small, marginTop: -spacing.sm },
  date: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  place: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', backgroundColor: colors.mint, borderRadius: radius.pill, paddingHorizontal: 14 },
  placeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep },
  note: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22, backgroundColor: colors.butter, borderRadius: radius.lg, padding: spacing.md },
});
