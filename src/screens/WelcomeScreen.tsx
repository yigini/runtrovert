import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { Fade } from '../components/Fade';
import { Mark } from '../components/Mark';
import { WELCOME } from '../footage';
import { colors, fonts, spacing } from '../theme';

/** Shown once. The motto, the promise, then out of the way. */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
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
        <Text style={styles.lede}>A running app with no feed, no followers and no cheering. Your runs stay on this phone. We never see them.</Text>

        <View style={styles.list}>
          <Item title="No account" text="Nothing to sign up for. Nothing to forget." />
          <Item title="No cloud, no analytics, no ads" text="It fetches map tiles and, from a rough location, the weather. The weather you can turn off." />
          <Item title="No subscription" text="Tracking and history are free for good." />
        </View>

        <Button title="I like that" onPress={onDone} style={{ height: 62, marginTop: spacing.md }} />
        <Text style={styles.footer}>Delete the app and it’s all gone.</Text>
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
  lede: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.ink, maxWidth: 320 },
  list: { gap: 12, marginTop: 6, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.ink },
  itemTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  itemText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  footer: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
});
