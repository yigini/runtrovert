import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { Mark } from '../components/Mark';
import { WELCOME } from '../footage';
import { colors, fonts, spacing } from '../theme';

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
          <Text style={styles.brandText}>Runtrovert</Text>
        </View>
        <View style={{ flex: 1, minHeight: 220 }} />
        <Text style={styles.h1} accessibilityRole="header">
          <Text style={{ fontFamily: fonts.displayLight }}>Run alone.{'\n'}</Text>
          Not lonely.
        </Text>
        <Text style={styles.lede}>A running app with no feed, no followers and no cheering. Your runs are saved on this phone. We never see them.</Text>

        <View style={styles.list}>
          <Item title="No account" text="Nothing to sign up for. Nothing to forget." />
          <Item title="No analytics, no annoying ads" text="Street maps come from OpenFreeMap, which sees the area on screen. The weather gets a location rounded to about 1 km. Settings turns either off." />
          <Item title="No subscription" text="Tracking and history are free for good." />
        </View>

        <Button title="I like that" onPress={() => setStep('ask')} style={{ height: 62, marginTop: spacing.md }} />
        <Text style={styles.footer}>Delete the app and it’s gone from this phone.</Text>
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
        <Text style={styles.h2} accessibilityRole="header">
          A nudge now{'\n'}and then?
        </Text>
        <Text style={styles.lede}>
          Three short notes a week to get you out the door: Monday, Wednesday and Friday at 8. Once you’ve run a few times they move to your usual days.
        </Text>

        <View style={styles.list}>
          <Item title="Never more than you picked" text="Three a week unless you change it, five at the very most. One reminder a day, tops. Nothing after 9 pm or before 7." />
          <Item title="Never a guilt trip" text="No streaks, no “you missed a day”, no sounds, no red badges." />
          <Item title="Easy to quieten" text="Every note has a “Fewer, please” button. They skip days you’ve already run, and go silent if you stop opening the app." />
          <Item title="Written on this phone" text="Not sent from anywhere. No server knows you exist. Also puts distance and time on your lock screen while you run." />
        </View>

        <Button title="Yes, quietly" onPress={() => onAnswer(true)} style={{ height: 62, marginTop: spacing.md }} />
        <Button title="Not now" variant="secondary" onPress={() => onAnswer(false)} style={{ height: 52 }} />
        <Text style={styles.footer}>If one ever annoys you, that’s a bug. Settings has the switch.</Text>
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
