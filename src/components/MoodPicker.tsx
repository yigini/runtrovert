import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { Mood } from '../types';
import { Face } from './Mark';

const LABELS: Record<Mood, string> = { 1: 'Drained', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Recharged' };
const ON_FILL: Record<Mood, string> = { 1: colors.sky, 2: colors.lilac, 3: colors.butter, 4: colors.mint, 5: colors.peach };

export function MoodPicker({ value, onChange, title }: { value: Mood | null; onChange: (m: Mood) => void; title: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        {([1, 2, 3, 4, 5] as Mood[]).map((m) => {
          const on = value === m;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(m)}
              accessibilityLabel={LABELS[m]}
              accessibilityState={{ selected: on }}
              style={[styles.face, on && { backgroundColor: ON_FILL[m], borderColor: colors.ink }]}
            >
              <Face level={m} ink={on ? colors.ink : colors.lilacDeep} />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{value ? LABELS[value] : ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  face: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.lilacSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  hint: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textAlign: 'center', height: 16 },
});
