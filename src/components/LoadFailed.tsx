import React from 'react';
import { Text, View } from 'react-native';
import { colors, fonts, spacing, themedStyles } from '../theme';
import { Button } from './Button';
import { ui } from '../i18n/ui';

/**
 * A read that failed, said plainly with a way to try again. Never shown as
 * "nothing yet": an empty list is only for a read that worked and found none.
 */
export function LoadFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{text}</Text>
      <Button title={ui().common.tryAgain} variant="secondary" onPress={onRetry} style={{ alignSelf: 'center', paddingHorizontal: 28 }} />
    </View>
  );
}

const styles = themedStyles(() => ({
  box: { padding: spacing.lg, gap: spacing.md, alignItems: 'stretch', backgroundColor: colors.cream },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center' },
}));
