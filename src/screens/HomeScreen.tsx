import { isQuick } from '../training/quick';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { hideHomePlace, homePlaceCard, type HomePlace, type Place } from '../placeStore';
import { rotateFootage, sceneFor, type Footage } from '../footage';
import { formatDistance } from '../geo';
import { effectivePreset, presetInfo, type RunPreset } from '../presets';
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
import { dateLocale } from '../i18n/lang';

/**
 * The first thing you see, and one obvious thing to do. Footage, the sky in
 * one line (tap for the best window, what to wear and the light), the
 * headline, then a single suggestion, energy, and Start with Listen beside
 * it. Start names the run; "Change" under it opens the three kinds.
 *
 * Ten days or more since the last run, it says welcome back instead: no plan
 * day, nothing overdue, one free run, and the plan as a separate choice.
 */
export function HomeScreen({ runs, mood, onMood, onStart, onCommute, onRunFree, planToday, planNext, plan, onOpenPlan, onPlanChanged, onBrowseListen, onRunPlace, welcomeBack = true, runPreset, onRunWithoutPlan, route = null, onClearRoute }: { runs: Run[]; mood: Mood | null; onMood: (m: Mood) => void; onStart: () => void; onCommute?: (o: Offer) => void; onRunFree?: () => void; planToday?: Session | null; planNext?: Session | null; plan?: Plan | null; onOpenPlan?: () => void; onPlanChanged?: () => void; onBrowseListen?: () => void; onRunPlace?: (p: Place) => void; welcomeBack?: boolean; runPreset?: RunPreset; onRunWithoutPlan?: () => void; route?: { name: string } | null; onClearRoute?: () => void }) {
  const { settings, update } = useSettings();
  const [presetSheet, setPresetSheet] = useState(false);
  const [listen, setListen] = useState(false);
  const [adjust, setAdjust] = useState(false);
  // "Other ways to run" brings back the usual Run tab for today.
  const [others, setOthers] = useState(false);
  // The sky is one line; a tap opens Best window, Wear and Light under it.
  const [skyOpen, setSkyOpen] = useState(false);
  const lastRunAt = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
  const sessionToday = !!planToday && !planToday.done && !planToday.skipped;
  // The run screen says which kind will start (a session opened from Train is always followed), so Start never promises another.
  const preset = runPreset ?? effectivePreset(settings.runPreset, sessionToday);
  // The chip shows what was picked, even on a day My plan has nothing to follow.
  const picked = settings.runPreset ?? preset;
  const metric = settings.unitsKm;
  const [sky, setSky] = useState<WeatherResult | null>(null);
  const [now, setNow] = useState(Date.now());
  // Each return to Home (opening the app, coming back to the tab) is a new visit and gets a new loop.
  const [visit, setVisit] = useState(0);
  const commute = useCommuteOffer(runs, now);
  // One of your places, the one you usually run at this time. Looked up again each hour and after each run.
  const [homePlace, setHomePlace] = useState<HomePlace | null>(null);
  const hour = Math.floor(now / (60 * 60 * 1000));
  useEffect(() => {
    let alive = true;
    homePlaceCard()
      .then((p) => alive && setHomePlace(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [runs.length, hour]);

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
      if (s === 'active') {
        refresh();
        setVisit((v) => v + 1);
      }
    });
    const tick = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, [refresh]);

  const weather = sky?.kind === 'ok' ? sky.weather : null;
  const scene = sceneFor(weather, now);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new loop per visit or change of sky, not per minute tick
  const footage = useMemo(() => (lastHome = rotateFootage(scene, lastHome)), [scene, visit]);
  const back = welcomeBack && isWelcomeBack(lastRunAt, now);
  const away = daysAway(lastRunAt, now) ?? 0;
  const adjusted = settings.comeback && settings.comeback.since === lastRunAt ? settings.comeback.choice : null;
  const evening = weather ? !weather.isDay || (weather.sunset != null && weather.sunset - now < 60 * 60 * 1000) : new Date(now).getHours() >= 17 || new Date(now).getHours() < 6;

  return (
    // The footage follows the same reading as the headline; a still frame in battery saver.
    <AmbientBackground style={footage}>
      <Fade from="top" height="50%" strength={0.82} />
      <Fade from="bottom" height="42%" strength={0.92} />
      {/* Words scroll when there are many of them; the start button never moves. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{dateLine(now)}</Text>
          <SettingsGear onPhoto />
        </View>

        {weather ? <SkyRow w={weather} metric={metric} now={now} open={skyOpen} onToggle={() => setSkyOpen((o) => !o)} /> : null}
        {weather && skyOpen ? (
          <View style={styles.list}>
            {suggestions(weather, metric, now).map((s) => (
              <View key={s.label} style={styles.item}>
                <Text style={styles.itemLabel}>{s.label}</Text>
                <Text style={styles.itemText}>{s.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
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
        {weather ? null : sky?.kind === 'no-permission' ? (
          <Pressable onPress={() => refresh(true)} style={styles.ask} accessibilityRole="button">
            <Text style={styles.askText}>{ui().home.showTheLocalSky}</Text>
            <Text style={styles.askHint}>{ui().home.usesARoughLocationAbout}</Text>
          </Pressable>
        ) : sky?.kind === 'unavailable' ? (
          <Text style={styles.askHint}>{ui().home.noForecastRightNowOffline}</Text>
        ) : null}

        <View style={{ flex: 1 }} />

      </ScrollView>

      {back && !others && !route ? (
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
        {/* One suggestion at a time, the most useful one for now: the plan's session, a run to work or home,
            the place you usually run at this hour, the plan's next day, then what's new or the daily tip. */}
        {route ? (
          // A route picked from Run this again or Run to work: it waits for Start, and can be taken off.
          <View>
            <View style={styles.placeCard}>
              <View style={styles.placeMain}>
                <Text style={styles.commuteLabel}>{ui().home.yourRoute}</Text>
                <Text style={[styles.commuteText, { flex: 1 }]} numberOfLines={1}>{route.name}</Text>
              </View>
              <Pressable onPress={onClearRoute} accessibilityRole="button" accessibilityLabel={ui().home.removeRoute} hitSlop={8} style={styles.placeHide}>
                <Text style={styles.routeX}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.routeHint}>{ui().home.routeHint}</Text>
          </View>
        ) : sessionToday && planToday ? (
          <PlanCard label={isQuick(planToday) ? ui().quick.yourWorkout : ui().home.todayFromYourPlan} title={planToday.title} hint={planToday.summary} onPress={onOpenPlan} />
        ) : commute && onCommute ? (
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
        ) : homePlace && onRunPlace ? (
          <View style={styles.placeCard}>
            <Pressable
              onPress={() => onRunPlace(homePlace.place)}
              accessibilityRole="button"
              accessibilityLabel={[ui().placesList.runXAgain(homePlace.place.name), homePlace.note?.note].filter(Boolean).join('. ')}
              style={({ pressed }) => [styles.placeMain, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.commuteLabel}>{ui().placesList.runThisAgain}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.commuteText} numberOfLines={1}>{homePlace.place.name}</Text>
                {homePlace.note ? <Text style={styles.placeNote} numberOfLines={1}>{homePlace.note.note}</Text> : null}
              </View>
              <Text style={styles.adjustArrow} accessibilityElementsHidden importantForAccessibility="no">
                ›
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const id = homePlace.place.id;
                setHomePlace(null);
                hideHomePlace(id).catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel={ui().home.hidePlaceX(homePlace.place.name)}
              hitSlop={8}
              style={styles.placeHide}
            >
              <Text style={styles.placeHideText}>{ui().home.hidePlace}</Text>
            </Pressable>
          </View>
        ) : planToday ? (
          <PlanCard label={planToday.done ? ui().home.todaySSessionDone : ui().home.todaySSessionSetAside} title={planToday.title} onPress={onOpenPlan} />
        ) : planNext ? (
          <PlanCard
            label={ui().home.restDayFromYourPlan.replace(/\s*›\s*$/, '')}
            title={ui().home.next(WEEKDAY_LONG[weekdayOf(planNext.date)], planNext.title.charAt(0).toLowerCase() + planNext.title.slice(1))}
            onPress={onOpenPlan}
          />
        ) : settings.seenNews !== NEWS.id ? (
          <Pressable onPress={() => update({ seenNews: NEWS.id })} style={styles.news} accessibilityRole="button" accessibilityHint={ui().home.dismissesThisLine}>
            <Text style={styles.newsText}>{NEWS.text}</Text>
            <Text style={styles.newsDismiss}>{ui().home.gotIt}</Text>
          </Pressable>
        ) : (
          <TipLine runs={runs} weather={weather} dark={evening} waiting={sky === null} />
        )}
        <MoodPicker inline title={ui().home.energyRightNow} value={mood} onChange={onMood} />
        <View style={styles.startRow}>
          <Button title={preset === 'plan' && !route ? ui().home.startTodaySSession : ui().home.start} onPress={onStart} style={{ minHeight: 62, flex: 1 }} />
          <Pressable onPress={() => setListen(true)} accessibilityRole="button" accessibilityLabel={ui().home.listen} accessibilityHint={ui().home.musicPodcastsOrASilent} style={({ pressed }) => [styles.listen, pressed && { opacity: 0.85 }]}>
            <HeadphonesGlyph />
          </Pressable>
        </View>
        {/* The run's kind lives in the Start button now; this opens the choice. Remembered, so most days nobody taps it. */}
        {route ? null : onRunWithoutPlan ? (
          // Opened from Train: the session is followed, and the way out is a run without it.
          <Pressable onPress={onRunWithoutPlan} accessibilityRole="button" accessibilityHint={ui().home.runWithoutThePlanHint} hitSlop={10} style={{ alignSelf: 'center' }}>
            <Text style={styles.kindLine}>
              {presetInfo(preset).name} · <Text style={styles.kindLink}>{ui().home.runWithoutThePlan}</Text>
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setPresetSheet(true)} accessibilityRole="button" accessibilityLabel={ui().home.runKindX(presetInfo(preset).name)} accessibilityHint={ui().home.changesHowThisRunLooks} hitSlop={10} style={{ alignSelf: 'center' }}>
            <Text style={styles.kindLine}>
              {presetInfo(preset).name} · <Text style={styles.kindLink}>{ui().home.change}</Text>
            </Text>
          </Pressable>
        )}
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
      <PresetSheet
        open={presetSheet}
        value={picked}
        onPick={(p) => update({ runPreset: p })}
        onClose={() => setPresetSheet(false)}
        // Run to work waits here on a day the plan's session took the one suggestion.
        extra={
          sessionToday && commute && onCommute
            ? {
                title: commute.dir === 'toWork' ? ui().commute.runToWork : ui().commute.runHome,
                text: ui().commute.about(formatDistance(commute.distanceM, metric), roughMinutes(commute.durationS)),
                hint: commute.dir === 'toWork' ? ui().commute.toWorkHint : ui().commute.homeHint,
                onPress: () => {
                  setPresetSheet(false);
                  onCommute(commute);
                },
              }
            : undefined
        }
      />
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

function HeadphonesGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.lilacDeep} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <Path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
    </Svg>
  );
}

/** The sky in one line: temperature, then the best window. A tap opens the three suggestions. */
/** The loop Home showed last, kept across tab switches so the next visit never repeats it. */
let lastHome: Footage | null = null;

function SkyRow({ w, metric, now, open, onToggle }: { w: Weather; metric: boolean; now: number; open: boolean; onToggle: () => void }) {
  const first = suggestions(w, metric, now)[0];
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint={open ? ui().home.hidesTheSkyDetails : ui().home.showsTheSkyDetails} hitSlop={6} style={styles.skyRow}>
      <SkyGlyph sky={w.sky} isDay={w.isDay} size={26} />
      <Text style={[styles.skyText, { flex: 1 }]} numberOfLines={1}>
        {formatTemp(w.tempC, metric)}
        {first ? ` · ${first.text}` : ` · ${ui().home.wind(metric ? `${Math.round(w.windKmh)} km/h` : `${Math.round(w.windKmh / 1.609)} mph`)}`}
      </Text>
      <Text style={styles.skyMore} accessibilityElementsHidden importantForAccessibility="no">
        {open ? '‹' : '›'}
      </Text>
    </Pressable>
  );
}

/** The plan's day in the suggestion slot, through to the Train tab, with whether a reminder will come. */
function PlanCard({ label, title, hint, onPress }: { label: string; title: string; hint?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityHint={ui().home.opensYourPlan} style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.9 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.planLabel}>{label}</Text>
        <Text style={styles.planText}>{title}</Text>
        {hint ? <Text style={styles.planHint}>{hint}</Text> : null}
        <PlanReminderLine />
      </View>
      <Text style={styles.adjustArrow} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
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
  kindLine: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft },
  kindLink: { fontFamily: fonts.bodySemi, color: colors.ink, textDecorationLine: 'underline' },
  skyMore: { fontFamily: fonts.body, fontSize: 18, color: colors.inkMuted },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.8)' },
  todayLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, textDecorationLine: 'underline' },
  todayLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  listen: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' },
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
  placeCard: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingLeft: 16, paddingRight: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.72)' },
  placeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  placeNote: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  placeHide: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  routeX: { fontFamily: fonts.bodySemi, fontSize: 22, lineHeight: 24, color: colors.inkSoft },
  routeHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft, marginTop: 6, paddingHorizontal: 4 },
  placeHideText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.inkMuted, textDecorationLine: 'underline' },
});
