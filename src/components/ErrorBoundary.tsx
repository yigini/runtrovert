import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { ui } from '../i18n/ui';

/**
 * If anything throws during render, show the error instead of a silent close.
 * Turns "the app crashed" into a screenshot you can send.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={styles.h}>{ui().errorBoundary.somethingBroke}</Text>
        <Text style={styles.p}>{ui().errorBoundary.nothingWasLostPleaseScreenshot}</Text>
        <Text style={styles.code}>{String(e?.message ?? e)}</Text>
        <Text style={styles.code}>{String(e?.stack ?? '').slice(0, 1500)}</Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  h: { fontFamily: fonts.display, fontSize: 28, color: colors.text, marginTop: spacing.xl },
  p: { fontFamily: fonts.body, fontSize: 16, color: colors.text },
  code: { fontFamily: 'monospace', fontSize: 12, color: colors.peachDeep, backgroundColor: colors.peach, padding: 12, borderRadius: 12 },
});
