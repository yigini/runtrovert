import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { loadValue, saveValue } from '../db';
import { TipsScreen } from '../screens/TipsScreen';
import { colors, fonts } from '../theme';
import { contextsFor, pickTip, type Tip } from '../tips';
import { localTips } from '../i18n/voice';
import type { Run } from '../types';
import type { Weather } from '../weather';

const WET = new Set(['drizzle', 'rain', 'storm', 'snow']);

/**
 * One small thing nobody tells you, picked for the day (first run, rain, a long
 * one yesterday). Tap it for the whole list. Lives on the phone; nothing fetched.
 */
export function TipLine({ runs, weather, dark, waiting }: { runs: Run[]; weather: Weather | null; dark: boolean; waiting: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const day = new Date().toDateString();

  useEffect(() => {
    if (waiting) return; // let the sky arrive first so a rainy day gets a rainy-day tip
    let live = true;
    (async () => {
      const off = (await loadValue<boolean>('tips.hidden')) ?? false;
      const today = await loadValue<{ day: string; id: string }>('tips.today');
      const tips = localTips();
      let t = today?.day === day ? tips.find((x) => x.id === today.id) : undefined;
      if (!t) {
        const last = runs[0];
        const ctx = contextsFor({
          runCount: runs.length,
          daysSinceLast: last ? Math.floor((startOfDay(Date.now()) - startOfDay(last.startedAt)) / 86400000) : null,
          lastRunKm: last ? last.distanceM / 1000 : null,
          tempC: weather?.tempC,
          feelsC: weather?.feelsC,
          windKmh: weather?.windKmh,
          wet: weather ? WET.has(weather.sky) || weather.hours.slice(0, 3).some((h) => h.rainP >= 60) : false,
          dark,
        });
        const seen = (await loadValue<string[]>('tips.seen')) ?? [];
        t = pickTip(ctx, seen, day, tips);
        const nextSeen = seen.length >= tips.length - 1 ? [t.id] : [...seen, t.id];
        await saveValue('tips.seen', nextSeen);
        await saveValue('tips.today', { day, id: t.id });
      }
      if (live) {
        setTip(t);
        setHidden(off);
      }
    })().catch(() => {});
    return () => {
      live = false;
    };
    // Picked once per day and kept, so reopening the app never reshuffles it.
  }, [day, runs.length, waiting]);

  function onHidden(v: boolean) {
    setHidden(v);
    saveValue('tips.hidden', v).catch(() => {});
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityHint="Opens all the tips" style={styles.wrap}>
        {tip && !hidden ? (
          <>
            <Text style={styles.label}>Nobody tells you</Text>
            <Text style={styles.text} numberOfLines={3}>
              {tip.text}
            </Text>
          </>
        ) : (
          <Text style={styles.label}>Things nobody tells you →</Text>
        )}
      </Pressable>
      <TipsScreen visible={open} today={tip} hidden={hidden} onHidden={onHidden} onClose={() => setOpen(false)} />
    </>
  );
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const styles = StyleSheet.create({
  wrap: { gap: 3, paddingVertical: 2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  text: { fontFamily: fonts.displayItalic, fontSize: 15, lineHeight: 21, color: colors.ink },
});
