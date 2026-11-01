import { beforeDeleteForHealth, syncRunToHealth } from '../health';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { DeepRunView } from '../components/DeepStats';
import { Button } from '../components/Button';
import { MoodPicker } from '../components/MoodPicker';
import { RouteMap } from '../components/RouteMap';
import { ShareSheet } from '../components/ShareSheet';
import { RunStatsView } from '../components/RunStats';
import { BackHomeCard, RunKit } from '../components/RunKit';
import { YouLine } from '../components/YouLine';
import { correctRun, deleteRun, getHeartRate, getPoints, getRun, getRunEdit, getRunSource, getSplits, highestHeartRate, loadValue, putBackRun, setMoodAfter, setRunNote, type RunEdit, type RunSource } from '../db';
import { formatDistance, formatDuration } from '../geo';
import { INDOOR_KEY } from '../runAids';
import { checkCorrection, distanceField, durationField, parseDistance, parseDuration, type EntryProblem } from '../runEdit';
import { cleanHeart, heartSummary, type HeartSample, type HeartSummary } from '../heart';
import { shareRunGpx } from '../io/store';
import { SavePlaceSheet } from '../components/SavePlaceSheet';
import { suggestName } from '../places';
import { getPlace, logRun, placeForRun, placeFromRun, runPlaceChoice, type Place, type PlaceDraft, type RunPlaceChoice } from '../placeStore';
import { forgetRun } from '../training/store';
import { compare, youVsYou, type RunFacts } from '../progress';
import type { RunWeather } from '../shareLines';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
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
  onChanged,
  onFollow,
}: {
  runId: number;
  onBack: () => void;
  onDeleted: () => void;
  onOpenPlace?: (id: number) => void;
  shareOnOpen?: boolean;
  /** Distance or time was corrected. */
  onChanged?: () => void;
  /** Run this route again, with a buzz when you leave it. */
  onFollow?: (name: string, path: LatLon[]) => void;
}) {
  const km = useSettings().settings.unitsKm;
  const [run, setRun] = useState<Run | null>(null);
  // Gone: discarded or deleted since, e.g. opened from an old after-run note.
  const [missing, setMissing] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // Leaving the screen mid-edit still keeps what was typed.
  const pendingNote = useRef<{ before: string | null; text: string | null }>({ before: null, text: null });
  pendingNote.current = { before: run?.note ?? null, text: noteDraft };
  useEffect(
    () => () => {
      const { before, text } = pendingNote.current;
      if (text != null && (text.trim() || null) !== before) setRunNote(runId, text).catch(() => {});
    },
    [runId],
  );
  const [path, setPath] = useState<LatLon[]>([]);
  const [points, setPoints] = useState<StatPoint[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [facts, setFacts] = useState<RunFacts[] | null>(null);
  const [weather, setWeather] = useState<RunWeather | null>(null);
  const [sharing, setSharing] = useState(!!shareOnOpen);
  const [source, setSource] = useState<RunSource | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  // Not in a place yet: its loop, so any run can become one ("Save as a place").
  const [choice, setChoice] = useState<RunPlaceChoice | null>(null);
  const [placeSheet, setPlaceSheet] = useState(false);
  const [heart, setHeart] = useState<HeartSummary | null>(null);
  const [beats, setBeats] = useState<HeartSample[]>([]);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  // Correcting distance and time: what was recorded, and the open editor's fields.
  const [edit, setEdit] = useState<RunEdit | null>(null);
  const [fixing, setFixing] = useState<{ distance: string; time: string; problem: EntryProblem | null } | null>(null);
  // Every hook sits above the early return below: a hook after it runs on some renders
  // and not others, which crashed opening a run ("Rendered more hooks").
  const keeping = useRef(false);

  useEffect(() => {
    (async () => {
      const r = await getRun(runId);
      setRun(r);
      setMissing(!r);
      if (r) {
        const clean = cleanHeart(await getHeartRate(runId).catch(() => []), r.startedAt, r.endedAt);
        setHeart(heartSummary(clean));
        setBeats(clean);
        if (clean.length) setMaxHr(await highestHeartRate().catch(() => null));
      }
      const pts = await getPoints(runId);
      setPath(pts.map((p) => ({ latitude: p.lat, longitude: p.lon })));
      setPoints(pts.map((p) => ({ ts: p.ts, lat: p.lat, lon: p.lon, alt: p.alt, acc: p.acc })));
      setSplits(await getSplits(runId));
      setSource(await getRunSource(runId).catch(() => null));
      setIndoor(!!(await loadValue<Record<string, unknown>>(INDOOR_KEY).catch(() => null))?.[String(runId)]);
      setEdit(await getRunEdit(runId).catch(() => null));
      const inPlace = await placeForRun(runId).catch(() => null);
      setPlace(inPlace);
      if (!inPlace) setChoice(await runPlaceChoice(runId).catch(() => null));
      const you = await loadYou().catch(() => null);
      if (you) {
        setFacts(you.facts);
        setWeather(you.weather.get(runId) ?? null);
      }
    })();
  }, [runId]);

  const kmPaces = useMemo(
    () => splits.filter((s) => s.kind === 'km' && s.distanceM >= 900).map((s) => (s.durationS / s.distanceM) * 1000),
    [splits],
  );

  const cmp = useMemo(() => {
    const mine = facts?.find((f) => f.id === runId);
    return mine && facts ? compare(mine, facts) : null;
  }, [facts, runId]);

  if (!run)
    return (
      <View style={styles.screen}>
        {missing && (
          <>
            <BackButton label={ui().runDetail.yourRuns} onPress={onBack} />
            <Text style={styles.gone}>{ui().runDetail.runGone}</Text>
          </>
        )}
      </View>
    );
  const line = cmp ? youVsYou(cmp, km) : null;

  const d = new Date(run.startedAt);
  const kmSplits = splits.filter((s) => s.kind === 'km');
  const laps = splits.filter((s) => s.kind === 'lap');
  const lastKm = kmSplits[kmSplits.length - 1];
  const tail = lastKm ? run.distanceM - lastKm.atDistanceM : run.distanceM;
  const tailDur = lastKm ? run.durationS - lastKm.atDurationS : run.durationS;
  const partial = tail > 20 ? { index: kmSplits.length + 1, distanceM: tail, durationS: tailDur } : null;

  async function changeMood(m: Mood | null) {
    if (!run) return;
    const before = run.moodAfter;
    setRun({ ...run, moodAfter: m });
    try {
      await setMoodAfter(runId, m);
    } catch {
      setRun({ ...run, moodAfter: before });
      Alert.alert(ui().runDetail.couldntSaveThat, ui().common.tryAgainInAMoment);
    }
  }

  async function saveNote() {
    if (!run || noteDraft == null) return;
    const next = noteDraft.trim() || null;
    if (next === (run.note ?? null)) return;
    try {
      await setRunNote(runId, next);
      setRun({ ...run, note: next });
      setNoteDraft(null);
    } catch {
      // What was typed stays in the box for another try.
      Alert.alert(ui().runDetail.couldntSaveThat, ui().common.tryAgainInAMoment);
    }
  }

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

  async function keepAsPlace(d: PlaceDraft) {
    if (!choice || keeping.current) return; // a second tap while saving makes no second place
    keeping.current = true;
    // The sheet stays open with what was typed until the place is really saved.
    try {
      const id = await placeFromRun(runId, d, choice.sig);
      setPlaceSheet(false);
      setPlace(await getPlace(id).catch(() => null));
      setChoice(null);
    } catch {
      Alert.alert(ui().runDetail.couldntSaveThat, ui().common.tryAgainInAMoment);
    } finally {
      keeping.current = false;
    }
  }

  async function addToMatch() {
    if (!choice?.match) return;
    try {
      await logRun(choice.match.id, runId);
      setPlace(choice.match);
      setChoice(null);
    } catch {
      // nothing changed
    }
  }

  async function saveFix() {
    if (!run || !fixing) return;
    const distanceM = parseDistance(fixing.distance, km);
    const durationS = parseDuration(fixing.time);
    const problem = checkCorrection(distanceM, durationS);
    if (problem || distanceM == null || durationS == null) {
      setFixing({ ...fixing, problem });
      return;
    }
    try {
      await correctRun(runId, distanceM, durationS);
      syncRunToHealth(runId).catch(() => {});
      setEdit(await getRunEdit(runId));
      setRun({ ...run, distanceM, durationS });
      setFixing(null);
      onChanged?.();
    } catch {
      Alert.alert(ui().runDetail.couldntSaveThat, ui().common.tryAgainInAMoment);
    }
  }

  async function putBack() {
    if (!run || !edit) return;
    try {
      await putBackRun(runId);
      syncRunToHealth(runId).catch(() => {});
      setRun({ ...run, distanceM: edit.distanceM, durationS: edit.durationS });
      setEdit(null);
      setFixing(null);
      onChanged?.();
    } catch {
      Alert.alert(ui().runDetail.couldntSaveThat, ui().common.tryAgainInAMoment);
    }
  }

  const fixProblem: Record<EntryProblem, string> = {
    distance: ui().addRun.problemDistance,
    duration: ui().addRun.problemDuration,
    tooFast: ui().addRun.problemTooFast,
    tooSlow: ui().addRun.problemTooSlow,
    future: ui().addRun.problemFuture,
    overlap: ui().addRun.problemOverlap,
  };

  function onDelete() {
    Alert.alert(ui().runDetail.deleteRun, ui().runDetail.thisCannotBeUndone, [
      { text: ui().runDetail.keep, style: 'cancel' },
      {
        text: ui().runDetail.delete,
        style: 'destructive',
        onPress: async () => {
          const fromHealth = await beforeDeleteForHealth(runId);
          await deleteRun(runId);
          await forgetRun(runId).catch(() => {});
          fromHealth().catch(() => {});
          onDeleted();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label={ui().runDetail.yourRuns} onPress={onBack} />
      <Text style={styles.date}>{d.toLocaleString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text>
      {source?.kind === 'manual' ? (
        <Text style={styles.source}>{ui().addRun.addedByHand}</Text>
      ) : source?.kind === 'watch' ? (
        <Text style={styles.source}>{ui().runDetail.onWatch}</Text>
      ) : indoor ? (
        <Text style={styles.source}>{ui().runAids.indoorTag}</Text>
      ) : source ? (
        <Text style={styles.source}>
          {ui().runDetail.broughtIn(source.kind === 'health' ? (source.fileName ? `${ui().runDetail.healthConnect} (${source.fileName})` : ui().runDetail.healthConnect) : source.fileName ?? ui().runDetail.aXFile(source.kind.toUpperCase()), new Date(source.importedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }))}
        </Text>
      ) : null}
      <BackHomeCard run={run} />
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
      ) : !place && choice ? (
        <Pressable
          onPress={choice.match ? () => void addToMatch() : () => setPlaceSheet(true)}
          accessibilityRole="button"
          accessibilityHint={choice.match ? ui().runDetail.addToXHint : undefined}
          hitSlop={8}
          style={({ pressed }) => [styles.placeLink, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.placeLinkText}>{choice.match ? ui().runDetail.addToX(choice.match.name) : ui().runDetail.saveAsAPlace}</Text>
        </Pressable>
      ) : null}
      <RouteMap path={path} height={260} />
      {line && <YouLine title={line.title.replace('\n', ' ')} detail={line.detail} />}
      <RunStatsView run={run} points={points} splits={kmSplits} laps={laps} partial={partial} sun={weather} km={km} heart={heart} />
      <DeepRunView points={points} kmPaces={kmPaces} heart={beats} maxHr={maxHr} km={km} climbM={run.elevationGainM} />
      {run.endedAt != null ? (
        fixing ? (
          <View style={styles.fix}>
            <Text style={styles.fixTitle} accessibilityRole="header">{ui().addRun.correctTitle}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fixLabel}>{ui().addRun.distanceIn(km ? 'km' : 'mi')}</Text>
                <TextInput value={fixing.distance} onChangeText={(t) => setFixing({ ...fixing, distance: t, problem: null })} keyboardType="decimal-pad" style={styles.fixInput} accessibilityLabel={ui().addRun.distanceIn(km ? 'km' : 'mi')} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fixLabel}>{ui().addRun.time}</Text>
                <TextInput value={fixing.time} onChangeText={(t) => setFixing({ ...fixing, time: t, problem: null })} keyboardType="numbers-and-punctuation" style={styles.fixInput} accessibilityLabel={ui().addRun.timeHint} />
              </View>
            </View>
            <Text style={type.small}>{ui().addRun.correctHint}</Text>
            {fixing.problem ? <Text style={styles.fixProblem} accessibilityLiveRegion="polite">{fixProblem[fixing.problem]}</Text> : null}
            <Button title={ui().addRun.saveCorrection} onPress={() => void saveFix()} />
            <Pressable onPress={() => setFixing(null)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={styles.clear}>{ui().addRun.cancel}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            {edit ? <Text style={type.small}>{ui().addRun.correctedWas(formatDistance(edit.distanceM, km), formatDuration(edit.durationS))}</Text> : null}
            <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
              <Pressable
                onPress={() => setFixing({ distance: distanceField(run.distanceM, km), time: durationField(run.durationS), problem: null })}
                accessibilityRole="button"
                hitSlop={8}
                style={styles.fixLink}
              >
                <Text style={styles.fixLinkText}>{ui().addRun.correctLink}</Text>
              </Pressable>
              {edit ? (
                <Pressable onPress={() => void putBack()} accessibilityRole="button" hitSlop={8} style={styles.fixLink}>
                  <Text style={styles.fixLinkText}>{ui().addRun.putBack}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )
      ) : null}
      {/* The reflection stays editable: energy can be changed or cleared, the note rewritten. */}
      {run.endedAt != null ? (
        <View style={{ gap: spacing.xs }}>
          <MoodPicker title={run.moodAfter == null ? ui().runDetail.andYourEnergyNow : ui().runDetail.energyAfter} value={run.moodAfter} onChange={(m: Mood) => void changeMood(m)} />
          {run.moodAfter != null ? (
            <Pressable onPress={() => void changeMood(null)} accessibilityRole="button" accessibilityHint={ui().runDetail.clearEnergyHint} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
              <Text style={styles.clear}>{ui().runDetail.clearEnergy}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {run.endedAt != null ? (
        <TextInput
          style={styles.note}
          value={noteDraft ?? run.note ?? ''}
          onChangeText={setNoteDraft}
          onEndEditing={() => void saveNote()}
          placeholder={ui().runDetail.aNoteIfYouWant}
          placeholderTextColor={colors.muted}
          accessibilityLabel={ui().runDetail.aNoteIfYouWant}
          multiline
        />
      ) : run.note ? (
        <Text style={styles.note}>{run.note}</Text>
      ) : null}
      {run.endedAt != null ? <RunKit run={run} km={km} /> : null}
      {cmp && <Button title={ui().runDetail.shareWithSomeone} variant="secondary" onPress={() => setSharing(true)} style={{ marginTop: spacing.sm }} />}
      {path.length > 1 && onFollow ? (
        <Button
          title={ui().routes.followThisRoute}
          variant="secondary"
          onPress={() => onFollow(new Date(run.startedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }), path)}
        />
      ) : null}
      {path.length > 1 ? <Button title={saving ? ui().runDetail.saving : ui().runDetail.saveAsGpx} variant="secondary" onPress={onSaveGpx} disabled={saving} /> : null}
      <Button title={ui().runDetail.deleteRun2} variant="danger" onPress={onDelete} style={{ marginTop: spacing.lg }} />
      {choice && !choice.match ? (
        <SavePlaceSheet open={placeSheet} sig={choice.sig} initial={{ name: suggestName(run.startedAt), tags: [] }} onSave={(d) => void keepAsPlace(d)} onClose={() => setPlaceSheet(false)} />
      ) : null}
      {cmp && <ShareSheet visible={sharing} onClose={() => setSharing(false)} run={run} path={path} cmp={cmp} weather={weather} km={km} />}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  source: { ...type.small, marginTop: -spacing.sm },
  date: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  place: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', backgroundColor: colors.mint, borderRadius: radius.pill, paddingHorizontal: 14 },
  placeLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  placeLinkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep, textDecorationLine: 'underline' },
  placeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep },
  gone: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text, marginTop: spacing.md },
  fix: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  fixTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  fixLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  fixInput: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.cream, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  fixProblem: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.peachDeep },
  fixLink: { minHeight: 36, justifyContent: 'center' },
  fixLinkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textDecorationLine: 'underline' },
  clear: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  note: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22, backgroundColor: colors.butter, borderRadius: radius.lg, padding: spacing.md },
}));
