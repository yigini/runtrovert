import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BUSY_LABEL } from '../places';
import { colors, fonts, radius, spacing } from '../theme';
import type { Quiet } from '../types';

// The runner's own words for it, the same ones their places keep in the log.
const OPTIONS: Array<{ key: Quiet; label: string }> = (['crowded', 'some', 'empty'] as const).map((key) => ({ key, label: BUSY_LABEL[key] }));

const TITLE = 'How busy was it out there?';

export function QuietPicker({ value, onChange }: { value: Quiet | null; onChange: (q: Quiet) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{TITLE}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={TITLE}>
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.label, on && styles.labelOn, { textAlign: 'center' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  pill: { flex: 1, minHeight: 44, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ink },
  pillOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  labelOn: { color: colors.cream },
});
