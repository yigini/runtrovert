import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { ImportGuide } from '../components/ImportGuide';
import { storedCounts } from '../db';
import { importLine } from '../io/shape';
import { commitImport, pickImportFiles, scanImport, shareAllRuns, type ImportPreview } from '../io/store';
import { formatDistance } from '../geo';
import { useSettings } from '../settings';
import { currentCounts, pickBackup, restoreBackup, shareBackup, type PickedBackup } from '../io/backupStore';
import { getState } from '../tracking';
import { restartApp } from '../restart';
import { dateLocale } from '../i18n/lang';
import type { SourceKind } from '../io/types';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { live, ui } from '../i18n/ui';

// "Everything you have": what's stored, bringing runs in from a watch or
// another app, and taking them all out again. Files pass through the phone's
// own picker and share sheet; nothing here touches the network.

const HAPPENS: string[] = live(() => ui().everything.happens);

const FROM: Record<Exclude<SourceKind, 'manual'>, string> = live(() => ui().everything.from);

export function EverythingScreen({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof storedCounts>> | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  // How to get runs out of other apps: a page of its own, over this one.
  const [guide, setGuide] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    storedCounts().then(setCounts).catch(() => {});
  }, [key]);

  async function bringIn() {
    const files = await pickImportFiles().catch(() => null);
    if (!files) return;
    setLine(null);
    setBusy(ui().everything.readingTheFiles);
    let preview: ImportPreview;
    try {
      preview = await scanImport(files, (done, total) => total > 3 && setBusy(ui().everything.readingTheFilesXOf(done, total)));
    } catch (e) {
      setBusy(null);
      Alert.alert(ui().everything.couldnTReadThoseFiles, String((e as Error)?.message ?? e));
      return;
    }
    setBusy(null);
    if (!preview.fresh) {
      setLine(importLine(preview.out));
      return;
    }
    // A few files come straight in, as before. A whole export is shown first.
    if (!preview.archive) return void bring(files, preview);
    const month = (ts: number | null) => (ts == null ? '' : new Date(ts).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' }));
    const stays = importLine({ ...preview.out, added: 0 }).replace(ui().shape.nothingNewToBringIn, '').trim();
    const message = [ui().everything.newRuns(preview.fresh, formatDistance(preview.freshKm * 1000, settings.unitsKm), month(preview.firstAt), month(preview.lastAt)), stays, ui().everything.nothingSavedYet].filter(Boolean).join('\n\n');
    const title = preview.origin === 'strava' ? ui().everything.exportStrava : preview.origin === 'garmin' ? ui().everything.exportGarmin : ui().everything.readyToBringIn;
    Alert.alert(title, message, [
      { text: ui().everything.notNow, style: 'cancel' },
      { text: ui().everything.bringThemIn, onPress: () => void bring(files, preview) },
    ]);
  }

  async function bring(files: Parameters<typeof commitImport>[0], preview: ImportPreview) {
    setBusy(ui().everything.bringingIn);
    try {
      const t = await commitImport(files, preview, (done, total) => total > 3 && setBusy(ui().everything.bringingInXOf(done, total)));
      setLine(importLine(t));
      if (t.added) {
        setKey((k) => k + 1);
        onChanged();
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

  async function makeBackup() {
    setBusy(ui().backup.writing);
    try {
      const c = await shareBackup();
      setLine(ui().backup.holds(c.runs, c.places, c.notes));
    } catch (e) {
      Alert.alert(ui().backup.couldntMake, String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (getState().status !== 'idle') {
      Alert.alert(ui().backup.couldntRestore, ui().backup.notDuringARun);
      return;
    }
    setBusy(ui().backup.reading);
    let picked: Awaited<ReturnType<typeof pickBackup>>;
    try {
      picked = await pickBackup();
    } catch (e) {
      setBusy(null);
      Alert.alert(ui().backup.couldntRestore, String((e as Error)?.message ?? e));
      return;
    }
    setBusy(null);
    if (!picked) return;
    if (picked === 'incomplete') {
      Alert.alert(ui().backup.couldntRestore, `${ui().backup.incomplete}\n\n${ui().backup.nothingChanged}`);
      return;
    }
    if (picked === 'notBackup' || picked === 'newer') {
      Alert.alert(ui().backup.couldntRestore, picked === 'newer' ? ui().backup.newer : ui().backup.notABackup);
      return;
    }
    const now = await currentCounts().catch(() => null);
    const day = (ts: number) => new Date(ts).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
    const c = picked.header.counts;
    const what = [
      ui().backup.made(day(picked.header.madeAt)),
      c.runs && c.firstRunAt != null && c.lastRunAt != null ? ui().backup.span(c.runs, day(c.firstRunAt), day(c.lastRunAt)) : ui().backup.noRuns,
      ui().backup.extras(c.places, c.notes, c.plan),
      ui().backup.replaces(now?.runs ?? 0),
    ].join('\n\n');
    const chosen = picked as PickedBackup;
    Alert.alert(ui().backup.restoreThis, what, [
      { text: ui().backup.cancel, style: 'cancel' },
      { text: ui().backup.replace, style: 'destructive', onPress: () => replaceWith(chosen) },
    ]);
  }

  async function replaceWith(picked: PickedBackup) {
    setBusy(ui().backup.restoring);
    try {
      await restoreBackup(picked);
    } catch (e) {
      setBusy(null);
      Alert.alert(ui().backup.couldntRestore, `${ui().backup.nothingChanged}\n\n${String((e as Error)?.message ?? e)}`);
      return;
    }
    setBusy(null);
    // Every screen starts again from the restored database.
    Alert.alert(ui().backup.restored, ui().backup.everythingIsBack, [{ text: ui().backup.ok, onPress: restartApp }], { cancelable: false });
  }

  const brought = counts ? Object.entries(counts.brought).filter(([, n]) => n) : [];
  const broughtTotal = brought.reduce((n, [, c]) => n + (c ?? 0), 0);

  const status =
    busy || line ? (
      <View style={styles.note} accessibilityLiveRegion="polite">
        {busy ? <ActivityIndicator color={colors.ink} /> : null}
        <Text style={[styles.text, { flex: 1 }]}>{busy ?? line}</Text>
      </View>
    ) : null;

  if (guide)
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
        <BackButton label={ui().everything.everythingYouHave} onPress={() => setGuide(false)} />
        <Text style={type.h1} accessibilityRole="header">{ui().importGuide.title}</Text>
        <Text style={type.body}>{ui().importGuide.intro}</Text>
        <ImportGuide />
        <Button title={ui().everything.chooseFiles} onPress={bringIn} disabled={!!busy} />
        {status}
        <Text style={styles.small}>{ui().importGuide.after}</Text>
      </ScrollView>
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label={ui().everything.settings} onPress={onBack} />
      <Text style={type.h1} accessibilityRole="header">{ui().everything.everythingYouHave}</Text>
      <Text style={type.body}>{ui().everything.yourRunsAreYoursTo}</Text>

      <View style={[styles.card, { backgroundColor: colors.butter }]}>
        <Text style={type.eyebrow} accessibilityRole="header">{ui().backup.keepACopy}</Text>
        <Text style={styles.text}>{ui().backup.oneFileWithEverything}</Text>
        <Button title={ui().backup.makeABackup} onPress={makeBackup} disabled={!!busy} />
        <Button title={ui().backup.restoreFromAFile} variant="secondary" onPress={restore} disabled={!!busy} />
        <Text style={styles.small}>{ui().backup.noPassword}</Text>
      </View>

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
            <Text style={styles.k}>{kind === 'manual' ? ui().addRun.typedIn : ui().everything.broughtInX(FROM[kind as Exclude<SourceKind, 'manual'>])}</Text>
            <Text style={styles.v}>{n}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.mint }]}>
        <Text style={[type.eyebrow, { color: colors.mintDeep }]} accessibilityRole="header">{ui().everything.bringRunsIn}</Text>
        <Text style={styles.text}>{ui().everything.gpxOrFitFilesFrom}</Text>
        <Pressable onPress={() => setGuide(true)} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.guideLink, pressed && { opacity: 0.85 }]}>
          <Text style={styles.guideText}>{ui().importGuide.link}</Text>
          <Text style={[styles.guideText, { textDecorationLine: 'none' }]} importantForAccessibility="no" accessibilityElementsHidden>
            ›
          </Text>
        </Pressable>
        <Button title={ui().everything.chooseFiles} onPress={bringIn} disabled={!!busy} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.lilac }]}>
        <Text style={[type.eyebrow, { color: colors.lilacDeep }]} accessibilityRole="header">{ui().everything.takeThemOut}</Text>
        <Text style={styles.text}>{ui().everything.oneRunOpenItIn}</Text>
        <Text style={styles.text}>{ui().everything.allYourRunsOneZip}</Text>
        <Button title={ui().everything.allRunsAsGpx} variant="secondary" onPress={() => takeOut('gpx')} disabled={!!busy} />
        <Button title={ui().everything.allRunsAsFit} variant="secondary" onPress={() => takeOut('fit')} disabled={!!busy} />
      </View>

      {status}

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

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  kvLast: { borderBottomWidth: 0, paddingVertical: 4 },
  k: { fontFamily: fonts.body, fontSize: 15, color: colors.text, flex: 1, paddingRight: spacing.sm },
  v: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  guideLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  guideText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep, textDecorationLine: 'underline' },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.butter, borderRadius: radius.md, padding: 14 },
}));
