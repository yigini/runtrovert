import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '../components/AmbientBackground';
import { FilmScrim, SHEET_OVERLAP } from '../components/FilmHeader';
import { spokenDistance } from '../a11y';
import { DeepMonthsView } from '../components/DeepStats';
import { Group as Fold } from '../components/DeepCharts';
import { patternFormat, PatternsView } from '../components/PatternsView';
import { SettingsGear } from '../components/SettingsGear';
import { BestsBars, Lately, rechargeLine, useYouData, weekLine } from '../components/YouSection';
import { commuteTags, useCommute } from '../commuteStore';
import type { CommuteDir } from '../commute';
import { goalStore } from '../extraStores';
import { distanceUnit, formatDistance } from '../geo';
import { bestYear, commutesThisMonth, journey, lifetime, meFootage, todayIndex, topPlaces, weekDays, weekMinutes, years } from '../me';
import { energyPatterns } from '../patterns';
import { loadYourRuns, patternRuns, type YourRunsData } from '../patternStore';
import { useSettings } from '../settings';
import { totals, wear } from '../shoes';
import { useShoes } from '../shoeStore';
import { colors, FILM, fonts, radius, scheme, spacing, type, themedStyles } from '../theme';
import { currentWeek, loadPlan } from '../training/store';
import type { Plan } from '../training/types';
import { useUnlocked } from '../unlockState';
import { goalParts, goalShare, roughDistance, weekSoFar } from '../weekGoal';
import { ui } from '../i18n/ui';
import { dateLocale, decimal, upperFirst } from '../i18n/lang';

// Me: the long view of one runner. Your runs is the record; this is who you are
// as a runner, from the runs on this phone and nothing else. Four cards open,
// everything else folded with a one-line summary, and a fold only when there is
// something in it. Totals, this week, bests, places and kit are free; "Lately"
// and the patterns past the first read months of runs and come with the unlock,
// through the same lock rows as before. No streaks, no names, nobody else.

