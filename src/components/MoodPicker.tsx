import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import type { Mood } from '../types';
import { Face } from './Mark';

const LABELS: Record<Mood, string> = { 1: 'Drained', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Recharged' };
const ON_FILL: Record<Mood, string> = { 1: colors.sky, 2: colors.lilac, 3: colors.butter, 4: colors.mint, 5: colors.peach };

/**
 * Five faces, no box. Unpicked faces are just line drawings; the picked one
 * gets its pastel. `inline` puts the question and faces on one row for the
 * home screen, where it sits straight on the footage.
 */
export function MoodPicker({ value, onChange, title, inline }: { value: Mood | null; onChange: (m: Mood) => void; title: string; inline?: boolean }) {
  const size = inline ? 40 : 52;
  const faces = (
    <View style={[styles.row, inline && { gap: 2, justifyContent: 'flex-end' }]}>
      {([1, 2, 3, 4, 5] as Mood[]).map((m) => {
        const on = value === m;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityLabel={LABELS[m]}
            accessibilityState={{ selected: on }}
            hitSlop={4}
            style={[styles.face, { width: size, height: size, borderRadius: size / 2 }, on && { backgroundColor: ON_FILL[m] }]}
          >
            <Face level={m} size={inline ? 32 : 40} ink={colors.ink} />
          </Pressable>
        );
      })}
    </View>
  );
  if (inline) {
    return (
      <View style={styles.inline}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inlineTitle}>{title}</Text>
          <Text style={styles.inlineHint}>{value ? LABELS[value] : 'optional'}</Text>
        </View>
        {faces}
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {faces}
      <Text style={styles.hint}>{value ? LABELS[value] : ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  face: { alignItems: 'center', justifyContent: 'center', opacity: 1 },
  hint: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, textAlign: 'center', height: 16 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  inlineHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, opacity: 0.75 },
});
