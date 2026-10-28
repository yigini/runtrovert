import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { Quiet } from '../types';

const OPTIONS: Array<{ key: Quiet; label: string }> = [
  { key: 'crowded', label: 'Crowded' },
  { key: 'some', label: 'Some' },
  { key: 'empty', label: 'Empty' },
];

export function QuietPicker({ value, onChange }: { value: Quiet | null; onChange: (q: Quiet) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>How busy was it out there?</Text>
      <View style={styles.row}>
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityState={{ selected: on }} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
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
  pill: { flex: 1, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lilacSoft },
  pillOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep },
  labelOn: { color: colors.cream },
});