export function MeScreen({
  refreshKey,
  onOpenPlace,
  onAllPlaces,
  onOpenTrain,
  onBringIn,
  onWhatsHere,
  active = true,
  onFilmTop,
}: {
  refreshKey: number;
  /** Me is the tab on screen: the loop plays only then. */
  active?: boolean;
  onOpenPlace: (id: number) => void;
  onAllPlaces: () => void;
  onOpenTrain: () => void;
  onBringIn: () => void;
  onWhatsHere: () => void;
  /** Whether the film is under the clock, so App can keep the status bar icons light over it. */
  onFilmTop?: (onFilm: boolean) => void;
}) {
  const km = useSettings().settings.unitsKm;
  const unlocked = useUnlocked();
  const [data, setData] = useState<YourRunsData | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    let live = true;
    loadYourRuns()
      .then((d) => live && setData(d))
      .catch(() => {});
    loadPlan()
      .then((p) => live && setPlan(p && (p.status === 'active' || p.status === 'paused') ? p : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  const you = useYouData(refreshKey);
  const goal = goalStore.use();
  const book = useShoes();
  const commute = useCommute();
  const [tags, setTags] = useState<Map<number, CommuteDir>>(new Map());
  useEffect(() => {
    if (commute?.home && commute.work) commuteTags(commute).then(setTags).catch(() => {});
  }, [commute, refreshKey]);

  const now = Date.now();
  const runs = data?.runs ?? [];
  const life = useMemo(() => lifetime(runs), [runs]);
  const yearList = useMemo(() => years(runs), [runs]);
  const patterns = useMemo(() => (data ? energyPatterns(patternRuns(data), data.places, now, patternFormat(km)) : null), [data, km]);
  const m = ui().me;
  // A day loop in the light palette and a night loop in the dark one, one a day, so it never switches while you look.
  const dark = scheme() === 'dark';
  const footage = useMemo(() => meFootage(Date.now(), dark), [dark]);
  const insets = useSafeAreaInsets();
  // The header runs up behind the clock. Once the cream sheet scrolls up under the clock, a strip of
  // ground colour fades in behind it and the status icons go back to the theme's own.
  const [hero, setHero] = useState({ w: 0, h: 0 });
  const scrollY = useRef(new Animated.Value(0)).current;
  const [filmTop, setFilmTop] = useState(true);
  const flip = Math.max(1, hero.h - insets.top - SHEET_OVERLAP);
  useEffect(() => {
    onFilmTop?.(filmTop);
  }, [filmTop, onFilmTop]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const over = e.nativeEvent.contentOffset.y < flip;
    if (over !== filmTop) setFilmTop(over);
  };
  const onHero = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.round(width) !== hero.w || Math.round(height) !== hero.h) setHero({ w: Math.round(width), h: Math.round(height) });
  };

  const title = (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.topRow}>
        <Text style={type.h1} accessibilityRole="header">{m.title}</Text>
        <SettingsGear />
      </View>
      <Text style={styles.lede}>{m.lede}</Text>
    </View>
  );
  const filmTitle = (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.topRow}>
        <Text style={[type.h1, styles.onFilm]} accessibilityRole="header">{m.title}</Text>
        <SettingsGear onFilm />
      </View>
      <Text style={[styles.lede, styles.onFilmSoft]}>{m.lede}</Text>
    </View>
  );

  // Nothing yet: say what will appear, and offer the way to bring a history in.
  if (data && runs.length === 0) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]} showsVerticalScrollIndicator={false}>
          {title}
          <View style={styles.card}>
            <Text style={type.body}>{m.fillsIn}</Text>
            <Pressable onPress={onBringIn} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}>
              <Text style={styles.linkText}>{m.bringIn}</Text>
            </Pressable>
          </View>
          <Footer onWhatsHere={onWhatsHere} />
        </ScrollView>
      </View>
    );
  }

  const hours = Math.round(life.durationS / 3600);
  const j = journey(life.distanceM);
  const journeyText = j.kind === 'trip' ? m.trip(m.journeys[j.index]) : j.kind === 'marathons' ? m.marathons(j.n) : j.kind === 'earth' ? m.earth(decimal(String(j.n))) : '';
  const since = life.firstAt != null ? m.since(new Date(life.firstAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })) : '';

  // This week: your time (of the goal, if one is set), a column for each day, your usual week.
  const week = weekSoFar(runs, now);
  const days = weekDays(runs, now);
  const dayMinutes = weekMinutes(runs, now);
  const today = todayIndex(now);
  const maxDay = Math.max(1, ...dayMinutes);
  const dayNames = weekdayLetters();
  const ranDays = dayNames.long.filter((_, i) => days[i]);
  const goalOn = goal?.on === true;
  const parts = goalOn && goal ? goalParts(goal, week, km) : null;

  const placeList = data ? topPlaces(data.placeOf, data.places) : [];
  const activeShoes = (book?.shoes ?? []).filter((s) => s.retiredAt == null);
  const shoeTotals = book ? totals(book, runs) : new Map();
  const commuteCount = commute?.home && commute.work ? commutesThisMonth(runs, tags, now) : null;
  const hasEnergy = runs.some((r) => r.moodAfter != null);
  const recharge = you ? rechargeLine(you.tr) : null;
  const usual = you ? weekLine(you.tr) : null;
  const best = bestYear(yearList);
  const maxYear = Math.max(1, ...yearList.map((y) => y.distanceM));
  const thisWeek = plan ? currentWeek(plan, now) : null;
  const planWeeks = plan ? plan.weeks[plan.weeks.length - 1].index : 0;

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScroll })}
      >
        {/* The top of Me: one slow loop, full width and up behind the clock, under a dark scrim so the
            words on it are always light on dark. It plays only while Me is on screen, and is a still
            frame under battery saver, reduced motion or still backgrounds. Free. */}
        <View style={[styles.hero, { paddingTop: insets.top + spacing.md, minHeight: insets.top + HERO_HEIGHT }]} onLayout={onHero}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <AmbientBackground style={footage} paused={!active} />
            <FilmScrim w={hero.w} h={hero.h} />
          </View>
          {filmTitle}
          {data ? (
            <View style={{ gap: spacing.sm }} accessible accessibilityLabel={`${m.soFarSpoken(life.runs, spokenDistance(life.distanceM, km), hours)} ${since}${journeyText}`}>
              <Text style={[type.eyebrow, styles.onFilmSoft]}>{m.soFar}</Text>
              <View style={styles.bigRow}>
                <Text style={[styles.big, styles.onFilm]} numberOfLines={1} adjustsFontSizeToFit>{whole(life.distanceM / (km ? 1000 : 1609.344))}</Text>
                <Text style={[styles.bigUnit, styles.onFilm]}>{distanceUnit(km)}</Text>
              </View>
              <View style={styles.chips}>
                <Text style={styles.chip}>{`${whole(life.runs)} ${m.runs(life.runs)}`}</Text>
                <Text style={styles.chip}>{`${whole(hours)} ${m.hours(hours)}`}</Text>
              </View>
              <Text style={[type.body, styles.onFilmSoft]}>{since + journeyText}</Text>
            </View>
          ) : null}
        </View>

        {/* The cream sheet slides over the foot of the film and holds everything else. */}
        <View style={styles.sheet}>
        <View style={styles.grip} />

        {/* This week: a column per day, its height the minutes run. Today underlined, days to come dashed.
            The goal's bar only when a goal is set. Free. No streak. */}
        {data ? (
          <View style={styles.card} accessible accessibilityLabel={[ui().youSection.thisWeek, parts ? m.of(parts.done, parts.target) : `${m.weekRuns(week.runs)}, ${hoursMinutes(week.durationS)}`, ranDays.length ? m.ranOn(ranDays.join(', ')) : m.noRunDays, usual].filter(Boolean).join('. ')}>
            <View style={styles.headRow}>
              <Text style={type.eyebrow}>{ui().youSection.thisWeek}</Text>
              <Text style={type.small}>{m.weekRuns(week.runs)}</Text>
            </View>
            <View style={styles.weekRow}>
              <Text style={styles.weekBig}>{parts ? parts.done : hoursMinutes(week.durationS)}</Text>
              <Text style={styles.weekUnder}>{parts ? m.ofTarget(parts.target) : m.weekSoFar}</Text>
            </View>
            {goalOn && goal ? (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(goalShare(goal, week) * 100)}%` }]} />
              </View>
            ) : null}
            <View style={styles.days}>
              {dayMinutes.map((min, i) => (
                <View key={i} style={styles.day}>
                  {min > 0 ? (
                    <View style={[styles.dayBar, { height: Math.max(10, Math.round((min / maxDay) * DAY_BAR)) }]} />
                  ) : (
                    <View style={[styles.dayNone, i > today && styles.dayLater]} />
                  )}
                  <Text style={[styles.dayText, i === today && styles.dayToday]}>{dayNames.short[i]}</Text>
                </View>
              ))}
            </View>
            {usual ? <Text style={type.small}>{usual}</Text> : null}
          </View>
        ) : null}

        {/* Lately: trends over months, the unlock. Locked, only the lock row shows. */}
        {you ? (
          unlocked ? (
            <View style={styles.card}>
              <Text style={type.eyebrow}>{m.lately}</Text>
              <Lately data={you} km={km} unlocked />
            </View>
          ) : (
            <Lately data={you} km={km} unlocked={false} />
          )
        ) : null}

        {/* Your bests as bars. Free. */}
        {you && you.all.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={type.eyebrow}>{m.bests}</Text>
              <Text style={type.small}>{m.allTime}</Text>
            </View>
            <BestsBars data={you} km={km} />
          </View>
        ) : null}

        {/* Your years as columns, the biggest in the deeper lilac. Plain totals, free. */}
        {yearList.length > 1 ? (
          <View style={styles.card} accessible accessibilityLabel={[m.years, best != null ? m.bestYear(best) : null, ...yearList.map((y) => m.yearSpoken(y.year, spokenDistance(y.distanceM, km), y.runs))].filter(Boolean).join('. ')}>
            <View style={styles.headRow}>
              <Text style={type.eyebrow}>{m.years}</Text>
              {best != null ? <Text style={type.small}>{m.bestYear(best)}</Text> : null}
            </View>
            <View style={styles.cols}>
              {[...yearList].slice(0, 12).reverse().map((y) => (
                <View key={y.year} style={styles.col}>
                  <View style={[styles.colBar, { height: Math.max(4, Math.round((y.distanceM / maxYear) * 100)) }, y.year === best && { backgroundColor: colors.seq3 }]} />
                  <Text style={styles.colText}>{String(y.year).slice(2)}</Text>
                </View>
              ))}
            </View>
            <Text style={type.small}>{m.yearsNote}</Text>
          </View>
        ) : null}

        {/* More about you: each fold closed until opened, and only when it has something in it. */}
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">{m.more}</Text>
          <View style={styles.folds}>
            {hasEnergy && patterns ? (
              <Fold id="me-lifts" title={m.lifts} headline={patterns.first.ready ? patterns.first.title : null}>
                {recharge ? <Text style={type.body}>{recharge}</Text> : null}
                <PatternsView patterns={patterns} />
              </Fold>
            ) : null}
            {placeList.length > 0 && data ? (
              <Fold id="me-places" title={m.places} headline={m.kept(data.places.length)}>
                {placeList.map((p) => (
                  <Pressable key={p.id} onPress={() => onOpenPlace(p.id)} accessibilityRole="button" style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}>
                    <Text style={styles.listName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.listValue}>{m.placeRuns(p.runs)}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={onAllPlaces} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.linkText}>{m.allPlaces}</Text>
                </Pressable>
              </Fold>
            ) : null}
            {activeShoes.length > 0 ? (
              <Fold id="me-kit" title={m.kit} headline={(activeShoes.find((s) => s.id === book?.defaultId) ?? activeShoes[0]).name}>
                {activeShoes.map((s) => {
                  const done = shoeTotals.get(s.id)?.distanceM ?? 0;
                  return (
                    <View key={s.id} style={{ gap: 6 }} accessible accessibilityLabel={`${s.name}. ${m.wear(roughDistance(done, km), roughDistance(s.limitM, km))}`}>
                      <View style={styles.listRow}>
                        <Text style={styles.listName} numberOfLines={1}>{s.name}</Text>
                        <Text style={styles.listValue}>{m.wear(roughDistance(done, km), roughDistance(s.limitM, km))}</Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: colors.empty }]}>
                        <View style={[styles.barFill, { width: `${Math.round(wear(s, done) * 100)}%`, backgroundColor: colors.peachDeep }]} />
                      </View>
                    </View>
                  );
                })}
                <Text style={type.small}>{m.kitNote}</Text>
              </Fold>
            ) : null}
            {plan && thisWeek ? (
              <Fold id="me-plan" title={m.plan} headline={`${plan.name} · ${upperFirst(ui().train.weekOf(thisWeek.index, planWeeks))}`}>
                <Pressable onPress={onOpenTrain} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.linkText}>{m.openTrain}</Text>
                </Pressable>
              </Fold>
            ) : null}
            {commuteCount ? (
              <Fold id="me-commute" title={m.commute} headline={m.commuteHeadline(commuteCount.toWork + commuteCount.home)}>
                <Text style={type.body}>{m.commuteLine(commuteCount.toWork, commuteCount.home)}</Text>
              </Fold>
            ) : null}
          </View>
        </View>

        {/* Show me everything: the bests curve sits with the bests; the months deep stats stay here, closed. */}
        <DeepMonthsView km={km} refreshKey={refreshKey} />

        <Footer onWhatsHere={onWhatsHere} />
        </View>
      </Animated.ScrollView>
      {/* Behind the clock once the sheet has scrolled up under it. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.statusStrip, { height: insets.top, opacity: scrollY.interpolate({ inputRange: [flip - 24, flip], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
      />
    </View>
  );
}

const HERO_HEIGHT = 470;
const DAY_BAR = 64;

function Footer({ onWhatsHere }: { onWhatsHere: () => void }) {
  const m = ui().me;
  return (
    <View style={styles.footer}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.footerTitle}>{m.keptHere}</Text>
        <Text style={[type.small, { color: colors.lilacDeep }]}>{m.noAccount}</Text>
      </View>
      <Pressable onPress={onWhatsHere} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}>
        <Text style={[styles.linkText, { color: colors.lilacDeep }]}>{m.whatsHere}</Text>
      </Pressable>
    </View>
  );
}

/** "5 h 12", "48 min". */
function hoursMinutes(s: number): string {
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return h > 0 ? ui().history.hoursMinutes(h, String(mm).padStart(2, '0')) : ui().common.min(mm);
}

/** Whole numbers with the language's thousands mark: 3,140 · 3.140 · 3 140. */
function whole(n: number): string {
  try {
    return new Intl.NumberFormat(dateLocale(), { maximumFractionDigits: 0 }).format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

/** Monday to Sunday in the runner's language: a narrow letter under each dot, and full names for the screen reader. */
function weekdayLetters(): { short: string[]; long: string[] } {
  const monday = new Date(2024, 0, 1); // a Monday
  const short: string[] = [];
  const long: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    short.push(d.toLocaleDateString(dateLocale(), { weekday: 'narrow' }));
    long.push(d.toLocaleDateString(dateLocale(), { weekday: 'long' }));
  }
  return { short, long };
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 24, color: colors.inkSoft },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 18, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headValue: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep, flexShrink: 1, textAlign: 'right' },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0 },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.empty, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.mintDeep },
  weekRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  weekBig: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.text, fontVariant: ['tabular-nums'] },
  weekUnder: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  days: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', minHeight: 64 + 26, paddingTop: 4 },
  day: { alignItems: 'center', justifyContent: 'flex-end', gap: 6, width: 34 },
  dayBar: { width: '100%', borderRadius: 10, backgroundColor: colors.mintDeep },
  dayNone: { width: '100%', height: 6, borderRadius: radius.pill, backgroundColor: colors.empty },
  dayLater: { height: 8, backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  dayText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, paddingBottom: 2 },
  dayToday: { color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.text },
  hero: { paddingHorizontal: spacing.md, paddingBottom: SHEET_OVERLAP + spacing.lg, justifyContent: 'space-between', gap: spacing.lg, overflow: 'hidden' },
  sheet: { marginTop: -SHEET_OVERLAP, backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: spacing.md, paddingTop: 10, gap: spacing.md },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.cream },
  onFilm: { color: FILM.text, textShadowColor: FILM.shadow, textShadowRadius: 8 },
  onFilmSoft: { color: FILM.soft, textShadowColor: FILM.shadow, textShadowRadius: 6 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  big: { fontFamily: fonts.display, fontSize: 60, lineHeight: 66, letterSpacing: -1.5, color: colors.text, fontVariant: ['tabular-nums'], flexShrink: 1 },
  bigUnit: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { fontFamily: fonts.bodySemi, fontSize: 13, color: FILM.text, backgroundColor: FILM.chip, borderWidth: 1, borderColor: FILM.chipLine, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, overflow: 'hidden' },
  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 124 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  colBar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.seq2 },
  colText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },
  folds: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 4 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  yearName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted, width: 40, fontVariant: ['tabular-nums'] },
  yearTrack: { flex: 1, height: 12 },
  yearBar: { height: 12, borderRadius: radius.pill, backgroundColor: colors.seq2 },
  yearValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted, minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44 },
  listName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  listValue: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.lilacSoft, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, marginTop: spacing.sm },
  footerTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep },
}));
