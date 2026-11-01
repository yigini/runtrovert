import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { spokenDistance } from '../a11y';
import { DeepMonthsView } from '../components/DeepStats';
import { Group as Fold } from '../components/DeepCharts';
import { patternFormat, PatternsView } from '../components/PatternsView';
import { SettingsGear } from '../components/SettingsGear';
import { BestsRow, Lately, rechargeLine, useYouData, weekLine } from '../components/YouSection';
import { commuteTags, useCommute } from '../commuteStore';
import type { CommuteDir } from '../commute';
import { goalStore } from '../extraStores';
import { distanceUnit, formatDistance } from '../geo';
import { bestYear, commutesThisMonth, journey, lifetime, topPlaces, weekDays, years } from '../me';
import { energyPatterns } from '../patterns';
import { loadYourRuns, patternRuns, type YourRunsData } from '../patternStore';
import { useSettings } from '../settings';
import { totals, wear } from '../shoes';
import { useShoes } from '../shoeStore';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
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
}: {
  refreshKey: number;
  onOpenPlace: (id: number) => void;
  onAllPlaces: () => void;
  onOpenTrain: () => void;
  onBringIn: () => void;
  onWhatsHere: () => void;
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

  const title = (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.topRow}>
        <Text style={type.h1} accessibilityRole="header">{m.title}</Text>
        <SettingsGear />
      </View>
      <Text style={styles.lede}>{m.lede}</Text>
    </View>
  );

  // Nothing yet: say what will appear, and offer the way to bring a history in.
  if (data && runs.length === 0) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

  // This week: the goal if one is set, your usual week, a dot for each day with a run.
  const week = weekSoFar(runs, now);
  const days = weekDays(runs, now);
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {title}

        {/* You, so far: plain totals since the first run, imported runs included. Free. */}
        {data ? (
          <View style={styles.card} accessible accessibilityLabel={`${m.soFarSpoken(life.runs, spokenDistance(life.distanceM, km), hours)} ${since}${journeyText}`}>
            <Text style={type.eyebrow}>{m.soFar}</Text>
            <View style={styles.statRow}>
              <Stat value={whole(life.runs)} label={m.runs(life.runs)} />
              <Stat value={whole(life.distanceM / (km ? 1000 : 1609.344))} label={distanceUnit(km)} />
              <Stat value={whole(hours)} label={m.hours(hours)} />
            </View>
            <Text style={type.body}>{since + journeyText}</Text>
          </View>
        ) : null}

        {/* This week. Free. No streak, nothing said about a short week. */}
        {data ? (
          <View style={[styles.card, styles.mint]} accessible accessibilityLabel={[ui().youSection.thisWeek, parts ? m.of(parts.done, parts.target) : m.weekRuns(week.runs), ranDays.length ? m.ranOn(ranDays.join(', ')) : m.noRunDays, usual].filter(Boolean).join('. ')}>
            <View style={styles.headRow}>
              <Text style={[type.eyebrow, { color: colors.mintDeep }]}>{ui().youSection.thisWeek}</Text>
              <Text style={styles.headValue}>{parts ? m.of(parts.done, parts.target) : week.runs ? `${m.weekRuns(week.runs)} · ${roughDistance(week.distanceM, km)}` : m.weekRuns(0)}</Text>
            </View>
            {goalOn && goal ? (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(goalShare(goal, week) * 100)}%` }]} />
              </View>
            ) : null}
            <View style={styles.days}>
              {days.map((on, i) => (
                <View key={i} style={styles.day}>
                  <View style={[styles.dot, on && styles.dotOn]} />
                  <Text style={styles.dayText}>{dayNames.short[i]}</Text>
                </View>
              ))}
            </View>
            {usual ? <Text style={[type.small, { color: colors.mintDeep }]}>{usual}</Text> : null}
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

        {/* Your bests. Free. */}
        {you && you.all.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={type.eyebrow}>{m.bests}</Text>
              <Text style={type.small}>{m.allTime}</Text>
            </View>
            <BestsRow data={you} km={km} />
          </View>
        ) : null}

        {/* More about you: each fold closed until opened, and only when it has something in it. */}
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">{m.more}</Text>
          <View style={styles.folds}>
            {yearList.length > 1 ? (
              <Fold id="me-years" title={m.years} headline={best != null ? m.bestYear(best) : null}>
                {yearList.map((y) => (
                  <View key={y.year} style={styles.yearRow} accessible accessibilityLabel={m.yearSpoken(y.year, spokenDistance(y.distanceM, km), y.runs)}>
                    <Text style={styles.yearName}>{y.year}</Text>
                    <View style={styles.yearTrack}>
                      <View style={[styles.yearBar, { width: `${Math.max(3, Math.round((y.distanceM / maxYear) * 100))}%` }, y.year === best && { backgroundColor: colors.seq3 }]} />
                    </View>
                    <Text style={styles.yearValue}>{roughDistance(y.distanceM, km)}</Text>
                  </View>
                ))}
                <Text style={type.small}>{m.yearsNote}</Text>
              </Fold>
            ) : null}
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
      </ScrollView>
    </View>
  );
}

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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
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
  mint: { backgroundColor: colors.mint },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headValue: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep, flexShrink: 1, textAlign: 'right' },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0 },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.empty, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.mintDeep },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 4, minWidth: 28 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.mintDeep, opacity: 0.45 },
  dotOn: { backgroundColor: colors.mintDeep, opacity: 1 },
  dayText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.mintDeep },
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
