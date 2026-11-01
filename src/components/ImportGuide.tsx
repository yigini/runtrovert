import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';
import { live, ui } from '../i18n/ui';

// How to get runs out of each app people come from. Every app lets them go
// differently, so each has its own few lines, closed until tapped. The order is
// roughly how many runners use each; "Any other app" closes the list.

const APPS = ['strava', 'garmin', 'coros', 'polar', 'suunto', 'nrc', 'adidas', 'runkeeper', 'samsung', 'fitbit', 'apple', 'other'] as const;
export type GuideApp = (typeof APPS)[number];

const TEXT: Record<GuideApp, { name: string; how: string; brings: string }> = live(() => ui().importGuide.apps);

export function ImportGuide() {
  const [open, setOpen] = useState<GuideApp | null>(null);
  return (
    <View style={styles.list}>
      {APPS.map((k) => {
        const t = TEXT[k];
        const on = open === k;
        return (
          <View key={k} style={styles.item}>
            <Pressable onPress={() => setOpen(on ? null : k)} accessibilityRole="button" accessibilityState={{ expanded: on }} accessibilityLabel={t.name} style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}>
              <Text style={styles.name}>{t.name}</Text>
              <Text style={styles.chev} importantForAccessibility="no" accessibilityElementsHidden>
                {on ? '–' : '+'}
              </Text>
            </Pressable>
            {on ? (
              <View style={styles.body}>
                <Text style={styles.how}>{t.how}</Text>
                <Text style={styles.brings}>{t.brings}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { borderRadius: radius.md, overflow: 'hidden', gap: 2, backgroundColor: colors.cream },
  item: { backgroundColor: colors.white },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, minHeight: 52, gap: spacing.sm },
  name: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  chev: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.muted, width: 20, textAlign: 'center' },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: spacing.sm },
  how: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  brings: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
}));
