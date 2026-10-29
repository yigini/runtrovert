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
    setBusy('Reading the files…');
    try {
      const t = await pickAndImport((done, total) => total > 3 && setBusy(`Reading the files… ${done} of ${total}`));
      if (t) {
        setLine(importLine(t));
        if (t.added) {
          setKey((k) => k + 1);
          onChanged();
        }
      }
    } catch (e) {
      Alert.alert('Couldn’t read those files', String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function takeOut(format: 'gpx' | 'fit') {
    setBusy('Writing your runs…');
    try {
      const r = await shareAllRuns(format, (done, total) => setBusy(`Writing your runs… ${done} of ${total}`));
      if (r.skipped) setLine(`${r.files} runs in the zip. ${r.skipped} had no route, so GPX had nothing to hold; FIT keeps their numbers.`);
    } catch (e) {
      Alert.alert('Couldn’t write the zip', String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const brought = counts ? Object.entries(counts.brought).filter(([, n]) => n) : [];
  const broughtTotal = brought.reduce((n, [, c]) => n + (c ?? 0), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label="Settings" onPress={onBack} />
      <Text style={type.h1} accessibilityRole="header">
        Everything you have
      </Text>
      <Text style={type.body}>Your runs are yours to bring here and to take anywhere. It all happens on this phone.</Text>

      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={type.eyebrow}>On this phone</Text>
        <View style={styles.kv}>
          <Text style={styles.k}>Runs</Text>
          <Text style={styles.v}>{counts ? counts.runs : '…'}</Text>
        </View>
        {counts ? (
          <View style={[styles.kv, styles.kvLast]}>
            <Text style={styles.k}>Recorded here</Text>
            <Text style={styles.v}>{counts.runs - broughtTotal}</Text>
          </View>
        ) : null}
        {brought.map(([kind, n]) => (
          <View key={kind} style={[styles.kv, styles.kvLast]}>
            <Text style={styles.k}>Brought in {FROM[kind as SourceKind]}</Text>
            <Text style={styles.v}>{n}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.mint }]}>
        <Text style={[type.eyebrow, { color: colors.mintDeep }]} accessibilityRole="header">
          Bring runs in
        </Text>
        <Text style={styles.text}>
          GPX or FIT files from a watch or another app. Pick as many as you like. Runs that are already here are noticed and left alone, and rides, walks and
          planned routes stay out. They join Your runs, your bests and your places like any other run.
        </Text>
        <Text style={styles.hint}>
          From Garmin Connect, Strava, Coros or Suunto: export the activity as GPX, or as the original FIT file, then pick it here. Zipped files need unzipping
          first.
        </Text>
        <Button title="Choose files" onPress={bringIn} disabled={!!busy} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.lilac }]}>
        <Text style={[type.eyebrow, { color: colors.lilacDeep }]} accessibilityRole="header">
          Take them out
        </Text>
        <Text style={styles.text}>One run: open it in Your runs and tap Save as GPX. That stays free.</Text>
        {unlocked ? (
          <>
            <Text style={styles.text}>All your runs: one zip with a file per run, for another app, a watch platform or your own backup.</Text>
            <Button title="All runs as GPX" variant="secondary" onPress={() => takeOut('gpx')} disabled={!!busy} />
            <Button title="All runs as FIT" variant="secondary" onPress={() => takeOut('fit')} disabled={!!busy} />
          </>
        ) : (
          <LockRow title="All your runs as GPX or FIT" />
        )}
      </View>

      {busy || line ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          {busy ? <ActivityIndicator color={colors.ink} /> : null}
          <Text style={[styles.text, { flex: 1 }]}>{busy ?? line}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.white }]}>
        <Text style={type.eyebrow} accessibilityRole="header">
          What happens, and what doesn't
        </Text>
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
