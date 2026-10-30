import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { Feel } from '../training/types';
import { ui } from '../i18n/ui';

const FEELS: Feel[] = [1, 2, 3, 4, 5];

/** The talk test after a plan session, one tap, optional. The answer stays on the phone. */
export function FeelPicker({ value, onChange, title }: { value: Feel | null; onChange: (f: Feel) => void; title?: string }) {
  const t = title ?? ui().review.title;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t}>
        {FEELS.map((f) => {
          const on = value === f;
          return (
            <Pressable key={f} onPress={() => onChange(f)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityHint={ui().review.feelHint[f]} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={2}>
                {ui().review.feel[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint} accessibilityLiveRegion="polite">{value ? ui().review.feelHint[value] : ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: 6 },
  pill: { flex: 1, minHeight: 48, paddingVertical: 6, paddingHorizontal: 2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ink },
  pillOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 16, color: colors.inkSoft, textAlign: 'center' },
  labelOn: { color: colors.cream },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, minHeight: 18 },
});
