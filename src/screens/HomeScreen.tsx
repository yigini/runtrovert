import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DISPLAY_MAX_SCALE } from '../a11y';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { AdjustPlanSheet } from '../components/AdjustPlanSheet';
import { MoodPicker } from '../components/MoodPicker';
import { PresetSheet } from '../components/PresetSheet';
import { SettingsGear } from '../components/SettingsGear';
import { PlanReminderLine } from '../components/PlanReminders';
import { SkyGlyph } from '../components/SkyGlyph';
import { TipLine } from '../components/TipLine';
import { ListenSheet } from './ListenScreen';
import { roughMinutes, type Offer } from '../commute';
import { useCommuteOffer } from '../commuteStore';
import { homeFootage } from '../footage';
import { formatDistance } from '../geo';
import { PRESETS, effectivePreset, presetInfo } from '../presets';
import { clock, formatTemp, headline, suggestions } from '../sky';
import { useSettings } from '../settings';
import { seasonalLine } from '../surprises';
import { colors, fonts, radius, spacing } from '../theme';
import { choiceLine, daysAway, isWelcomeBack, stoppedWeek } from '../training/comeback';
import { WEEKDAY_LONG, weekdayOf } from '../training/dates';
import type { Plan, Session } from '../training/types';
import type { Mood, Run } from '../types';
import { NEWS } from '../whatsNew';
import { cachedWeather, getWeather, type Weather, type WeatherResult } from '../weather';
import { ui } from '../i18n/ui';
import { dateLocale, decimal, monthName } from '../i18n/lang';

/**
 * The first thing you see. Footage, the sky in a sentence, three plain
 * suggestions, then today's run: how much comes with you, Start, and Listen
 * beside it. No cards: the words sit on the picture.
 *
 * Ten days or more since the last run, it says welcome back instead: no plan
 * day, nothing overdue, one free run, and the plan as a separate choice.
 */
