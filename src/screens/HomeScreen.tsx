import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { Mark } from '../components/Mark';
import { MoodPicker } from '../components/MoodPicker';
import { SkyGlyph } from '../components/SkyGlyph';
import { TipLine } from '../components/TipLine';
import { clock, formatTemp, headline, suggestions } from '../sky';
import { useSettings } from '../settings';
import { colors, fonts, spacing } from '../theme';
import type { Mood, Run } from '../types';
import { cachedWeather, getWeather, type Weather, type WeatherResult } from '../weather';

/**
 * The first thing you see. Footage, the sky in a sentence, three plain
 * suggestions, and the start button. No cards: the words sit on the picture.
 */
export function HomeScreen({ runs, mood, onMood, onStart }: { runs: Run[]; mood: Mood | null; onMood: (m: Mood) => void; onStart: () => void }) {
  const { settings } = useSettings();
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
    <AmbientBackground style={evening ? 'dusk' : 'tree'}>
      <Fade from="top" height="62%" strength={0.9} />
      <Fade from="bottom" height="42%" strength={0.92} />
      <View style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{dateLine(now)}</Text>
          <Mark size={30} tile={false} />
        </View>

        {weather ? <SkyRow w={weather} metric={metric} /> : null}
        <Text style={styles.headline} accessibilityRole="header">
          {weather ? headline(weather, metric, now) : greeting(runs, now)}
        </Text>
        <Text style={styles.sub}>{subline(runs, now)}</Text>

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

        <TipLine runs={runs} weather={weather} dark={evening} waiting={sky === null} />
        <MoodPicker inline title="Energy right now" value={mood} onChange={onMood} />
        <Button title="Start run" onPress={onStart} style={{ height: 62 }} />
        <Text style={styles.footer}>{footer(runs, now)}</Text>
      </View>
    </AmbientBackground>
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
  screen: { flex: 1, padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
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
  footer: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.inkSoft, textAlign: 'center' },
});
