import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { spokenDistance, spokenDuration, spokenPace } from '../a11y';
import { patternFormat, PatternsView } from '../components/PatternsView';
import { PlacesList } from '../components/PlacesList';
import { SettingsGear } from '../components/SettingsGear';
import { YouSection } from '../components/YouSection';
import { distanceUnit, formatDistance, formatDistanceNumber, formatDuration, formatPace } from '../geo';
import { energyPatterns, groupRuns, monthSummary } from '../patterns';
import { loadYourRuns, patternRuns, type YourRunsData } from '../patternStore';
import { BUSY_LABEL } from '../places';
import type { Place } from '../placeStore';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Quiet, Run } from '../types';
import { ui } from '../i18n/ui';
import { dateLocale, monthName, upperFirst } from '../i18n/lang';

const QUIET_BG: Record<Quiet, string> = { crowded: colors.peach, some: colors.butter, empty: colors.mint };
const QUIET_FG: Record<Quiet, string> = { crowded: colors.peachDeep, some: colors.butterDeep, empty: colors.mintDeep };

/** Your runs is split in three: every run, the places you kept, and patterns in your own answers. */
export type RunsSection = 'runs' | 'places' | 'patterns';

export function HistoryScreen({
  onOpen,
  refreshKey,
  section = 'runs',
  onSection,
  onOpenPlace,
  onRunAgain,
  onBringIn,
}: {
  onOpen: (runId: number) => void;
  refreshKey: number;
  section?: RunsSection;
  onSection?: (s: RunsSection) => void;
  onOpenPlace?: (id: number) => void;
  onRunAgain?: (p: Place) => void;
  onBringIn?: () => void;
}) {
  const km = useSettings().settings.unitsKm;
  const [data, setData] = useState<YourRunsData | null>(null);
  const load = useCallback(async () => setData(await loadYourRuns()), []);
  useEffect(() => {
    load().catch(() => setData({ runs: [], placeOf: new Map(), places: [] }));
  }, [load, refreshKey]);

  const now = Date.now();
  const runs = data?.runs ?? [];
  const names = useMemo(() => new Map((data?.places ?? []).map((p) => [p.id, p.name])), [data]);
  const groups = useMemo(() => groupRuns(runs, now), [runs]);
  const patterns = useMemo(() => (data ? energyPatterns(patternRuns(data), data.places, now, patternFormat(km)) : null), [data, km]);

  const title = (
    <View style={{ gap: spacing.sm + 4 }}>
      <View style={styles.topRow}>
        <Text style={type.h1} accessibilityRole="header">{ui().history.yourRuns}</Text>
        <SettingsGear />
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

  if (section === 'patterns') {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
          {title}
          <PatternsView patterns={patterns} />
        </ScrollView>
      </View>
    );
  }

  const month = monthSummary(runs, now);
  const thisMonth = upperFirst(monthName(now));
  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
      {title}
      <View
        style={styles.month}
        accessible
        accessibilityLabel={ui().history.monthSoFarSpoken(thisMonth, month.runs, spokenDistance(month.distanceM, km), spokenDuration(month.durationS))}
      >
        <Text style={[type.eyebrow, styles.monthTitle]}>{ui().history.monthSoFar(thisMonth)}</Text>
        <Stat value={String(month.runs)} label={ui().history.runsLabel(month.runs)} />
        <Stat value={month.runs ? formatDistanceNumber(month.distanceM, km) : '0'} label={distanceUnit(km)} />
        <Stat value={hoursMinutes(month.durationS)} label={ui().history.running} />
      </View>
      <YouSection km={km} refreshKey={refreshKey} />
    </View>
  );

  if (data && runs.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.empty}>
          <Text style={type.h2}>{ui().history.noRunsYet}</Text>
          <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{ui().history.yourRunsWillStayOn}</Text>
          {onBringIn ? (
            <Pressable onPress={onBringIn} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.bringIn, pressed && { opacity: 0.8 }]}>
              <Text style={styles.bringInText}>{ui().history.bringRunsInFromA}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groups}
        keyExtractor={(r) => String(r.id)}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: s }) => (
          <Text style={[type.eyebrow, styles.groupTitle]} accessibilityRole="header">
            {s.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm + 2 }} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const pid = data?.placeOf.get(item.id);
          return <RunRow run={item} km={km} place={pid != null ? names.get(pid) ?? null : null} onPress={() => onOpen(item.id)} />;
        }}
      />
    </View>
  );
}

/** "5 h 12", "48 min", "0 min". */
function hoursMinutes(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function Sections({ value, onChange }: { value: RunsSection; onChange: (s: RunsSection) => void }) {
  const items: Array<{ key: RunsSection; label: string }> = [
    { key: 'runs', label: ui().history.runs },
    { key: 'places', label: ui().history.places },
    { key: 'patterns', label: ui().history.patterns },
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
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RunRow({ run, km, place, onPress }: { run: Run; km: boolean; place: string | null; onPress: () => void }) {
  const d = new Date(run.startedAt);
  const date = d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  const delta = run.moodBefore != null && run.moodAfter != null ? run.moodAfter - run.moodBefore : null;
  const q = run.quiet;
  const busy = q ? BUSY_LABEL[q].toLowerCase() : null;
  const bg = q ? QUIET_BG[q] : colors.lilac;
  const fg = q ? QUIET_FG[q] : colors.lilacDeep;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={ui().history.opensThisRun}
      accessibilityLabel={[
        `${d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}, ${time}`,
        place,
        `${spokenDistance(run.distanceM, km)} in ${spokenDuration(run.durationS)}`,
        spokenPace(run.distanceM, run.durationS, km),
        delta != null ? `energy ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady'}${delta ? ` ${Math.abs(delta)}` : ''}` : null,
        busy,
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
          {place ? ` · ${place}` : busy ? ` · ${busy}` : ''}
        </Text>
        <Text style={styles.rowMain}>
          {formatDistance(run.distanceM, km)} · {formatDuration(run.durationS)}
        </Text>
        <Text style={styles.rowSub}>
          {formatPace(run.distanceM, run.durationS, km)} /{km ? 'km' : 'mi'}
          {delta != null ? ui().history.energy(delta) : ''}
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 },
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  seg: { flexDirection: 'row', backgroundColor: '#ece5da', borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.white },
  segText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  segTextOn: { color: colors.text },
  month: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 18, rowGap: 8 },
  monthTitle: { width: '100%' },
  stat: { flex: 1 },
  statValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  groupTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  bringIn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  bringInText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep, textDecorationLine: 'underline', textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, padding: 16 },
  thumb: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { fontFamily: fonts.bodySemi, fontSize: 12 },
  rowMain: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
});
