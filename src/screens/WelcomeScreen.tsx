import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { colors, fonts, radius, spacing, type } from '../theme';

/** Shown once. Says the one thing the app is about, then gets out of the way. */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  return (
    <AmbientBackground>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ height: 300 }} />
      <View style={styles.body}>
        <Text style={type.eyebrow}>Runtrovert</Text>
        <Text style={styles.h1}>Your runs{'\n'}are yours.</Text>
        <Text style={type.body}>Everything stays on this phone. No account, no cloud, no analytics, no ads. Nothing is sent anywhere — not to us, not to anyone.</Text>
        <Text style={type.body}>No feed, no followers, no kudos. Delete the app and it’s all gone.</Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.footer}>
        <View style={styles.pills}>
          <Pill text="No account" bg={colors.peach} fg={colors.peachDeep} />
          <Pill text="No feed" bg={colors.lilac} fg={colors.lilacDeep} />
          <Pill text="No subscription" bg={colors.mint} fg={colors.mintDeep} />
        </View>
        <Button title="I like that" onPress={onDone} />
      </View>
      </ScrollView>
    </AmbientBackground>
  );
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { flexGrow: 1, paddingBottom: spacing.xl },
  body: { marginHorizontal: spacing.md, padding: spacing.lg, gap: 14, backgroundColor: 'rgba(246,241,234,0.88)', borderRadius: 32 },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.5, color: colors.text },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 12 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 12 },
});
