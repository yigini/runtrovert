import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { addManualRun, getRun, runSpans } from '../db';
import { distanceUnit } from '../geo';
import { checkEntry, defaultMinutes, entryStart, parseDistance, parseDuration, type EntryProblem } from '../runEdit';
import { onRunSaved } from '../training/store';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';
import { Button } from './Button';
import { ui } from '../i18n/ui';
import { dateLocale } from '../i18n/lang';

/**
 * "Add a run you didn't record": a day, a start time, distance and time, and a
 * note if you like. No route, so it never becomes a place or a time best, but
 * it counts in your weeks and months, and ticks the plan's session that day.
 */
export function AddRunSheet({ open, km, onClose, onAdded }: { open: boolean; km: boolean; onClose: () => void; onAdded: (runId: number) => void }) {
  const [daysBack, setDaysBack] = useState(0);
  const [minutes, setMinutes] = useState(() => defaultMinutes(Date.now()));
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<EntryProblem | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDaysBack(0);
    setMinutes(defaultMinutes(Date.now()));
    setDistance('');
    setTime('');
    setNote('');
    setProblem(null);
  }, [open]);

  const now = Date.now();
  const startedAt = entryStart(now, daysBack, minutes);
  const dayLabel = daysBack === 0 ? ui().addRun.today : daysBack === 1 ? ui().addRun.yesterday : new Date(startedAt).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  const timeLabel = new Date(startedAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });

  async function save() {
    const distanceM = parseDistance(distance, km);
    const durationS = parseDuration(time);
    const p = checkEntry({ startedAt, distanceM, durationS }, Date.now(), await runSpans().catch(() => []));
    setProblem(p);
    if (p || distanceM == null || durationS == null) return;
    setSaving(true);
    try {
      const id = await addManualRun({ startedAt, distanceM, durationS, note: note || null });
      const run = await getRun(id);
      if (run) await onRunSaved(run, null).catch(() => {});
      onAdded(id);
    } catch {
      setProblem('save');
    } finally {
      setSaving(false);
    }
  }

  const said: Record<EntryProblem | 'save', string> = {
    distance: ui().addRun.problemDistance,
    duration: ui().addRun.problemDuration,
    tooFast: ui().addRun.problemTooFast,
    tooSlow: ui().addRun.problemTooSlow,
    future: ui().addRun.problemFuture,
    overlap: ui().addRun.problemOverlap,
    save: ui().addRun.problemSave,
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={ui().addRun.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.h2} accessibilityRole="header">{ui().addRun.title}</Text>
            <Text style={styles.small}>{ui().addRun.intro}</Text>

            <Stepper label={ui().addRun.day} value={dayLabel} onLess={() => setDaysBack((d) => Math.min(365, d + 1))} onMore={() => setDaysBack((d) => Math.max(0, d - 1))} moreDisabled={daysBack === 0} lessHint={ui().addRun.earlierDay} moreHint={ui().addRun.laterDay} />
            <Stepper label={ui().addRun.started} value={timeLabel} onLess={() => setMinutes((m) => (m + 1440 - 15) % 1440)} onMore={() => setMinutes((m) => (m + 15) % 1440)} lessHint={ui().addRun.earlierTime} moreHint={ui().addRun.laterTime} />

            <View style={styles.fields}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.label}>{ui().addRun.distanceIn(distanceUnit(km))}</Text>
                <TextInput value={distance} onChangeText={setDistance} keyboardType="decimal-pad" style={styles.input} placeholder="5.0" placeholderTextColor={colors.inkMuted} accessibilityLabel={ui().addRun.distanceIn(distanceUnit(km))} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.label}>{ui().addRun.time}</Text>
                <TextInput value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" style={styles.input} placeholder="30:00" placeholderTextColor={colors.inkMuted} accessibilityLabel={ui().addRun.timeHint} />
              </View>
            </View>
            <Text style={styles.small}>{ui().addRun.timeHint}</Text>

            <TextInput value={note} onChangeText={setNote} style={[styles.input, { minHeight: 64 }]} multiline placeholder={ui().addRun.aNote} placeholderTextColor={colors.inkMuted} accessibilityLabel={ui().addRun.aNote} />

            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {said[problem]}
              </Text>
            ) : null}
            <Button title={saving ? ui().addRun.saving : ui().addRun.addRun} onPress={() => void save()} disabled={saving || !distance.trim() || !time.trim()} />
            <Text style={styles.small}>{ui().addRun.noRoute}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stepper({ label, value, onLess, onMore, moreDisabled, lessHint, moreHint }: { label: string; value: string; onLess: () => void; onMore: () => void; moreDisabled?: boolean; lessHint: string; moreHint: string }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onLess} accessibilityRole="button" accessibilityLabel={lessHint} hitSlop={6} style={styles.stepBtn}>
          <Text style={styles.stepText}>‹</Text>
        </Pressable>
        <Text style={styles.stepValue} accessibilityLiveRegion="polite">
          {value}
        </Text>
        <Pressable onPress={onMore} disabled={moreDisabled} accessibilityRole="button" accessibilityLabel={moreHint} accessibilityState={{ disabled: !!moreDisabled }} hitSlop={6} style={[styles.stepBtn, moreDisabled && { opacity: 0.3 }]}>
          <Text style={styles.stepText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  fields: { flexDirection: 'row', gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.pill },
  stepBtn: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.text },
  stepValue: { minWidth: 120, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  problem: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.peachDeep },
}));
