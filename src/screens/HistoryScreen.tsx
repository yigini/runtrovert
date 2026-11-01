import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { spokenDistance, spokenDuration, spokenPace } from '../a11y';
import { PlacesList } from '../components/PlacesList';
import { SettingsGear } from '../components/SettingsGear';
import { distanceUnit, formatDistance, formatDistanceNumber, formatDuration, formatPace } from '../geo';
import { groupRuns, monthSummary } from '../patterns';
import { loadYourRuns, type YourRunsData } from '../patternStore';
import { BUSY_LABEL } from '../places';
import type { Place } from '../placeStore';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type, themedStyles, themed } from '../theme';
import type { Quiet, Run } from '../types';
import type { CommuteDir } from '../commute';
import { commuteTags, useCommute } from '../commuteStore';
import { LoadFailed } from '../components/LoadFailed';
import { AddRunSheet } from '../components/AddRunSheet';
import { filterParts, RunFilterSheet } from '../components/RunFilterSheet';
import { activeCount, applyFilter, choicesFor, isEmpty, NO_FILTER, originOf, tidy, totalsOf, type FilterRun, type Names, type RunFilter } from '../runFilter';
import { useShoes } from '../shoeStore';
import { loadPlan } from '../training/store';
import { ui } from '../i18n/ui';
import { dateLocale, lang, monthName, upperFirst } from '../i18n/lang';

const QUIET_BG: Record<Quiet, string> = themed(() => ({ crowded: colors.peach, some: colors.butter, empty: colors.mint }));
const QUIET_FG: Record<Quiet, string> = themed(() => ({ crowded: colors.peachDeep, some: colors.butterDeep, empty: colors.mintDeep }));

/** Your runs is the record: every run, and the places you kept. Bests, trends and patterns live in Me. */
export type RunsSection = 'runs' | 'places';

