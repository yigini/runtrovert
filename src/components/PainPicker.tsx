import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { PainLevel } from '../training/adapt';
import { live, ui } from '../i18n/ui';

const OPTIONS: Array<{ key: PainLevel; label: string }> = live(() => (['none', 'niggle', 'pain'] as const).map((key) => ({ key, label: ui().painPicker.label[key] })));
const HINT: Record<PainLevel, string> = live(() => ui().painPicker.hint);

/** One line after a run, only while a plan is active. The answer stays on the phone. */
export function PainPicker({ value, onChange }: { value: PainLevel | null; onChange: (p: PainLevel) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{ui().painPicker.title}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={ui().painPicker.title}>
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.pill, on && (o.key === 'pain' ? styles.pillPain : styles.pillOn)]}>
              <Text style={[styles.label, on && (o.key === 'pain' ? styles.labelPain : styles.labelOn), { textAlign: 'center' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint} accessibilityLiveRegion="polite">{value ? HINT[value] : ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  pill: { flex: 1, minHeight: 44, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ink },
  pillOn: { backgroundColor: colors.ink },
  pillPain: { backgroundColor: colors.peach, borderColor: colors.peach },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  labelOn: { color: colors.cream },
  labelPain: { color: colors.peachDeep },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, minHeight: 18 },
});
