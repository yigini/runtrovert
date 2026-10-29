import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { LockRow } from '../components/LockRow';
import { lastWhen } from '../components/PlacesList';
import { RouteMap } from '../components/RouteMap';
import { SavePlaceSheet } from '../components/SavePlaceSheet';
import { formatDistance, formatPace } from '../geo';
import { BUSY_LABEL, placeSummary, quietPatterns } from '../places';
import { deletePlace, getPlace, placeVisits, updatePlace, type Place, type PlaceVisit } from '../placeStore';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { LatLon } from '../types';
import { useUnlocked } from '../unlockState';

/**
 * One of your places: its loop, your notes as tags, every dated note on how
 * busy you found it, and "Run this again". Keeping a place and its log are
 * free; what months of notes add up to ("when it's usually quiet here") comes
 * with Everything, once.
 */
export function PlaceScreen({ placeId, onBack, onChanged, onRunAgain }: { placeId: number; onBack: () => void; onChanged: () => void; onRunAgain: (p: Place) => void }) {
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
  const patterns = useMemo(() => (unlocked ? quietPatterns(visits) : []), [visits, unlocked]);

  if (!place || !summary) {
    return (
      <View style={styles.screen}>
        <BackButton label="Your places" onPress={onBack} />
      </View>
    );
  }

  const since = summary.since ? new Date(summary.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  const facts = [
    summary.count === 1 ? 'Run once' : `Run ${summary.count} times`,
    since ? `since ${since}` : null,
    summary.bestPace ? `quickest ${formatPace(1000, summary.bestPace, km)} /${km ? 'km' : 'mi'}` : null,
  ];
  const factLine = facts.filter(Boolean).join(' · ');

  function forget() {
    Alert.alert(`Forget ${place!.name}?`, 'The place and its notes go. Your runs stay.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          await deletePlace(placeId).catch(() => {});
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
          <BackButton label="Your places" onPress={onBack} />
          <Button title="Edit" variant="secondary" onPress={() => setEditing(true)} style={styles.edit} />
        </View>
        <RouteMap path={path} height={190} interactive={false} />
        <Text style={type.h1} accessibilityRole="header">
          {place.name}
        </Text>
        {place.tags.length ? (
          <View style={styles.tags} accessibilityLabel={`Your notes: ${place.tags.join(', ')}`}>
            {place.tags.map((t) => (
              <Text key={t} style={styles.tag}>
                {t}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.facts}>
          {formatDistance(place.distanceM, km)} · {factLine}
        </Text>

        <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">
          Your notes, dated
        </Text>
        <View>
          {visits.length === 0 ? <Text style={type.small}>Nothing yet. Each run here adds a line.</Text> : null}
          {visits.map((v) => {
            const when = new Date(v.at);
            const label = `${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
            return (
              <View key={v.id} style={styles.log} accessible accessibilityLabel={[label, v.busy ? BUSY_LABEL[v.busy] : 'no rating', v.note].filter(Boolean).join('. ')}>
                <Text style={styles.logWhen}>{label}</Text>
                <Text style={styles.logBusy}>{v.busy ? BUSY_LABEL[v.busy] : '–'}</Text>
                <Text style={styles.logNote} numberOfLines={2}>
                  {v.note ?? ''}
                </Text>
              </View>
            );
          })}
        </View>

        <LockRow title="When it’s usually quiet here" detail="Read from months of your notes. Everything, once." />
        {unlocked ? (
          <View style={styles.patterns}>
            <Text style={type.eyebrow} accessibilityRole="header">
              When it’s usually quiet here
            </Text>
            {patterns.length ? (
              patterns.map((p) => (
                <Text key={p.text} style={styles.pattern}>
                  {p.text}
                </Text>
              ))
            ) : (
              <Text style={type.small}>Three or more notes at the same day and time make a pattern. Keep noting how busy it is.</Text>
            )}
            <Text style={type.small}>From your own notes only. Not a promise about who’ll be there next time.</Text>
          </View>
        ) : null}

        <Button title="Run this again" onPress={() => onRunAgain(place)} style={{ marginTop: spacing.sm }} />
        {summary.last ? <Text style={[type.small, { textAlign: 'center' }]}>Last run {lastWhen(summary.last.at)}</Text> : null}
      </ScrollView>
      <SavePlaceSheet
        open={editing}
        sig={place.sig}
        initial={{ name: place.name, tags: place.tags }}
        onClose={() => setEditing(false)}
        onDelete={forget}
        onSave={async (d) => {
          await updatePlace(placeId, d).catch(() => {});
          setPlace({ ...place, ...d });
          setEditing(false);
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, backgroundColor: colors.cream, flexGrow: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  edit: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.xs },
  tag: { fontFamily: fonts.body, fontSize: 13, color: colors.mintDeep, backgroundColor: colors.mintSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  facts: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  log: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e4dccf' },
  logWhen: { width: 118, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  logBusy: { width: 104, fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.text },
  logNote: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  patterns: { gap: spacing.sm, backgroundColor: colors.lilacSoft, borderRadius: radius.md, padding: spacing.md },
  pattern: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