export function HomeScreen({ runs, mood, onMood, onStart, onCommute, onRunFree, planToday, planNext, plan, onOpenPlan, onPlanChanged, onBrowseListen, welcomeBack = true }: { runs: Run[]; mood: Mood | null; onMood: (m: Mood) => void; onStart: () => void; onCommute?: (o: Offer) => void; onRunFree?: () => void; planToday?: Session | null; planNext?: Session | null; plan?: Plan | null; onOpenPlan?: () => void; onPlanChanged?: () => void; onBrowseListen?: () => void; welcomeBack?: boolean }) {
  const { settings, update } = useSettings();
  const [presetSheet, setPresetSheet] = useState(false);
  const [listen, setListen] = useState(false);
  const [adjust, setAdjust] = useState(false);
  // "Other ways to run" brings back the usual chips for today.
  const [others, setOthers] = useState(false);
  const lastRunAt = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
  const sessionToday = !!planToday && !planToday.done && !planToday.skipped;
  const preset = effectivePreset(settings.runPreset, sessionToday);
  // The chip shows what was picked, even on a day My plan has nothing to follow.
  const picked = settings.runPreset ?? preset;
  const metric = settings.unitsKm;
  const [sky, setSky] = useState<WeatherResult | null>(null);
  const [now, setNow] = useState(Date.now());
  const commute = useCommuteOffer(runs, now);

  const refresh = useCallback(
    async (ask = false) => {
      if (!sky && settings.weather) {
        const cached = await cachedWeather();
        if (cached) setSky({ kind: 'ok', weather: cached, stale: true });
      }
      setSky(await getWeather({ enabled: settings.weather, ask }));
      setNow(Date.now());
    },
    [settings.weather],
  );

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    const tick = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, [refresh]);

  const weather = sky?.kind === 'ok' ? sky.weather : null;
  const back = welcomeBack && isWelcomeBack(lastRunAt, now);
  const away = daysAway(lastRunAt, now) ?? 0;
  const adjusted = settings.comeback && settings.comeback.since === lastRunAt ? settings.comeback.choice : null;
  const evening = weather ? !weather.isDay || (weather.sunset != null && weather.sunset - now < 60 * 60 * 1000) : new Date(now).getHours() >= 17 || new Date(now).getHours() < 6;

  return (
    // The footage follows the same reading as the headline; a still frame in battery saver.
    <AmbientBackground style={homeFootage(weather, now)}>
      <Fade from="top" height="62%" strength={0.9} />
      <Fade from="bottom" height="42%" strength={0.92} />
      {/* Words scroll when there are many of them; the start button never moves. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{dateLine(now)}</Text>
          <SettingsGear onPhoto />
        </View>

        {weather ? <SkyRow w={weather} metric={metric} /> : null}
        {back ? (
          <>
            <Text style={styles.awayLine}>{ui().home.xDaysSinceYourLast(away)}</Text>
            <Text style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
              {ui().home.welcomeBackNothingToCatch}
            </Text>
            <Text style={styles.backSub}>{plan && !adjusted ? ui().home.runHoweverYouLikeToday : ui().home.runHoweverYouLikeToday2}</Text>
          </>
        ) : (
          <>
            <Text style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
              {weather ? headline(weather, metric, now) : greeting(runs, now)}
            </Text>
            <Text style={styles.sub}>{seasonalLine(now) ?? subline(runs, now)}</Text>
          </>
        )}
        {/* The plan's day, tappable through to the Train tab, with whether a reminder will come. Not after a break. */}
        {back ? null : planToday ? (
          <Pressable onPress={onOpenPlan} disabled={!onOpenPlan} style={styles.plan} accessibilityRole="button" accessibilityHint={ui().home.opensYourPlan}>
            <Text style={styles.planLabel}>{planToday.done ? ui().home.todaySSessionDone : planToday.skipped ? ui().home.todaySSessionSetAside : ui().home.todayFromYourPlan}  ›</Text>
            <Text style={styles.planText}>{planToday.title}</Text>
            <Text style={styles.planHint}>{planToday.summary}</Text>
            <PlanReminderLine />
          </Pressable>
        ) : planNext ? (
          <Pressable onPress={onOpenPlan} disabled={!onOpenPlan} style={styles.plan} accessibilityRole="button" accessibilityHint={ui().home.opensYourPlan}>
            <Text style={styles.planLabel}>{ui().home.restDayFromYourPlan}</Text>
            <Text style={styles.planText}>
              {ui().home.next(WEEKDAY_LONG[weekdayOf(planNext.date)], planNext.title.charAt(0).toLowerCase() + planNext.title.slice(1))}
            </Text>
            <PlanReminderLine />
          </Pressable>
        ) : null}

        {back ? null : weather ? (
          <View style={styles.list}>
            {suggestions(weather, metric, now).map((s) => (
              <View key={s.label} style={styles.item}>
                <Text style={styles.itemLabel}>{s.label}</Text>
                <Text style={styles.itemText}>{s.text}</Text>
              </View>
            ))}
          </View>
        ) : sky?.kind === 'no-permission' ? (
          <Pressable onPress={() => refresh(true)} style={styles.ask} accessibilityRole="button">
            <Text style={styles.askText}>{ui().home.showTheLocalSky}</Text>
            <Text style={styles.askHint}>{ui().home.usesARoughLocationAbout}</Text>
          </Pressable>
        ) : sky?.kind === 'unavailable' ? (
          <Text style={styles.askHint}>{ui().home.noForecastRightNowOffline}</Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* One quiet line at a time: what's new until it's dismissed, then the daily tip. */}
        {settings.seenNews !== NEWS.id ? (
          <Pressable onPress={() => update({ seenNews: NEWS.id })} style={styles.news} accessibilityRole="button" accessibilityHint={ui().home.dismissesThisLine}>
            <Text style={styles.newsText}>{NEWS.text}</Text>
            <Text style={styles.newsDismiss}>{ui().home.gotIt}</Text>
          </Pressable>
        ) : (
          <TipLine runs={runs} weather={weather} dark={evening} waiting={sky === null} />
        )}
      </ScrollView>

      {back && !others ? (
        <View style={styles.dock}>
          <MoodPicker inline title={ui().home.energyRightNow} value={mood} onChange={onMood} />
          <View style={styles.startRow}>
            <Button title={ui().home.runFreelyToday} onPress={onRunFree ?? onStart} style={{ minHeight: 62, flex: 1 }} />
            <Pressable onPress={() => setListen(true)} accessibilityRole="button" accessibilityLabel={ui().home.listen} accessibilityHint={ui().home.musicPodcastsOrASilent} style={({ pressed }) => [styles.listen, pressed && { opacity: 0.85 }]}>
              <HeadphonesGlyph />
            </Pressable>
          </View>
          <Text style={styles.todayLine}>{plan ? ui().home.startsAsJustRunNo : ui().home.startsAsJustRunNo2}</Text>
          {plan ? (
            <Pressable onPress={() => setAdjust(true)} accessibilityRole="button" accessibilityHint={ui().home.chooseWhatHappensToYour} style={({ pressed }) => [styles.adjust, pressed && { opacity: 0.9 }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.adjustLabel}>{adjusted ? `${plan.name} · ${choiceLine(adjusted)}` : ui().home.stoppedAt(plan.name, plan.status === 'paused', stoppedWeek(plan, lastRunAt, now).index)}</Text>
                <Text style={styles.adjustText}>{adjusted ? ui().home.changeWhatHappensToMy : ui().home.adjustMyPlan}</Text>
              </View>
              <Text style={styles.adjustArrow} accessibilityElementsHidden importantForAccessibility="no">
                ›
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setOthers(true)} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center' }}>
            <Text style={styles.todayLink}>{ui().home.otherWaysToRun}</Text>
          </Pressable>
        </View>
      ) : (
      <View style={styles.dock}>
        {/* Run to work, Run home: one quiet line on a weekday, only once home and work are set. */}
        {commute && onCommute ? (
          <Pressable
            onPress={() => onCommute(commute)}
            accessibilityRole="button"
            accessibilityHint={commute.dir === 'toWork' ? ui().commute.toWorkHint : ui().commute.homeHint}
            style={({ pressed }) => [styles.commute, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.commuteLabel}>{commute.dir === 'toWork' ? ui().commute.runToWork : ui().commute.runHome}</Text>
            <Text style={styles.commuteText} numberOfLines={1}>
              {ui().commute.about(formatDistance(commute.distanceM, metric), roughMinutes(commute.durationS))}
            </Text>
            <Text style={styles.adjustArrow} accessibilityElementsHidden importantForAccessibility="no">
              ›
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.todayHead}>
          <Text style={styles.todayLabel} accessibilityRole="header">{ui().home.todaySRun}</Text>
          <Pressable onPress={() => setPresetSheet(true)} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.todayLink}>{ui().home.whatEachOneShows}</Text>
          </Pressable>
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={ui().home.todaySRun}>
          {PRESETS.map((p) => {
            const on = p.key === picked;
            return (
              <Pressable
                key={p.key}
                onPress={() => update({ runPreset: p.key })}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={p.name}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.85 }]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {p.chip}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.todayLine}>{presetLine(picked, preset, sessionToday, settings.runPreset != null)}</Text>
        <MoodPicker inline title={ui().home.energyRightNow} value={mood} onChange={onMood} />
        <View style={styles.startRow}>
          <Button title={preset === 'plan' ? ui().home.startTodaySSession : ui().home.start} onPress={onStart} style={{ minHeight: 62, flex: 1 }} />
          <Pressable onPress={() => setListen(true)} accessibilityRole="button" accessibilityLabel={ui().home.listen} accessibilityHint={ui().home.musicPodcastsOrASilent} style={({ pressed }) => [styles.listen, pressed && { opacity: 0.85 }]}>
            <HeadphonesGlyph />
          </Pressable>
        </View>
        <Text style={styles.footer}>{footer(runs, now)}</Text>
      </View>
      )}
      {plan && back ? (
        <AdjustPlanSheet
          open={adjust}
          plan={plan}
          lastRunAt={lastRunAt}
          onClose={() => setAdjust(false)}
          onDone={(_, choice) => {
            setAdjust(false);
            if (lastRunAt != null) update({ comeback: { since: lastRunAt, choice } });
            onPlanChanged?.();
          }}
        />
      ) : null}
      <PresetSheet open={presetSheet} value={picked} onPick={(p) => update({ runPreset: p })} onClose={() => setPresetSheet(false)} />
      <ListenSheet
        open={listen}
        onClose={() => setListen(false)}
        onBrowse={() => {
          setListen(false);
          onBrowseListen?.();
        }}
      />
    </AmbientBackground>
  );
}

/** The line under the chips: what the pick brings, and that it's remembered. */
function presetLine(picked: ReturnType<typeof effectivePreset>, preset: ReturnType<typeof effectivePreset>, sessionToday: boolean, remembered: boolean): string {
  if (picked === 'plan' && !sessionToday) return ui().home.nothingOnThePlanToday;
  return `${presetInfo(preset).line}${remembered ? ui().home.sameAsLastTime : ''}`;
}

function HeadphonesGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.lilacDeep} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <Path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </Svg>
  );
}

function SkyRow({ w, metric }: { w: Weather; metric: boolean }) {
  const feels = Math.round(w.feelsC) !== Math.round(w.tempC) ? ui().home.feelsX(formatTemp(w.feelsC, metric)) : '';
  return (
    <View style={styles.skyRow}>
      <SkyGlyph sky={w.sky} isDay={w.isDay} size={26} />
      <Text style={styles.skyText}>
        {formatTemp(w.tempC, metric)}
        {feels} · {ui().home.wind(metric ? `${Math.round(w.windKmh)} km/h` : `${Math.round(w.windKmh / 1.609)} mph`)}
      </Text>
      <Text style={styles.skyText}>  {clock(w.fetchedAt)}</Text>
    </View>
  );
}

function dateLine(now: number): string {
  const d = new Date(now);
  return `${d.toLocaleDateString(dateLocale(), { weekday: 'long' })} · ${clock(now)}`;
}

function greeting(runs: Run[], now: number): string {
  const h = new Date(now).getHours();
  const last = runs[0]?.startedAt;
  if (last && now - last < 36 * 3600 * 1000) return ui().home.restDayOrAQuiet;
  if (h < 11) return ui().home.quietMorningGoBeforeThe;
  if (h < 17) return ui().home.slowAfternoonThePathIs;
  return ui().home.duskRunFewerEyesNow;
}

function subline(runs: Run[], now: number): string {
  if (!runs.length) return ui().home.theFirstOneIsJust;
  const days = Math.floor((startOfDay(now) - startOfDay(runs[0].startedAt)) / 86400000);
  if (days <= 0) return ui().home.youAlreadyRanTodayNobody;
  if (days === 1) return ui().home.youRanYesterdayEasyIs;
  if (days < 7) return ui().home.lastRunXLegsRemember(new Date(runs[0].startedAt).toLocaleDateString(dateLocale(), { weekday: 'long' }));
  return ui().home.xDaysSinceTheLast(days);
}

function footer(runs: Run[], now: number): string {
  const d = new Date(now);
  const month = runs.filter((r) => {
    const s = new Date(r.startedAt);
    return s.getMonth() === d.getMonth() && s.getFullYear() === d.getFullYear();
  }).length;
  const deltas = runs.filter((r) => r.moodBefore != null && r.moodAfter != null).map((r) => (r.moodAfter as number) - (r.moodBefore as number));
  const parts = [ui().home.runAloneNotLonely];
  if (month) parts.push(ui().home.runsInMonth(month, monthName(now)));
  if (deltas.length) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    parts.push(ui().home.energyAfter(`${avg >= 0 ? '+' : ''}${decimal(avg.toFixed(1))}`));
  }
  return parts.join('  ·  ');
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  dock: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.inkSoft },
  skyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  skyText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  headline: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: colors.ink },
  sub: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft, marginTop: -4 },
  list: { gap: 10, marginTop: spacing.xs, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.ink },
  item: { gap: 1 },
  itemLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  itemText: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.ink },
  ask: { gap: 4, marginTop: spacing.xs },
  askText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  askHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  news: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.ink },
  newsText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.ink },
  newsDismiss: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.inkSoft, textDecorationLine: 'underline' },
  footer: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.inkSoft, textAlign: 'center' },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  todayLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.inkSoft },
  todayLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.lilac },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  chipTextOn: { fontFamily: fonts.bodySemi, color: colors.lilacDeep },
  todayLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  listen: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' },
  plan: { gap: 2, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.butterDeep },
  planLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.butterDeep },
  planText: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 21, color: colors.ink },
  planHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  awayLine: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.inkMuted, marginTop: spacing.md },
  backSub: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.inkSoft, marginTop: -4 },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 64, paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.white },
  adjustLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  adjustText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  commute: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.72)' },
  commuteLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  commuteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  adjustArrow: { fontFamily: fonts.body, fontSize: 22, color: colors.inkMuted },
});
