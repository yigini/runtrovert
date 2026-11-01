import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { listRuns } from '../db';
import { colors, fonts, spacing, type, themedStyles } from '../theme';
import { calmFinish, type FinishMood, unlockName, shouldNudge, unlockState } from '../unlock';
import { openUnlock, updateUnlock } from '../unlockState';
import { ui } from '../i18n/ui';

const DAY_MS = 24 * 3600 * 1000;

/**
 * The finish screen's one line about the unlock, the first calm finish with
 * ten or more runs behind it. It stays away after a hard, sore or drained run
 * and on the first run back after a break, and hides again if an answer on the
 * screen turns the run into one of those. Once it has been on screen when the
 * finish screen closes (or its link is tapped) it never comes back. "Not now"
 * just tidies it away for good.
 */
export function UnlockNudge(mood: Omit<FinishMood, 'daysSinceLastRun'>) {
  const [earned, setEarned] = useState<{ count: number; daysSinceLastRun: number | null } | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let alive = true;
    listRuns()
      .then((runs) => {
        // The run on screen is not saved yet, so it counts as one more.
        const n = runs.length + 1;
        if (!alive || !shouldNudge(n)) return;
        const last = runs.length ? Math.max(...runs.map((r) => r.startedAt)) : null;
        setEarned({ count: n, daysSinceLastRun: last == null ? null : (Date.now() - last) / DAY_MS });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const visible = !!earned && !gone && calmFinish({ ...mood, daysSinceLastRun: earned.daysSinceLastRun });
  // Marked as shown only if it was still there when the screen closed.
  const seen = useRef(false);
  seen.current = visible;
  useEffect(
    () => () => {
      if (seen.current && unlockState().nudge === 'unseen') updateUnlock({ nudge: 'shown' });
    },
    [],
  );

  if (!visible || !earned) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {ui().unlockNudge.before(earned.count)}
        <Text
          style={styles.link}
          onPress={() => {
            if (unlockState().nudge === 'unseen') updateUnlock({ nudge: 'shown' });
            openUnlock();
          }}
          accessibilityRole="link"
        >
          {unlockName()}
        </Text>
        {ui().unlockNudge.after}
      </Text>
      <Pressable
        onPress={() => {
          updateUnlock({ nudge: 'dismissed' });
          setGone(true);
        }}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.notNow}
      >
        <Text style={[type.small, { textDecorationLine: 'underline' }]}>{ui().unlockNudge.notNowWeWonT}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, gap: 6 },
  text: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  link: { fontFamily: fonts.bodySemi, color: colors.text, textDecorationLine: 'underline' },
  notNow: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingRight: spacing.md },
}));
