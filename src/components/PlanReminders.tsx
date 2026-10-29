import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { notificationStatus, rescheduleReminders, turnOnNotifications, type NotifyStatus } from '../notify';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing } from '../theme';
import { schedulePlanReminders } from '../training/remind';
import { ui } from '../i18n/ui';

/**
 * Whether a plan will reach you outside the app, said plainly, with one tap to
 * change it. A plan never adds notifications of its own kind: it takes over the
 * quiet reminders, so with those off the plan only lives in the app.
 */

export type PlanReminderState = { kind: 'on'; at: string } | { kind: 'none' } | { kind: 'permission' } | { kind: 'paused' };

export function usePlanReminders(paused = false) {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<NotifyStatus | null>(null);

  const check = useCallback(() => {
    notificationStatus().then(setStatus).catch(() => {});
  }, []);
  useEffect(() => {
    check();
    // Back from the phone's settings: look again.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  const at = `${String(settings.notifyHour).padStart(2, '0')}:${String(settings.notifyMinute).padStart(2, '0')}`;
  const state: PlanReminderState | null =
    status == null ? null : paused ? { kind: 'paused' } : status !== 'granted' ? { kind: 'permission' } : settings.notifyPerWeek === 0 ? { kind: 'none' } : { kind: 'on', at };

  /** Turn reminders on from wherever the plan is: the phone's permission, then the weekly count if it was zero. */
  const turnOn = useCallback(async () => {
    if (status !== 'granted') {
      const ok = await turnOnNotifications();
      setStatus(await notificationStatus());
      if (!ok) return;
    }
    const next = settings.notifyPerWeek === 0 ? { ...settings, notifyPerWeek: 3 as const } : settings;
    if (next !== settings) update({ notifyPerWeek: 3 });
    await rescheduleReminders(next)
      .then(() => schedulePlanReminders(next))
      .catch(() => {});
  }, [status, settings, update]);

  return { state, turnOn };
}

export function reminderWords(state: PlanReminderState): { title: string; text: string } {
  switch (state.kind) {
    case 'on':
      return {
        title: ui().planReminders.aQuietNoteAtX(state.at),
        text: ui().planReminders.itNamesTheDayS,
      };
    case 'paused':
      return { title: ui().planReminders.pausedSoNoPlanNotes, text: ui().planReminders.yourOrdinaryRemindersCarryOn };
    case 'permission':
      return { title: ui().planReminders.noRemindersNotificationsAreOff, text: ui().planReminders.thePlanOnlyShowsHere };
    case 'none':
      return { title: ui().planReminders.noRemindersYouSetThem, text: ui().planReminders.thePlanOnlyShowsHere };
  }
}

/** The card in the Train tab and after a plan starts. */
export function PlanReminderCard({ paused = false }: { paused?: boolean }) {
  const { state, turnOn } = usePlanReminders(paused);
  if (!state) return null;
  const words = reminderWords(state);
  const off = state.kind === 'none' || state.kind === 'permission';
  return (
    <View style={[styles.card, off && styles.cardOff]}>
      <View style={styles.top}>
        <Text style={styles.icon}>{off ? '○' : '●'}</Text>
        <Text style={styles.title}>{words.title}</Text>
      </View>
      <Text style={styles.text}>{words.text}</Text>
      {off && (
        <Pressable onPress={turnOn} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>{ui().planReminders.turnOnReminders}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** One line under the plan on the home screen. */
export function PlanReminderLine({ paused = false }: { paused?: boolean }) {
  const { state, turnOn } = usePlanReminders(paused);
  if (!state || state.kind === 'paused') return null;
  if (state.kind === 'on') return <Text style={styles.line}>{ui().planReminders.aQuietNoteAtX2(state.at)}</Text>;
  return (
    <Pressable onPress={turnOn} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.line}>
        No reminders for the plan. <Text style={styles.lineLink}>{ui().planReminders.turnOn}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  cardOff: { backgroundColor: colors.butter },
  top: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  icon: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 22, color: colors.ink },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  btn: { alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16, marginTop: 4 },
  btnText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },
  line: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.inkSoft, marginTop: 2 },
  lineLink: { fontFamily: fonts.bodySemi, color: colors.ink, textDecorationLine: 'underline' },
});