export function HistoryScreen({
  onOpen,
  refreshKey,
  section = 'runs',
  onSection,
  onOpenPlace,
  onRunAgain,
  onBringIn,
  onChanged,
}: {
  onOpen: (runId: number) => void;
  refreshKey: number;
  section?: RunsSection;
  onSection?: (s: RunsSection) => void;
  onOpenPlace?: (id: number) => void;
  onRunAgain?: (p: Place) => void;
  onBringIn?: () => void;
  /** A run was added here by hand. */
  onChanged?: () => void;
}) {
  const { settings, update } = useSettings();
  const km = settings.unitsKm;
  const [data, setData] = useState<YourRunsData | null>(null);
  const load = useCallback(async () => setData(await loadYourRuns()), []);
  // Runs between home and work, tagged softly. Empty until both are set in Settings.
  const commute = useCommute();
  const [tags, setTags] = useState<Map<number, CommuteDir>>(new Map());
  // A failed read keeps whatever was shown before, and never pretends there are no runs.
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    load()
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [load, refreshKey, tries]);
  useEffect(() => {
    if (commute) commuteTags(commute).then(setTags).catch(() => {});
  }, [commute, refreshKey]);

  const now = Date.now();
  const runs = data?.runs ?? [];
  const names = useMemo(() => new Map((data?.places ?? []).map((p) => [p.id, p.name])), [data]);
  // Every row's words are worked out once per load, not while scrolling.
  const language = lang();
  const rows = useMemo(() => {
    const toWork = ui().commute.tagToWork;
    const home = ui().commute.tagHome;
    return runs.map((r) => {
      const pid = data?.placeOf.get(r.id);
      const dir = tags.get(r.id);
      return rowModel(r, km, pid != null ? names.get(pid) ?? null : null, dir ? (dir === 'toWork' ? toWork : home) : null);
    });
  }, [runs, km, names, tags, data, language]);
  // Filter: closed by default. The facts it reads are gathered once per load.
  const [filter, setFilter] = useState<RunFilter>(NO_FILTER);
  const [filtering, setFiltering] = useState(false);
  const book = useShoes();
  const [planRuns, setPlanRuns] = useState<Set<number>>(new Set());
  useEffect(() => {
    loadPlan()
      .then((p) => setPlanRuns(new Set((p?.weeks ?? []).flatMap((w) => w.sessions.map((x) => x.done?.runId ?? 0)).filter((id) => id > 0))))
      .catch(() => {});
  }, [refreshKey]);
  const filterRuns = useMemo<FilterRun[]>(
    () =>
      runs.map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        distanceM: r.distanceM,
        durationS: r.durationS,
        note: r.note,
        placeId: data?.placeOf.get(r.id) ?? null,
        origin: originOf(data?.sourceOf.get(r.id)),
        shoeId: book?.runs[String(r.id)] ?? null,
        fromPlan: planRuns.has(r.id),
      })),
    [runs, data, book, planRuns],
  );
  const filterNames = useMemo<Names>(() => ({ places: names, shoes: new Map((book?.shoes ?? []).map((x) => [x.id, x.name])) }), [names, book]);
  const filterOn = !isEmpty(filter);
  const matched = useMemo(() => (filterOn ? applyFilter(filterRuns, filter, km, filterNames) : null), [filterOn, filterRuns, filter, km, filterNames]);
  // A filter pointing at a deleted place or shoe, or a year with no runs left, lets go of that part.
  useEffect(() => {
    if (!filterOn || !data) return;
    const next = tidy(filter, choicesFor(filterRuns, filter.year, km));
    if (JSON.stringify(next) !== JSON.stringify(filter)) setFilter(next);
  }, [filterRuns]);
  const shownRows = useMemo(() => {
    if (!matched) return rows;
    const ids = new Set(matched.map((r) => r.id));
    return rows.filter((r) => ids.has(r.id));
  }, [rows, matched]);
  const totals = useMemo(() => (matched ? totalsOf(matched) : null), [matched]);
  const groups = useMemo(() => groupRuns(shownRows, now), [shownRows]);
  // The parent hands a new onOpen each render; rows keep one stable press handler.
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const open = useCallback((id: number) => openRef.current(id), []);
  const renderItem = useMemo(() => renderRow(open), [open]);

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

  const month = monthSummary(runs, now);
  const thisMonth = upperFirst(monthName(now));
  const filterButton = (
    <Pressable
      onPress={() => setFiltering(true)}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.filterBtn, filterOn && styles.filterBtnOn, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.filterText, filterOn && styles.filterTextOn]}>{filterOn ? ui().runFilter.filterCount(activeCount(filter)) : ui().runFilter.filter}</Text>
    </Pressable>
  );
  const header =
    filterOn && totals ? (
      <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
        {title}
        <View
          style={styles.month}
          accessible
          accessibilityLabel={`${ui().runFilter.filtered}: ${filterParts(filter, filterNames, km).join(', ')}. ${ui().runFilter.totalsSpoken(totals.runs, spokenDistance(totals.distanceM, km), spokenDuration(totals.durationS))}.`}
        >
          <Text style={type.eyebrow}>{ui().runFilter.filtered}</Text>
          <Text style={styles.filterParts}>{filterParts(filter, filterNames, km).join(' · ')}</Text>
          <View style={styles.monthRow}>
            <Stat value={String(totals.runs)} label={ui().history.runsLabel(totals.runs)} />
            <Stat value={totals.runs ? formatDistanceNumber(totals.distanceM, km) : '0'} label={distanceUnit(km)} />
            <Stat value={hoursMinutes(totals.durationS)} label={ui().history.running} />
          </View>
        </View>
        <View style={styles.linkRow}>
          <Pressable onPress={() => setFilter(NO_FILTER)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.addRun, pressed && { opacity: 0.8 }]}>
            <Text style={styles.addRunText}>{ui().runFilter.clearFilter}</Text>
          </Pressable>
          {filterButton}
        </View>
      </View>
    ) : (
    <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
      {title}
      <View
        style={styles.month}
        accessible
        accessibilityLabel={ui().history.monthSoFarSpoken(thisMonth, month.runs, spokenDistance(month.distanceM, km), spokenDuration(month.durationS))}
      >
        <Text style={type.eyebrow}>{ui().history.monthSoFar(thisMonth)}</Text>
        <View style={styles.monthRow}>
          <Stat value={String(month.runs)} label={ui().history.runsLabel(month.runs)} />
          <Stat value={month.runs ? formatDistanceNumber(month.distanceM, km) : '0'} label={distanceUnit(km)} />
          <Stat value={hoursMinutes(month.durationS)} label={ui().history.running} />
        </View>
      </View>
      {!settings.meMoved && runs.length > 0 ? (
        <View style={styles.moved}>
          <Text style={styles.movedText}>{ui().me.moved}</Text>
          <Pressable onPress={() => update({ meMoved: true })} accessibilityRole="button" accessibilityLabel={ui().me.closeNote} hitSlop={10} style={styles.movedClose}>
            <Text style={styles.movedText}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.linkRow}>
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.addRun, styles.linkFlex, pressed && { opacity: 0.8 }]}>
          <Text style={styles.addRunText}>{ui().addRun.link}</Text>
        </Pressable>
        {runs.length > 1 ? filterButton : null}
      </View>
    </View>
    );

  const sheet = (
    <AddRunSheet
      open={adding}
      km={km}
      onClose={() => setAdding(false)}
      onAdded={(id) => {
        setAdding(false);
        load().catch(() => {});
        onChanged?.();
        onOpen(id);
      }}
    />
  );

  if (!data && failed) {
    return (
      <View style={styles.screen}>
        <LoadFailed text={ui().history.couldntOpenYourRuns} onRetry={() => setTries((n) => n + 1)} />
      </View>
    );
  }

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
        {sheet}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groups}
        keyExtractor={rowKey}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: s }) => (
          <Text style={[type.eyebrow, styles.groupTitle]} accessibilityRole="header">
            {s.title}
          </Text>
        )}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        // Hundreds of imported runs: draw a screenful first, then a little at a time.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={60}
        windowSize={7}
        removeClippedSubviews
        renderItem={renderItem}
        ListEmptyComponent={
          filterOn ? (
            <View style={styles.noMatch}>
              <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{ui().runFilter.noMatch}</Text>
            </View>
          ) : undefined
        }
      />
      <RunFilterSheet
        open={filtering}
        value={filter}
        runs={filterRuns}
        names={filterNames}
        km={km}
        onClose={() => setFiltering(false)}
        onApply={(f) => {
          setFilter(f);
          setFiltering(false);
        }}
      />
      {sheet}
    </View>
  );
}

