import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { RouteMap } from '../components/RouteMap';
import { SplitsTable } from '../components/SplitsTable';
import { deleteRun, getPoints, getRun, getSplits } from '../db';
import { distanceUnit, estimateCalories, formatDistance, formatDuration, formatElevation, formatPace } from '../geo';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { LatLon, Run, Split } from '../types';

const MOOD = ['', 'Drained', 'Low', 'Okay', 'Good', 'Recharged'];
const QUIET = { crowded: 'Crowded', some: 'Some people', empty: 'Empty' } as const;

export function RunDetailScreen({ runId, onBack, onDeleted }: { runId: number; onBack: () => void; onDeleted: () => void }) {
  const km = useSettings().settings.unitsKm;
  const [run, setRun] = useState<Run | null>(null);
  const [path, setPath] = useState<LatLon[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);

  useEffect(() => {
    (async () => {
      setRun(await getRun(runId));
      const pts = await getPoints(runId);
      setPath(pts.map((p) => ({ latitude: p.lat, longitude: p.lon })));
      setSplits(await getSplits(runId));
    })();
  }, [runId]);

  if (!run) return <View style={styles.screen} />;

  const d = new Date(run.startedAt);
  const kmSplits = splits.filter((s) => s.kind === 'km');
  const laps = splits.filter((s) => s.kind === 'lap');
  const lastKm = kmSplits[kmSplits.length - 1];
  const tail = lastKm ? run.distanceM - lastKm.atDistanceM : run.distanceM;
  const tailDur = lastKm ? run.durationS - lastKm.atDurationS : run.durationS;
  const partial = tail > 20 ? { index: kmSplits.length + 1, distanceM: tail, durationS: tailDur } : null;

  function onDelete() {
    Alert.alert('Delete run?', 'This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRun(runId);
          onDeleted();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <Button title="‹ Back" variant="secondary" onPress={onBack} style={{ alignSelf: 'flex-start', height: 44, paddingHorizontal: 18 }} />
      <Text style={styles.date}>{d.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text>
      <RouteMap path={path} height={260} />
      <View style={styles.grid}>
        <Cell label="Distance" value={formatDistance(run.distanceM, km)} />
        <Cell label="Time" value={formatDuration(run.durationS)} />
        <Cell label={`Pace /${distanceUnit(km)}`} value={formatPace(run.distanceM, run.durationS, km)} />
        <Cell label="Climb" value={formatElevation(run.elevationGainM, km)} />
        <Cell label="Calories (est.)" value={`${estimateCalories(run.distanceM)} kcal`} />
        <Cell label="Route" value={run.quiet ? QUIET[run.quiet] : '–'} />
        <Cell label="Energy before" value={run.moodBefore ? MOOD[run.moodBefore] : '–'} />
        <Cell label="Energy after" value={run.moodAfter ? MOOD[run.moodAfter] : '–'} />
      </View>
      {run.note ? <Text style={styles.note}>{run.note}</Text> : null}
      <SplitsTable title={`Splits per ${distanceUnit(km)}`} rows={kmSplits} km={km} partial={partial} />
      {laps.length > 0 && <SplitsTable title="Laps" rows={laps} km={km} />}
      <Button title="Delete run" variant="danger" onPress={onDelete} style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  date: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  cell: { width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
  cellValue: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  cellLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  note: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22, backgroundColor: colors.butter, borderRadius: radius.lg, padding: spacing.md },
});
