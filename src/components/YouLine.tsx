import React from 'react';
import { Text, View } from 'react-native';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';

/** The one you-vs-you line for a run, when there is one. */
export function YouLine({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {!!detail && <Text style={styles.detail}>{detail}</Text>}
    </View>
  );
}

const styles = themedStyles(() => ({
  box: { backgroundColor: colors.mint, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.text },
  detail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.mintDeep },
}));
