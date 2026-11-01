import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { LockRow } from '../components/LockRow';
import { lastWhen } from '../components/PlacesList';
import { RouteMap } from '../components/RouteMap';
import { SavePlaceSheet } from '../components/SavePlaceSheet';
import { formatDistance, formatPace } from '../geo';
import { BUSY_LABEL, byMonth, latestNote, placeSummary, quietPatterns, tagLabel } from '../places';
import { deletePlace, getPlace, placeVisits, updatePlace, type Place, type PlaceVisit } from '../placeStore';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import type { LatLon } from '../types';
import { useUnlocked } from '../unlockState';
import { ui } from '../i18n/ui';
import { dateLocale } from '../i18n/lang';

/**
 * One of your places: its loop, your notes as tags, every dated note on how
 * busy you found it, and "Run this again". Keeping a place and its log are
 * free; what months of notes add up to ("when it's usually quiet here") comes
 * with Everything, once.
 */
export function PlaceScreen({
  placeId,
  onBack,
  onChanged,
  onRunAgain,
  onOpenRun,
}: {
  placeId: number;
  onBack: () => void;
  onChanged: () => void;
  onRunAgain: (p: Place) => void;
  /** A run in the dated list was tapped. */
  onOpenRun?: (runId: number) => void;
}) {
  const km = useSettings().settings.unitsKm;
  const unlocked = useUnlocked();
  const [place, setPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getPlace(placeId), placeVisits(placeId)])
      .then(([p, v]) => {
        if (!alive) return;
        setPlace(p);
        setVisits(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [placeId]);

  const path: LatLon[] = useMemo(() => (place ? place.sig.pts.map(([latitude, longitude]) => ({ latitude, longitude })) : []), [place]);
  const summary = useMemo(() => (place ? placeSummary(visits, place.distanceM) : null), [visits, place]);
  const lastNote = useMemo(() => latestNote(visits), [visits]);
  const months = useMemo(() => byMonth(visits), [visits]);
  const patterns = useMemo(() => (unlocked ? quietPatterns(visits) : []), [visits, unlocked]);

  if (!place || !summary) {
    return (
      <View style={styles.screen}>
        <BackButton label={ui().place.yourPlaces} onPress={onBack} />
      </View>
    );
  }

  // Imported runs can go back years: say the year whenever it isn't this one.
  const since = summary.since
    ? new Date(summary.since).toLocaleDateString(dateLocale(), new Date(summary.since).getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  // Runs brought in from elsewhere carry no notes: then the list is simply every run here.
  const anyNotes = visits.some((v) => v.busy || v.note?.trim());
  const facts = [
    summary.count === 1 ? ui().place.runOnce : ui().place.runXTimes(summary.count),
    since ? ui().place.since(since) : null,
    summary.bestPace ? ui().place.quickestXX(formatPace(1000, summary.bestPace, km), km ? 'km' : 'mi') : null,
  ];
  const factLine = facts.filter(Boolean).join(' · ');

  function forget() {
    Alert.alert(ui().place.forgetX(place!.name), ui().place.thePlaceAndItsNotes, [
      { text: ui().place.keepIt, style: 'cancel' },
      {
        text: ui().place.forget,
        style: 'destructive',
        onPress: async () => {
          // Only leave once it is really gone.
          try {
            await deletePlace(placeId);
          } catch {
            Alert.alert(ui().place.couldntForgetIt, ui().common.tryAgainInAMoment);
            return;
          }
          setEditing(false);
          onChanged();
          onBack();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.topRow}>
          <BackButton label={ui().place.yourPlaces} onPress={onBack} />
          <Button title={ui().place.edit} variant="secondary" onPress={() => setEditing(true)} style={styles.edit} />
        </View>
        <RouteMap path={path} height={190} interactive={false} />
        <Text style={type.h1} accessibilityRole="header">
          {place.name}
        </Text>
        {place.tags.length ? (
          <View style={styles.tags} accessibilityLabel={ui().place.yourNotesX(place.tags.map(tagLabel).join(', '))}>
            {place.tags.map((t) => (
              <Text key={t} style={styles.tag}>
                {tagLabel(t)}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.facts}>
          {formatDistance(place.distanceM, km)} · {factLine}
        </Text>

        {/* The warmth is the runner's own words, not a line the app made up. */}
        {lastNote ? (
          <View style={styles.lastNote} accessible accessibilityLabel={`${ui().place.yourLastNote}, ${new Date(lastNote.at).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}: ${lastNote.note}`}>
            <Text style={type.eyebrow}>{ui().place.yourLastNote}</Text>
            <Text style={styles.lastNoteText}>{lastNote.note!.trim()}</Text>
            <Text style={type.small}>{new Date(lastNote.at).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          </View>
        ) : null}

        <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">{anyNotes ? ui().place.yourNotesDated : ui().place.everyRunHere}</Text>
        <View>
          {visits.length === 0 ? <Text style={type.small}>{ui().place.nothingYetEachRunHere}</Text> : null}
          {months.map((m) => (
            <View key={`${m.year}-${m.month}`}>
              <Text style={styles.month} accessibilityRole="header">
                {monthLabel(m.year, m.month)}
              </Text>
          {m.visits.map((v) => {
            const when = new Date(v.at);
            const label = `${when.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })} ${when.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`;
            const run = v.distanceM && v.durationS ? `${formatDistance(v.distanceM, km)} · ${formatPace(v.distanceM, v.durationS, km)} /${km ? 'km' : 'mi'}` : null;
            const busy = v.busy ? BUSY_LABEL[v.busy] : null;
            const note = v.note?.trim() || null;
            const body = (
              <>
                {/* Date and the run on one line; how busy and the note under them, only when there is one. Never a bare dash. */}
                <View style={styles.logHead}>
                  <Text style={styles.logWhen}>{label}</Text>
                  {run ? <Text style={styles.logRun}>{run}</Text> : null}
                </View>
                {busy ? <Text style={styles.logBusy}>{busy}</Text> : null}
                {note ? <Text style={styles.logNote}>{note}</Text> : null}
              </>
            );
            const a11y = [label, run, busy, note].filter(Boolean).join('. ');
            return v.runId != null && onOpenRun ? (
              <Pressable
                key={v.id}
                onPress={() => onOpenRun(v.runId!)}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                accessibilityHint={ui().history.opensThisRun}
                style={({ pressed }) => [styles.log, pressed && { opacity: 0.7 }]}
              >
                {body}
              </Pressable>
            ) : (
              <View key={v.id} style={styles.log} accessible accessibilityLabel={a11y}>
                {body}
              </View>
            );
          })}
            </View>
          ))}
        </View>

        <LockRow title={ui().place.whenItSUsuallyQuiet} detail={ui().place.readFromMonthsOfYour} />
        {unlocked ? (
          <View style={styles.patterns}>
            <Text style={type.eyebrow} accessibilityRole="header">{ui().place.whenItSUsuallyQuiet}</Text>
            {patterns.length ? (
              patterns.map((p) => (
                <Text key={p.text} style={styles.pattern}>
                  {p.text}
                </Text>
              ))
            ) : (
              <Text style={type.small}>{ui().place.threeOrMoreNotesAt}</Text>
            )}
            <Text style={type.small}>{ui().place.fromYourOwnNotesOnly}</Text>
          </View>
        ) : null}

        <Button title={ui().place.runThisAgain} onPress={() => onRunAgain(place)} style={{ marginTop: spacing.sm }} />
        {summary.last ? <Text style={[type.small, { textAlign: 'center' }]}>{ui().place.lastRunX(lastWhen(summary.last.at))}</Text> : null}
      </ScrollView>
      <SavePlaceSheet
        open={editing}
        sig={place.sig}
        initial={{ name: place.name, tags: place.tags }}
        onClose={() => setEditing(false)}
        onDelete={forget}
        onSave={async (d) => {
          // The sheet stays open with what was typed until the change is really saved.
          try {
            await updatePlace(placeId, d);
          } catch {
            Alert.alert(ui().place.couldntSaveTheChange, ui().common.tryAgainInAMoment);
            return;
          }
          setPlace({ ...place, ...d });
          setEditing(false);
          onChanged();
        }}
      />
    </View>
  );
}

/** "October 2026", capitalised for languages that write months in lower case. */
function monthLabel(year: number, month: number): string {
  const t = new Date(year, month, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const styles = themedStyles(() => ({
  screen: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, backgroundColor: colors.cream, flexGrow: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  edit: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.xs },
  tag: { fontFamily: fonts.body, fontSize: 13, color: colors.mintDeep, backgroundColor: colors.mintSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  facts: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  log: { gap: 4, minHeight: 44, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  logHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 2 },
  logRun: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  logWhen: { flexShrink: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  logBusy: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.text },
  logNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  lastNote: { gap: 4, backgroundColor: colors.butter, borderRadius: radius.lg, padding: spacing.md },
  lastNoteText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  month: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, paddingTop: spacing.sm, paddingBottom: 2 },
  patterns: { gap: spacing.sm, backgroundColor: colors.lilacSoft, borderRadius: radius.md, padding: spacing.md },
  pattern: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
}));
