import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { Mark } from '../components/Mark';
import { WELCOME } from '../footage';
import { colors, fonts, spacing } from '../theme';
import { ui } from '../i18n/ui';

/**
 * Shown once. The motto, the promise, then one question about reminders, in
 * our words, before the system prompt. "Not now" is final: we never ask again.
 */
export function WelcomeScreen({ onDone }: { onDone: (reminders: boolean) => void }) {
  const [step, setStep] = useState<'promise' | 'ask'>('promise');
  if (step === 'ask') return <AskStep onAnswer={onDone} />;
  return (
    <AmbientBackground style={WELCOME}>
      <Fade from="bottom" height="68%" strength={0.98} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Mark size={34} tile={false} />
          <Text style={styles.brandText}>{ui().welcome.runtrovert}</Text>
        </View>
        <View style={{ flex: 1, minHeight: 220 }} />
        <Text style={styles.h1} accessibilityRole="header">
          <Text style={{ fontFamily: fonts.displayLight }}>{ui().welcome.runAlone}</Text>
          Not lonely.
        </Text>
        <Text style={styles.lede}>{ui().welcome.aRunningAppWithNo}</Text>

        <View style={styles.list}>
          <Item title={ui().welcome.noAccount} text={ui().welcome.nothingToSignUpFor} />
          <Item title={ui().welcome.noAnalyticsNoAnnoyingAds} text={ui().welcome.streetMapsComeFromOpenfreemap} />
          <Item title={ui().welcome.noSubscription} text={ui().welcome.trackingAndHistoryAreFree} />
        </View>

        <Button title={ui().welcome.iLikeThat} onPress={() => setStep('ask')} style={{ minHeight: 62, marginTop: spacing.md }} />
        <Text style={styles.footer}>{ui().welcome.deleteTheAppAndIt}</Text>
      </ScrollView>
    </AmbientBackground>
  );
}

function AskStep({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  return (
    <AmbientBackground>
      <Fade from="bottom" height="68%" strength={0.98} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={{ flex: 1, minHeight: 160 }} />
        <Text style={styles.h2} accessibilityRole="header">{ui().welcome.aNudgeNowAndThen}</Text>
        <Text style={styles.lede}>{ui().welcome.threeShortNotesAWeek}</Text>

        <View style={styles.list}>
          <Item title={ui().welcome.neverMoreThanYouPicked} text={ui().welcome.threeAWeekUnlessYou} />
          <Item title={ui().welcome.neverAGuiltTrip} text={ui().welcome.noStreaksNoYouMissed} />
          <Item title={ui().welcome.easyToQuieten} text={ui().welcome.everyNoteHasAFewer} />
          <Item title={ui().welcome.writtenOnThisPhone} text={ui().welcome.notSentFromAnywhereNo} />
        </View>

        <Button title={ui().welcome.yesQuietly} onPress={() => onAnswer(true)} style={{ minHeight: 62, marginTop: spacing.md }} />
        <Button title={ui().welcome.notNow} variant="secondary" onPress={() => onAnswer(false)} style={{ minHeight: 52 }} />
        <Text style={styles.footer}>{ui().welcome.ifOneEverAnnoysYou}</Text>
      </ScrollView>
    </AmbientBackground>
  );
}

function Item({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.itemTitle}>{title}</Text>
      <Text style={styles.itemText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 58, lineHeight: 60, letterSpacing: -2, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.2, color: colors.ink },
  lede: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.ink, maxWidth: 320 },
  list: { gap: 12, marginTop: 6, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.ink },
  itemTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  itemText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  footer: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
});
