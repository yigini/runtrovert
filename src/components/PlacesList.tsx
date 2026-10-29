import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistance } from '../geo';
import { BUSY_LABEL } from '../places';
import { listPlaces, recentVisits, type Place, type PlaceVisit } from '../placeStore';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Quiet } from '../types';
import { RouteShape } from './RouteShape';
import { ui } from '../i18n/ui';

const BAR: Record<Quiet, number> = { empty: 6, some: 12, crowded: 20 };

/** Your runs › Places: the loops you chose to keep, newest run first. */
export function PlacesList({ km, refreshKey, header, onOpen, onRunAgain }: { km: boolean; refreshKey: number; header: React.ReactElement; onOpen: (id: number) => void; onRunAgain: (p: Place) => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [recent, setRecent] = useState<Map<number, PlaceVisit[]>>(new Map());
  useEffect(() => {
    let alive = true;
    Promise.all([listPlaces(), recentVisits()])
      .then(([p, r]) => {
        if (!alive) return;
        setPlaces(p);
        setRecent(r);
      })
      .catch(() => alive && setPlaces([]));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <FlatList
      data={places ?? []}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
          {header}
          <Text style={type.small}>{ui().placesList.placesYouChoseToKeep}</Text>
        </View>
      }
      ListEmptyComponent={
        places ? (
          <View style={styles.empty}>
            <Text style={type.h2}>{ui().placesList.noPlacesYet}</Text>
            <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{ui().placesList.runTheSameLoopA}</Text>
          </View>
        ) : undefined
      }
      contentContainerStyle={{ gap: spacing.sm + 2, paddingBottom: spacing.xl }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => <PlaceRow place={item} visits={recent.get(item.id) ?? []} km={km} onOpen={() => onOpen(item.id)} onRunAgain={() => onRunAgain(item)} />}
    />
  );
}

function PlaceRow({ place, visits, km, onOpen, onRunAgain }: { place: Place; visits: PlaceVisit[]; km: boolean; onOpen: () => void; onRunAgain: () => void }) {
  const last = visits[0];
  const lastLine = last ? ui().placesList.lastRunXX(lastWhen(last.at), last.busy ? ` · ${BUSY_LABEL[last.busy].toLowerCase()}` : '') : ui().placesList.notRunSinceYouKept;
  const rated = visits.filter((v) => v.busy).reverse(); // oldest first, left to right
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${place.name}, ${formatDistance(place.distanceM, km)}. ${place.tags.join(', ')}. ${lastLine}.`} accessibilityHint={ui().placesList.opensThisPlace} style={({ pressed }) => [styles.top, pressed && { opacity: 0.85 }]}>
        <RouteShape sig={place.sig} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{place.name}</Text>
          <Text style={type.small}>{formatDistance(place.distanceM, km)}</Text>
        </View>
      </Pressable>
      {place.tags.length ? (
        <View style={styles.tags}>
          {place.tags.map((t) => (
            <Text key={t} style={styles.tag}>
              {t}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.bottom}>
        <View style={{ flex: 1 }}>
          <Text style={type.small}>{lastLine}</Text>
          {rated.length > 1 ? (
            <View style={styles.bars} accessible accessibilityLabel={ui().placesList.howBusyYouFoundIt(rated.length, rated.map((v) => BUSY_LABEL[v.busy as Quiet].toLowerCase()).join(', '))}>
              {rated.map((v) => (
                <View key={v.id} style={[styles.bar, { height: BAR[v.busy as Quiet], backgroundColor: v.busy === 'crowded' ? colors.skyDeep : colors.sky }]} />
              ))}
            </View>
          ) : null}
        </View>
        <Pressable onPress={onRunAgain} accessibilityRole="button" accessibilityLabel={ui().placesList.runXAgain(place.name)} style={({ pressed }) => [styles.again, pressed && { opacity: 0.85 }]}>
          <Text style={styles.againText}>{ui().placesList.runThisAgain}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function lastWhen(at: number): string {
  const d = new Date(at);
  const days = (Date.now() - at) / 86400000;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days < 6.5) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontFamily: fonts.body, fontSize: 12, color: colors.mintDeep, backgroundColor: colors.mintSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 22, marginTop: 6 },
  bar: { width: 14, borderRadius: 4 },
  again: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.ink, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  againText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
});