/** "5 h 12", "48 min", "0 min". */
function hoursMinutes(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? ui().history.hoursMinutes(h, String(m).padStart(2, '0')) : ui().common.min(m);
}

function Sections({ value, onChange }: { value: RunsSection; onChange: (s: RunsSection) => void }) {
  const items: Array<{ key: RunsSection; label: string }> = [
    { key: 'runs', label: ui().history.runs },
    { key: 'places', label: ui().history.places },
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

function rowKey(r: RowModel): string {
  return String(r.id);
}

function Separator() {
  return <View style={styles.separator} />;
}

/** Date and time formatters, made once per language: Intl is slow to set up on the phone. */
let formats: { key: string; day: Intl.DateTimeFormat; time: Intl.DateTimeFormat; long: Intl.DateTimeFormat } | null = null;
function dateFormats() {
  const key = dateLocale();
  if (formats?.key !== key) {
    formats = {
      key,
      day: new Intl.DateTimeFormat(key, { weekday: 'short', day: 'numeric' }),
      time: new Intl.DateTimeFormat(key, { hour: '2-digit', minute: '2-digit' }),
      long: new Intl.DateTimeFormat(key, { weekday: 'long', day: 'numeric', month: 'long' }),
    };
  }
  return formats;
}

/** One row's words, worked out once per load. */
interface RowModel {
  id: number;
  startedAt: number;
  quiet: Quiet | null;
  meta: string;
  main: string;
  sub: string;
  label: string;
}

function rowModel(run: Run, km: boolean, place: string | null, commute: string | null): RowModel {
  const f = dateFormats();
  const d = new Date(run.startedAt);
  const time = f.time.format(d);
  const delta = run.moodBefore != null && run.moodAfter != null ? run.moodAfter - run.moodBefore : null;
  const busy = run.quiet ? BUSY_LABEL[run.quiet].toLowerCase() : null;
  return {
    id: run.id,
    startedAt: run.startedAt,
    quiet: run.quiet,
    meta: `${f.day.format(d)} · ${time}${commute ? ` · ${commute}` : ''}${place ? ` · ${place}` : busy ? ` · ${busy}` : ''}`,
    main: `${formatDistance(run.distanceM, km)} · ${formatDuration(run.durationS)}`,
    sub: `${formatPace(run.distanceM, run.durationS, km)} /${km ? 'km' : 'mi'}${delta != null ? ui().history.energy(delta) : ''}`,
    label: [
      `${f.long.format(d)}, ${time}`,
      place,
      commute,
      ui().history.distanceIn(spokenDistance(run.distanceM, km), spokenDuration(run.durationS)),
      spokenPace(run.distanceM, run.durationS, km),
      delta != null ? ui().history.energySpoken(delta) : null,
      busy,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

function renderRow(open: (id: number) => void) {
  return ({ item }: { item: RowModel }) => <RunRow row={item} onOpen={open} />;
}

const RunRow = memo(function RunRow({ row, onOpen }: { row: RowModel; onOpen: (id: number) => void }) {
  const q = row.quiet;
  const bg = q ? QUIET_BG[q] : colors.lilac;
  const fg = q ? QUIET_FG[q] : colors.lilacDeep;
  return (
    <Pressable
      onPress={() => onOpen(row.id)}
      accessibilityRole="button"
      accessibilityHint={ui().history.opensThisRun}
      accessibilityLabel={row.label}
      style={({ pressed }) => [styles.row, { backgroundColor: bg }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.thumb}>
        <Svg viewBox="0 0 32 32" width={32} height={32}>
          <Path d={shapeFor(row.id)} stroke={fg} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowMeta, { color: fg }]}>{row.meta}</Text>
        <Text style={styles.rowMain}>{row.main}</Text>
        <Text style={styles.rowSub}>{row.sub}</Text>
      </View>
    </Pressable>
  );
});

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

const styles = themedStyles(() => ({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 },
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  seg: { flexDirection: 'row', backgroundColor: colors.sunk, borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.white },
  segText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  segTextOn: { color: colors.text },
  // Title above, stats in their own row: flex: 1 children inside a wrapping row
  // collapsed to nothing on Android and left a tall empty card.
  month: { backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 18, gap: 8 },
  monthRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0 },
  statValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  separator: { height: spacing.sm + 2 },
  groupTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  bringIn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  bringInText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep, textDecorationLine: 'underline', textAlign: 'center' },
  addRun: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  linkFlex: { flexShrink: 1 },
  filterBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' },
  filterBtnOn: { backgroundColor: colors.ink },
  filterText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  filterTextOn: { color: colors.onInk },
  filterParts: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  moved: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.butter, borderRadius: radius.md, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  movedText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.butterDeep },
  movedClose: { flex: 0, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noMatch: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  addRunText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep, textDecorationLine: 'underline' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, padding: 16 },
  thumb: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { fontFamily: fonts.bodySemi, fontSize: 12 },
  rowMain: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
}));
