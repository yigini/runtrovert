import React from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';
import { useBack } from '../back';
import { colors, fonts, radius, themedStyles, night } from '../theme';
import { ui } from '../i18n/ui';

/**
 * The way out of a sub-screen: a pill you can find with a thumb, and the
 * phone's back gesture does the same thing while it's on screen.
 */
export function BackButton({ label = ui().backButton.back, onPress, onInk, style }: { label?: string; onPress: () => void; onInk?: boolean; style?: ViewStyle }) {
  useBack(() => {
    onPress();
    return true;
  });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ui().backButton.backToX(label)}
      hitSlop={10}
      style={({ pressed }) => [styles.pill, onInk && styles.pillInk, pressed && { opacity: 0.8 }, style]}
    >
      <Text style={[styles.chev, onInk && styles.textInk]}>‹</Text>
      <Text style={[styles.text, onInk && styles.textInk]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingLeft: 12,
    paddingRight: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  pillInk: { backgroundColor: 'rgba(43,39,51,0.82)', borderColor: night.cream },
  chev: { fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 26, marginTop: -3, color: colors.ink },
  text: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  textInk: { color: night.cream },
}));
