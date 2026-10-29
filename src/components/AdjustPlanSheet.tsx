import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { checkedOptions, type CheckedOption, type ComebackChoice } from '../training/comeback';
import { dayStart } from '../training/dates';
import { currentProfile, savePlan } from '../training/store';
import type { Plan } from '../training/types';
import { Button } from './Button';

/**
 * "Your plan, from here." Opened from Run home after a break. Up to four ways
 * on, one already picked. Each is worked out from where you stand today and
 * shown only if it keeps the plan's nine rules.
 */
export function AdjustPlanSheet({ open, plan, lastRunAt, onClose, onDone }: { open: boolean; plan: Plan; lastRunAt: number | null; onClose: () => void; onDone: (plan: Plan, choice: ComebackChoice) => void }) {
  const [checked, setChecked] = useState<{ options: CheckedOption[]; note: string | null } | null>(null);
  const [picked, setPicked] = useState<ComebackChoice>('pause');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setChecked(null);
    currentProfile(Date.now(), plan.paces)
      .then((runner) => {
        if (!alive) return;
        const c = checkedOptions(plan, dayStart(Date.now()), lastRunAt, runner);
        setChecked(c);
        setPicked(c.recommended);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, plan, lastRunAt]);
  const options = checked?.options ?? [];

  async function use() {
    const o = options.find((x) => x.key === picked);
    if (!o) return;
    setBusy(true);
    try {
      await savePlan(o.plan);
      onDone(o.plan, picked);
    } catch {
      Alert.alert('Nothing changed', 'The plan could not be saved just now. It is as it was.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.sm + 4 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.h2} accessibilityRole="header">
              Your plan, from here
            </Text>
            <Text style={styles.small}>Nothing is overdue. Sessions you missed simply drop off.</Text>
            {checked?.note ? <Text style={styles.small}>{checked.note}</Text> : null}
            <View accessibilityRole="radiogroup" accessibilityLabel="How to continue" style={{ gap: spacing.sm + 2 }}>
              {options.map((o) => {
                const on = o.key === picked;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => setPicked(o.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${o.title}. ${o.hint}`}
                    style={({ pressed }) => [styles.opt, on && styles.optOn, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={[styles.title, on && { color: colors.mintDeep }]}>{o.title}</Text>
                    <Text style={[styles.hint, on && { color: colors.mintDeep }]}>{o.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.small}>Reminders stay off until your next run either way.</Text>
            <Button title={busy || !checked ? 'One moment' : 'Use this'} onPress={use} disabled={busy || !checked} style={{ marginTop: spacing.xs }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,39,51,0.2)', marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  opt: { gap: 4, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.white },
  optOn: { backgroundColor: colors.mint },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
});
