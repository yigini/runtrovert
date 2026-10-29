import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { spokenDistance, spokenDuration, spokenPace } from '../a11y';
import { PlacesList } from '../components/PlacesList';
import { SettingsGear } from '../components/SettingsGear';
import { YouSection } from '../components/YouSection';
import { listRuns } from '../db';
import { formatDistance, formatDuration, formatPace } from '../geo';
import type { Place } from '../placeStore';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Quiet, Run } from '../types';

const QUIET_LABEL: Record<Quiet, string> = { crowded: 'crowded', some: 'some people', empty: 'empty' };
const QUIET_BG: Record<Quiet, string> = { crowded: colors.peach, some: colors.butter, empty: colors.mint };
const QUIET_FG: Record<Quiet, string> = { crowded: colors.peachDeep, some: colors.butterDeep, empty: colors.mintDeep };

/** Your runs is split in sections; Places is the runner's own route memory. */
export type RunsSection = 'runs' | 'places';

export function HistoryScreen({
  onOpen,
  refreshKey,
  section = 'runs',
  onSection,
  onOpenPlace,
  onRunAgain,
}: {
  onOpen: (runId: number) => void;
  refreshKey: number;
  section?: RunsSection;
  onSection?: (s: RunsSection) => void;
  onOpenPlace?: (id: number) => void;
  onRunAgain?: (p: Place) => void;
}) {
  const km = useSettings().settings.unitsKm;
  const [runs, setRuns] = useState<Run[]>([]);
  const load = useCallback(async () => setRuns(await listRuns()), []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const now = new Date();
  const month = runs.filter((r) => new Date(r.startedAt).getMonth() === now.getMonth() && new Date(r.startedAt).getFullYear() === now.getFullYear());
  const monthM = month.reduce((a, r) => a + r.distanceM, 0);
  const monthS = month.reduce((a, r) => a + r.durationS, 0);
  const emptyCount = month.filter((r) => r.quiet === 'empty').length;

  const title = (
    <View style={{ gap: spacing.sm + 4 }}>
      <View>
        <View style={styles.topRow}>
          <Text style={type.eyebrow}>{now.toLocaleDateString(undefined, { month: 'long' })}</Text>
          <SettingsGear />
        </View>
        <Text style={type.h1} accessibilityRole="header">Your runs.</Text>
      </View>
      {onSection ? <Sections value={section} onChange={onSection} /> : null}
    </View>
  );

  if (section === 'places') {
    return (
      <View style={styles.screen}>
        <PlacesList km={km} refreshKey={refreshKey} header={title} onOpen={(id) => onOpenPlace?.(id)} onRunAgain={(p) => onRunAgain?.(p)} />
      </View>
    );
  }

  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
      {title}
      <View style={styles.tiles}>
        <Stat value={formatDistance(monthM, km).replace(/ .*/, '')} label={`${km ? 'km' : 'mi'} this month`} />
        <Stat value={formatPace(monthM, monthS, km)} label={`avg /${km ? 'km' : 'mi'}`} />
        <Stat value={month.length ? `${emptyCount} / ${month.length}` : '—'} label="empty routes" />
      </View>
      <YouSection km={km} refreshKey={refreshKey} />
    </View>
  );

  if (runs.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.empty}>
          <Text style={type.h2}>No runs yet.</Text>
          <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>Your runs will stay on this phone. Nobody else sees them.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={runs}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ gap: spacing.sm + 2, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <RunRow run={item} km={km} onPress={() => onOpen(item.id)} />}
      />
    </View>
  );
}

function Sections({ value, onChange }: { value: RunsSection; onChange: (s: RunsSection) => void }) {
  const items: Array<{ key: RunsSection; label: string }> = [
    { key: 'runs', label: 'Runs' },
    { key: 'places', label: 'Places' },
  ];
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.segItem, on && styles.segOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value === '—' || value === '–' ? 'none yet' : value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RunRow({ run, km, onPress }: { run: Run; km: boolean; onPress: () => void }) {
  const d = new Date(run.startedAt);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const delta = run.moodBefore != null && run.moodAfter != null ? run.moodAfter - run.moodBefore : null;
  const q = run.quiet;
  const bg = q ? QUIET_BG[q] : colors.lilac;
  const fg = q ? QUIET_FG[q] : colors.lilacDeep;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens this run"
      accessibilityLabel={[
        `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${time}`,
        `${spokenDistance(run.distanceM, km)} in ${spokenDuration(run.durationS)}`,
        spokenPace(run.distanceM, run.durationS, km),
        delta != null ? `energy ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady'}${delta ? ` ${Math.abs(delta)}` : ''}` : null,
        q ? `${QUIET_LABEL[q]} route` : null,
      ]
        .filter(Boolean)
        .join('. ')}
      style={({ pressed }) => [styles.row, { backgroundColor: bg }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.thumb}>
        <Svg viewBox="0 0 32 32" width={32} height={32}>
          <Path d={shapeFor(run.id)} stroke={fg} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowMeta, { color: fg }]}>
          {date} · {time}
          {q ? ` · ${QUIET_LABEL[q]}` : ''}
        </Text>
        <Text style={styles.rowMain}>
          {formatDistance(run.distanceM, km)} · {formatDuration(run.durationS)}
        </Text>
        <Text style={styles.rowSub}>
          {formatPace(run.distanceM, run.durationS, km)} /{km ? 'km' : 'mi'}
          {delta != null ? ` · energy ${delta > 0 ? '+' : ''}${delta}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** A little abstract route glyph per run so the list isn't a wall of identical cards. */
function shapeFor(id: number): string {
  const shapes = [
    'M6 22 C 10 10, 22 8, 26 18 S 14 28, 6 22 Z',
    'M4 24 C 10 20, 12 8, 20 10 S 26 24, 28 26',
    'M6 8 C 14 6, 24 14, 26 24 S 10 28, 6 8 Z',
    'M4 16 H 28 M8 10 H 24 M8 22 H 24',
    'M6 26 L 12 8 L 18 22 L 24 6 L 28 26',
  ];
  return shapes[id % shapes.length];
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -10, marginRight: -10 },
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  seg: { flexDirection: 'row', backgroundColor: '#ece5da', borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.white },
  segText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  segTextOn: { color: colors.text },
  tiles: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 12 },
  statValue: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  statLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, padding: 16 },
  thumb: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { fontFamily: fonts.bodySemi, fontSize: 12 },
  rowMain: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
});
