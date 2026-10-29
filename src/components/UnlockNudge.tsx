import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listRuns } from '../db';
import { colors, fonts, spacing, type } from '../theme';
import { UNLOCK_NAME, shouldNudge, unlockState } from '../unlock';
import { openUnlock, updateUnlock } from '../unlockState';

/**
 * The finish screen's one line about the unlock, the first time a run ends
 * with ten or more behind it. It is marked as shown the moment it appears, so
 * it never comes back, whatever is tapped. "Not now" just tidies it away.
 */
export function UnlockNudge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    listRuns()
      .then((runs) => {
        // The run on screen is not saved yet, so it counts as one more.
        const n = runs.length + 1;
        if (!alive || !shouldNudge(n)) return;
        setCount(n);
        if (unlockState().nudge === 'unseen') updateUnlock({ nudge: 'shown' });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (count == null) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {count === 10 ? 'Ten' : count} runs in. If you'd like to see how they add up over months, there's{' '}
        <Text style={styles.link} onPress={openUnlock} accessibilityRole="link">
          {UNLOCK_NAME}
        </Text>
        : one payment, no subscription.
      </Text>
      <Pressable
        onPress={() => {
          updateUnlock({ nudge: 'dismissed' });
          setCount(null);
        }}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.notNow}
      >
        <Text style={[type.small, { textDecorationLine: 'underline' }]}>Not now (we won't bring it up again)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: '#e4dccf', paddingTop: 12, gap: 6 },
  text: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  link: { fontFamily: fonts.bodySemi, color: colors.text, textDecorationLine: 'underline' },
  notNow: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingRight: spacing.md },
});
