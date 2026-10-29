import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, fonts, radius, spacing, type } from '../theme';
import { UNLOCK_NAME } from '../unlock';
import { openUnlock, useUnlocked } from '../unlockState';

/**
 * The in-place lock: one quiet row where the locked thing would be, which
 * opens Everything, once. It renders nothing once the app is unlocked, so a
 * screen can leave it in place: `<LockRow title="Trends over months" />`.
 * No countdowns, no blurred previews, no badges.
 */
export function LockRow({ title, detail = `Comes with ${UNLOCK_NAME}`, style }: { title: string; detail?: string; style?: ViewStyle }) {
  const unlocked = useUnlocked();
  if (unlocked) return null;
  return (
    <Pressable
      onPress={openUnlock}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}.`}
      accessibilityHint={`Opens ${UNLOCK_NAME}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }, style]}
    >
      <LockGlyph />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
    </Pressable>
  );
}

export function LockGlyph({ size = 18, color = colors.inkSoft }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 14, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: '#ece5da' },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
