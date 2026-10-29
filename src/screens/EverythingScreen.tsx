import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { LockRow } from '../components/LockRow';
import { storedCounts } from '../db';
import { importLine } from '../io/shape';
import { pickAndImport, shareAllRuns } from '../io/store';
import type { SourceKind } from '../io/types';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useUnlocked } from '../unlockState';
import { ui } from '../i18n/ui';

// "Everything you have": what's stored, bringing runs in from a watch or
// another app, and taking them all out again. Files pass through the phone's
// own picker and share sheet; nothing here touches the network.

const HAPPENS = [
  'Files are read on this phone. Nothing is uploaded, and nothing is fetched.',
  'Runtrovert only sees the files you pick, never the rest of your storage, so it asks for no storage permission.',
  'A file you save goes where you send it from the share sheet, and nowhere else.',
  'Notes, energy and busyness stay out of the files. They belong to you, not to a watch or another app.',
  'No account, no sync, no cloud.',
];

const FROM: Record<SourceKind, string> = { gpx: 'from GPX files', fit: 'from FIT files', health: 'from Health Connect' };

export function EverythingScreen({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const unlocked = useUnlocked();
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof storedCounts>> | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    storedCounts().then(setCounts).catch(() => {});
  }, [key]);

  async function bringIn() {
    setBusy(ui().everything.readingTheFiles);
    try {
      const t = await pickAndImport((done, total) => total > 3 && setBusy(ui().everything.readingTheFilesXOf(done, total)));
      if (t) {
        setLine(importLine(t));
        if (t.added) {
          setKey((k) => k + 1);
          onChanged();
        }
      }
    } catch (e) {
      Alert.alert(ui().everything.couldnTReadThoseFiles, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function takeOut(format: 'gpx' | 'fit') {
    setBusy(ui().everything.writingYourRuns);
    try {
      const r = await shareAllRuns(format, (done, total) => setBusy(ui().everything.writingYourRunsXOf(done, total)));
      if (r.skipped) setLine(ui().everything.xRunsInTheZip(r.files, r.skipped));
    } catch (e) {
      Alert.alert(ui().everything.couldnTWriteTheZip, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const brought = counts ? Object.entries(counts.brought).filter(([, n]) => n) : [];
  const broughtTotal = brought.reduce((n, [, c]) => n + (c ?? 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label={ui().everything.settings} onPress={onBack} />
      <Text style={type.h1} accessibilityRole="header">{ui().everything.everythingYouHave}</Text>
      <Text style={type.body}>{ui().everything.yourRunsAreYoursTo}</Text>

      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={type.eyebrow}>{ui().everything.onThisPhone}</Text>
        <View style={styles.kv}>
          <Text style={styles.k}>{ui().everything.runs}</Text>
          <Text style={styles.v}>{counts ? counts.runs : '…'}</Text>
        </View>
        {counts ? (
          <View style={[styles.kv, styles.kvLast]}>
            <Text style={styles.k}>{ui().everything.recordedHere}</Text>
            <Text style={styles.v}>{counts.runs - broughtTotal}</Text>
          </View>
        ) : null}
        {brought.map(([kind, n]) => (
          <View key={kind} style={[styles.kv, styles.kvLast]}>
            <Text style={styles.k}>{ui().everything.broughtInX(FROM[kind as SourceKind])}</Text>
            <Text style={styles.v}>{n}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.mint }]}>
        <Text style={[type.eyebrow, { color: colors.mintDeep }]} accessibilityRole="header">{ui().everything.bringRunsIn}</Text>
        <Text style={styles.text}>{ui().everything.gpxOrFitFilesFrom}</Text>
        <Text style={styles.hint}>{ui().everything.fromGarminConnectStravaCoros}</Text>
        <Button title={ui().everything.chooseFiles} onPress={bringIn} disabled={!!busy} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.lilac }]}>
        <Text style={[type.eyebrow, { color: colors.lilacDeep }]} accessibilityRole="header">{ui().everything.takeThemOut}</Text>
        <Text style={styles.text}>{ui().everything.oneRunOpenItIn}</Text>
        {unlocked ? (
          <>
            <Text style={styles.text}>{ui().everything.allYourRunsOneZip}</Text>
            <Button title={ui().everything.allRunsAsGpx} variant="secondary" onPress={() => takeOut('gpx')} disabled={!!busy} />
            <Button title={ui().everything.allRunsAsFit} variant="secondary" onPress={() => takeOut('fit')} disabled={!!busy} />
          </>
        ) : (
          <LockRow title={ui().everything.allYourRunsAsGpx} />
        )}
      </View>

      {busy || line ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          {busy ? <ActivityIndicator color={colors.ink} /> : null}
          <Text style={[styles.text, { flex: 1 }]}>{busy ?? line}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={type.eyebrow} accessibilityRole="header">{ui().everything.whatHappensAndWhatDoesn}</Text>
        {HAPPENS.map((h) => (
          <Text key={h} style={styles.text}>
            {h}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#efe8dd' },
  kvLast: { borderBottomWidth: 0, paddingVertical: 4 },
  k: { fontFamily: fonts.body, fontSize: 15, color: colors.text, flex: 1, paddingRight: spacing.sm },
  v: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.mintDeep },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.butter, borderRadius: radius.md, padding: 14 },
});
