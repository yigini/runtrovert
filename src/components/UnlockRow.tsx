import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { UNLOCKED_BUILD, UNLOCK_NAME, UNLOCK_PRICE } from '../unlock';
import { openUnlock, useUnlockState, useUnlocked } from '../unlockState';
import { ui } from '../i18n/ui';

/** The top row of Settings, always there: the one permanent place the unlock lives. */
export function UnlockSettingsRow() {
  const unlocked = useUnlocked();
  const { owned } = useUnlockState();
  const detail = owned ? ui().unlockRow.itSYoursThankYou : unlocked && UNLOCKED_BUILD ? ui().unlockRow.unlockedInThisTestBuild : ui().unlockRow.plansMonthsOfTrendsBackup(UNLOCK_PRICE);
  return (
    <Pressable onPress={openUnlock} accessibilityRole="button" accessibilityLabel={`${UNLOCK_NAME}. ${detail}`} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{UNLOCK_NAME}</Text>
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
        One optional payment,{' '}
        <Text style={styles.link} onPress={openUnlock} accessibilityRole="link">
          {UNLOCK_NAME}
        </Text>
        . No subscription, no data sold, no annoying or intrusive ads. The sponsor shelf in Listen is labelled, and it can't see you.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.lilacSoft, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.lilacDeep },
  chev: { fontSize: 22, color: colors.lilacDeep },
  money: { backgroundColor: colors.butter, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  moneyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  link: { fontFamily: fonts.bodySemi, textDecorationLine: 'underline' },
});
