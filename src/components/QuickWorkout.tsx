import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadValue, saveValue } from '../db';
import { clampSpec, MAX_REPS, QUICK_PRESETS, quickMinutes, quickSession, quickTitle, REST_S, WARM_MIN, WORK_S, type QuickEffort, type QuickPresetKey, type QuickRest, type QuickSpec } from '../training/quick';
import type { Session } from '../training/types';
import { formatMin } from '../training/workout';
import { colors, fonts, radius, spacing } from '../theme';
import { BackButton } from './BackButton';
import { Button } from './Button';
import { ui } from '../i18n/ui';

// Quick workout, on the Train tab: run-walk or intervals of your own, no plan
// needed. The last one used is kept (settings key 'quickWorkout') and offered
// first next time.

const KEY = 'quickWorkout';

/** The row on the Train tab that opens the builder. */
export function QuickRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{ui().quick.rowTitle}</Text>
        <Text style={styles.hint}>{ui().quick.rowHint}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

export function QuickView({ onBack, onStart }: { onBack: () => void; onStart: (s: Session) => void }) {
  const [spec, setSpec] = useState<QuickSpec>(QUICK_PRESETS.runWalk);
  const [last, setLast] = useState<QuickSpec | null>(null);
  useEffect(() => {
    loadValue<QuickSpec>(KEY)
      .then((s) => {
        if (!s) return;
        const c = clampSpec(s);
        setLast(c);
        setSpec(c);
      })
      .catch(() => {});
  }, []);

  const set = (patch: Partial<QuickSpec>) => setSpec((s) => clampSpec({ ...s, ...patch }));
  const step = (list: number[], v: number, dir: 1 | -1) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + dir))];
  const same = (a: QuickSpec, b: QuickSpec) => JSON.stringify(clampSpec(a)) === JSON.stringify(clampSpec(b));
  const presets = Object.keys(QUICK_PRESETS) as QuickPresetKey[];

  function start() {
    const s = clampSpec(spec);
    saveValue(KEY, s).catch(() => {});
    onStart(quickSession(s, Date.now()));
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <BackButton label={ui().quick.back} onPress={onBack} />
      <Text style={styles.h1} accessibilityRole="header">{ui().quick.title}</Text>
      <Text style={styles.lede}>{ui().quick.intro}</Text>

      <View style={styles.chips}>
        {last && !presets.some((k) => same(QUICK_PRESETS[k], last)) ? <Chip label={ui().quick.lastOne} on={same(spec, last)} onPress={() => setSpec(last)} /> : null}
        {presets.map((k) => (
          <Chip key={k} label={ui().quick.preset[k]} on={same(spec, QUICK_PRESETS[k])} onPress={() => setSpec(QUICK_PRESETS[k])} />
        ))}
      </View>

      <View style={styles.card}>
        <Stepper label={ui().quick.run} value={formatMin(spec.workS)} less={() => set({ workS: step(WORK_S, spec.workS, -1) })} more={() => set({ workS: step(WORK_S, spec.workS, 1) })} />
        <View style={styles.chips}>
          {(['easy', 'steady', 'hard'] as QuickEffort[]).map((e) => (
            <Chip key={e} small label={ui().quick.effortChip[e]} on={spec.effort === e} onPress={() => set({ effort: e })} />
          ))}
        </View>
        <Stepper label={ui().quick.thenBreak} value={spec.restS ? formatMin(spec.restS) : ui().quick.noBreak} less={() => set({ restS: step(REST_S, spec.restS, -1) })} more={() => set({ restS: step(REST_S, spec.restS, 1) })} />
        {spec.restS ? (
          <View style={styles.chips}>
            {(['walk', 'jog'] as QuickRest[]).map((r) => (
              <Chip key={r} small label={ui().quick.restChip[r]} on={spec.rest === r} onPress={() => set({ rest: r })} />
            ))}
          </View>
        ) : null}
        <Stepper label={ui().quick.times} value={String(spec.reps)} less={() => set({ reps: Math.max(1, spec.reps - 1) })} more={() => set({ reps: Math.min(MAX_REPS, spec.reps + 1) })} />
        <Stepper label={ui().quick.warmUp} value={spec.warmMin ? ui().common.min(spec.warmMin) : ui().quick.none} less={() => set({ warmMin: step(WARM_MIN, spec.warmMin, -1) })} more={() => set({ warmMin: step(WARM_MIN, spec.warmMin, 1) })} />
        <Stepper label={ui().quick.coolDown} value={spec.coolMin ? ui().common.min(spec.coolMin) : ui().quick.none} less={() => set({ coolMin: step(WARM_MIN, spec.coolMin, -1) })} more={() => set({ coolMin: step(WARM_MIN, spec.coolMin, 1) })} />
        {spec.effort === 'hard' ? <Text style={styles.hint}>{ui().quick.hardNeedsWarm}</Text> : null}
      </View>

      <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
        <Text style={styles.summaryTitle}>{quickTitle(spec)}</Text>
        <Text style={styles.hint}>{ui().quick.about(quickMinutes(spec))}</Text>
      </View>
      <Button title={ui().quick.start} onPress={start} />
      <Text style={styles.hint}>{ui().quick.how}</Text>
    </ScrollView>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, less, more }: { label: string; value: string; less: () => void; more: () => void }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={less} accessibilityRole="button" accessibilityLabel={ui().quick.less(label)} hitSlop={6} style={styles.stepBtn}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable onPress={more} accessibilityRole="button" accessibilityLabel={ui().quick.more(label)} hitSlop={6} style={styles.stepBtn}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.cream },
  screen: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, color: colors.text },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  chev: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.muted },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.white, justifyContent: 'center', borderWidth: 1, borderColor: '#e8e0d4' },
  chipSmall: { minHeight: 36, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextOn: { fontFamily: fonts.bodySemi, color: colors.mintDeep },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  stepLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.pill },
  stepBtn: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.text },
  stepValue: { minWidth: 90, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  summaryTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.text },
});
