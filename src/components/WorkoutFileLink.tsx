import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Goal } from '../training/catalogue';
import type { PaceSet } from '../training/sessions';
import type { Session } from '../training/types';
import { hasWorkoutFile, sessionWorkoutFile } from '../training/workoutFile';
import type { HeartSetup } from '../training/zones';
import { colors, fonts, themedStyles } from '../theme';
import { ui } from '../i18n/ui';

// One quiet line under a session's steps: the session as a .fit workout a
// Garmin, Coros or Suunto watch can guide by itself. A tap explains once,
// then the share sheet. Free: taking your own things out never costs.

export function WorkoutFileLink({ session, paces, heart, goal }: { session: Session; paces: PaceSet | null; heart: HeartSetup | null; goal: Goal }) {
  if (!hasWorkoutFile(session)) return null;
  const save = async () => {
    try {
      const { name, bytes } = sessionWorkoutFile({ session, paces, heart, goal, createdAt: Date.now() });
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      await file.write(bytes);
      if (!(await Sharing.isAvailableAsync())) throw new Error(ui().workoutFile.noShare(file.uri));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: ui().workoutFile.title });
    } catch (e) {
      Alert.alert(ui().workoutFile.failed, String(e instanceof Error ? e.message : e));
    }
  };
  const open = () => Alert.alert(ui().workoutFile.title, ui().workoutFile.how, [{ text: ui().workoutFile.cancel, style: 'cancel' }, { text: ui().workoutFile.save, onPress: save }]);
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityHint={ui().workoutFile.title} hitSlop={8}>
      <Text style={styles.link}>{ui().workoutFile.link}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink, paddingTop: 4 },
}));
