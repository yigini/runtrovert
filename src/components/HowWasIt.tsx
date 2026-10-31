import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { ui } from '../i18n/ui';

/**
 * The one reflection area on the finish screen: energy, how busy it was, a
 * note, and on a plan how it felt. Folded by default, because none of it is
 * needed to keep the run. Saving works the same whether it was opened or not.
 */
export function HowWasIt({ plan, answered, children }: { plan: boolean; answered: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = ui().run;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{t.howWasIt}</Text>
          <Text style={styles.hint}>{answered > 0 ? t.howWasItAnswered(answered) : t.howWasItHint(plan)}</Text>
        </View>
        <Text style={styles.chev} importantForAccessibility="no">{open ? '−' : '+'}</Text>
      </Pressable>
      {open && <View style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 18, backgroundColor: colors.lilacSoft, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.sm },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.lilacDeep },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkMuted },
  chev: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.lilacDeep, paddingHorizontal: spacing.xs },
});
