import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, fonts, radius } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'onInk';

export function Button({ title, onPress, variant = 'primary', disabled, style }: { title: string; onPress: () => void; variant?: Variant; disabled?: boolean; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, disabled && styles.disabled, style]}>
      <Text style={[styles.text, textStyles[variant]]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.lilacSoft },
  danger: { backgroundColor: colors.peach },
  onInk: { backgroundColor: colors.inkSoft },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  text: { fontFamily: fonts.bodySemi, fontSize: 17 },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.cream },
  secondary: { color: colors.lilacDeep },
  danger: { color: colors.peachDeep },
  onInk: { color: colors.cream },
});
