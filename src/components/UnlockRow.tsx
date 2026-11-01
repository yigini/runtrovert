import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { UNLOCKED_BUILD, unlockName, UNLOCK_PRICE } from '../unlock';
import { openUnlock, useUnlockState, useUnlocked } from '../unlockState';
import { ui } from '../i18n/ui';

/** The top row of Settings, always there: the one permanent place the unlock lives. */
export function UnlockSettingsRow() {
  const unlocked = useUnlocked();
  const { owned } = useUnlockState();
  const detail = owned ? ui().unlockRow.itSYoursThankYou : unlocked && UNLOCKED_BUILD ? ui().unlockRow.unlockedInThisTestBuild : ui().unlockRow.fullPlansTrendsPatterns(UNLOCK_PRICE);
  return (
    <Pressable onPress={openUnlock} accessibilityRole="button" accessibilityLabel={`${unlockName()}. ${detail}`} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{unlockName()}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Text style={styles.chev} importantForAccessibility="no" accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

/** "How this app makes money", for the What Runtrovert knows screen (in Settings → Privacy until that screen exists). */
export function MoneyNote() {
  return (
    <View style={styles.money}>
      <Text style={[type.eyebrow, { color: colors.butterDeep }]} accessibilityRole="header">{ui().unlockRow.howThisAppMakesMoney}</Text>
      <Text style={styles.moneyText}>
        {ui().unlockRow.moneyBefore}
        <Text style={styles.link} onPress={openUnlock} accessibilityRole="link">
          {unlockName()}
        </Text>
        {ui().unlockRow.moneyAfter}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.lilacSoft, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.lilacDeep },
  chev: { fontSize: 22, color: colors.lilacDeep },
  money: { backgroundColor: colors.butter, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  moneyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  link: { fontFamily: fonts.bodySemi, textDecorationLine: 'underline' },
}));
