import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DISPLAY_MAX_SCALE } from '../a11y';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { MoodPicker } from '../components/MoodPicker';
import { PresetSheet } from '../components/PresetSheet';
import { SettingsGear } from '../components/SettingsGear';
import { PlanReminderLine } from '../components/PlanReminders';
import { SkyGlyph } from '../components/SkyGlyph';
import { TipLine } from '../components/TipLine';
import { ListenSheet } from './ListenScreen';
import { homeFootage } from '../footage';
import { PRESETS, effectivePreset, presetInfo } from '../presets';
import { clock, formatTemp, headline, suggestions } from '../sky';
import { useSettings } from '../settings';
import { seasonalLine } from '../surprises';
import { colors, fonts, radius, spacing } from '../theme';
import { WEEKDAY_LONG, weekdayOf } from '../training/dates';
import type { Session } from '../training/types';
import type { Mood, Run } from '../types';
import { NEWS } from '../whatsNew';
import { cachedWeather, getWeather, type Weather, type WeatherResult } from '../weather';

/**
 * The first thing you see. Footage, the sky in a sentence, three plain
 * suggestions, then today's run: how much comes with you, Start, and Listen
 * beside it. No cards: the words sit on the picture.
 */
export function HomeScreen({ runs, mood, onMood, onStart, planToday, planNext, onOpenPlan, onBrowseListen }: { runs: Run[]; mood: Mood | null; onMood: (m: Mood) => void; onStart: () => void; planToday?: Session | null; planNext?: Session | null; onOpenPlan?: () => void; onBrowseListen?: () => void }) {
  const { settings, update } = useSettings();
  const [presetSheet, setPresetSheet] = useState(false);
  const [listen, setListen] = useState(false);
  const sessionToday = !!planToday && !planToday.done && !planToday.skipped;
  const preset = effectivePreset(settings.runPreset, sessionToday);
  // The chip shows what was picked, even on a day My plan has nothing to follow.
  const picked = settings.runPreset ?? preset;
  const metric = settings.unitsKm;
  const [sky, setSky] = useState<WeatherResult | null>(null);
  const [now, setNow] = useState(Date.now());

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
  const evening = weather ? !weather.isDay || (weather.sunset != null && weather.sunset - now < 60 * 60 * 1000) : new Date(now).getHours() >= 17 || new Date(now).getHours() < 6;

  return (
    // The footage follows the same reading as the headline; a still frame in battery saver.
    <AmbientBackground style={homeFootage(weather, now)} still={settings.batteryMode === 'saver'}>
      <Fade from="top" height="62%" strength={0.9} />
      <Fade from="bottom" height="42%" strength={0.92} />
      {/* Words scroll when there are many of them; the start button never moves. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{dateLine(now)}</Text>
          <SettingsGear onPhoto />
        </View>

        {weather ? <SkyRow w={weather} metric={metric} /> : null}
        <Text style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
          {weather ? headline(weather, metric, now) : greeting(runs, now)}
        </Text>
        <Text style={styles.sub}>{seasonalLine(now) ?? subline(runs, now)}</Text>
        {/* The plan's day, tappable through to the Train tab, with whether a reminder will come. */}
        {planToday ? (
          <Pressable onPress={onOpenPlan} disabled={!onOpenPlan} style={styles.plan} accessibilityRole="button" accessibilityHint="Opens your plan">
            <Text style={styles.planLabel}>{planToday.done ? 'Today’s session, done' : planToday.skipped ? 'Today’s session, set aside' : 'Today, from your plan'}  ›</Text>
            <Text style={styles.planText}>{planToday.title}</Text>
            <Text style={styles.planHint}>{planToday.summary}</Text>
            <PlanReminderLine />
          </Pressable>
        ) : planNext ? (
          <Pressable onPress={onOpenPlan} disabled={!onOpenPlan} style={styles.plan} accessibilityRole="button" accessibilityHint="Opens your plan">
            <Text style={styles.planLabel}>Rest day, from your plan  ›</Text>
            <Text style={styles.planText}>
              Next: {WEEKDAY_LONG[weekdayOf(planNext.date)]}, {planNext.title.charAt(0).toLowerCase() + planNext.title.slice(1)}
            </Text>
            <PlanReminderLine />
          </Pressable>
        ) : null}

        {weather ? (
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
            <Text style={styles.askText}>Show the local sky →</Text>
            <Text style={styles.askHint}>Uses a rough location, about 1 km. Nothing else leaves the phone.</Text>
          </Pressable>
        ) : sky?.kind === 'unavailable' ? (
          <Text style={styles.askHint}>No forecast right now. Offline suits us fine.</Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* One quiet line at a time: what's new until it's dismissed, then the daily tip. */}
        {settings.seenNews !== NEWS.id ? (
          <Pressable onPress={() => update({ seenNews: NEWS.id })} style={styles.news} accessibilityRole="button" accessibilityHint="Dismisses this line">
            <Text style={styles.newsText}>{NEWS.text}</Text>
            <Text style={styles.newsDismiss}>Got it</Text>
          </Pressable>
        ) : (
          <TipLine runs={runs} weather={weather} dark={evening} waiting={sky === null} />
        )}
      </ScrollView>

      <View style={styles.dock}>
        <View style={styles.todayHead}>
          <Text style={styles.todayLabel} accessibilityRole="header">Today’s run</Text>
          <Pressable onPress={() => setPresetSheet(true)} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.todayLink}>What each one shows</Text>
          </Pressable>
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Today’s run">
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
        <MoodPicker inline title="Energy right now" value={mood} onChange={onMood} />
        <View style={styles.startRow}>
          <Button title={preset === 'plan' ? 'Start today’s session' : 'Start'} onPress={onStart} style={{ minHeight: 62, flex: 1 }} />
          <Pressable onPress={() => setListen(true)} accessibilityRole="button" accessibilityLabel="Listen" accessibilityHint="Music, podcasts, or a silent run" style={({ pressed }) => [styles.listen, pressed && { opacity: 0.85 }]}>
            <HeadphonesGlyph />
          </Pressable>
        </View>
        <Text style={styles.footer}>{footer(runs, now)}</Text>
      </View>
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
  if (picked === 'plan' && !sessionToday) return 'Nothing on the plan today, so this one runs as Just run. Plans live in Train.';
  return `${presetInfo(preset).line}${remembered ? ' Same as last time.' : ''}`;
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
  const feels = Math.round(w.feelsC) !== Math.round(w.tempC) ? ` · feels ${formatTemp(w.feelsC, metric)}` : '';
  return (
    <View style={styles.skyRow}>
      <SkyGlyph sky={w.sky} isDay={w.isDay} size={26} />
      <Text style={styles.skyText}>
        {formatTemp(w.tempC, metric)}
        {feels} · wind {metric ? `${Math.round(w.windKmh)} km/h` : `${Math.round(w.windKmh / 1.609)} mph`}
      </Text>
      <Text style={styles.skyText}>  {clock(w.fetchedAt)}</Text>
    </View>
  );
}

function dateLine(now: number): string {
  const d = new Date(now);
  return `${d.toLocaleDateString(undefined, { weekday: 'long' })} · ${clock(now)}`;
}

function greeting(runs: Run[], now: number): string {
  const h = new Date(now).getHours();
  const last = runs[0]?.startedAt;
  if (last && now - last < 36 * 3600 * 1000) return 'Rest day.\nOr a quiet one.';
  if (h < 11) return 'Quiet morning.\nGo before the world does.';
  if (h < 17) return 'Slow afternoon.\nThe path is empty.';
  return 'Dusk run?\nFewer eyes now.';
}

function subline(runs: Run[], now: number): string {
  if (!runs.length) return 'The first one is just a walk that speeds up.';
  const days = Math.floor((startOfDay(now) - startOfDay(runs[0].startedAt)) / 86400000);
  if (days <= 0) return 'You already ran today. Nobody’s counting.';
  if (days === 1) return 'You ran yesterday. Easy is allowed.';
  if (days < 7) return `Last run ${new Date(runs[0].startedAt).toLocaleDateString(undefined, { weekday: 'long' })}. Legs remember.`;
  return `${days} days since the last one. No guilt, just a door.`;
}

function footer(runs: Run[], now: number): string {
  const d = new Date(now);
  const month = runs.filter((r) => {
    const s = new Date(r.startedAt);
    return s.getMonth() === d.getMonth() && s.getFullYear() === d.getFullYear();
  }).length;
  const deltas = runs.filter((r) => r.moodBefore != null && r.moodAfter != null).map((r) => (r.moodAfter as number) - (r.moodBefore as number));
  const parts = ['Run alone. Not lonely.'];
  if (month) parts.push(`${month} ${month === 1 ? 'run' : 'runs'} in ${d.toLocaleDateString(undefined, { month: 'long' })}`);
  if (deltas.length) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    parts.push(`energy ${avg >= 0 ? '+' : ''}${avg.toFixed(1)} after`);
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
});
