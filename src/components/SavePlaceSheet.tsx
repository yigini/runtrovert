import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BUSY_LABEL, cleanTag, PLACE_TAGS, type RouteSig } from '../places';
import type { PlaceDraft } from '../placeStore';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Quiet } from '../types';
import { Button } from './Button';
import { RouteShape } from './RouteShape';
import { ui } from '../i18n/ui';

const BUSY_ORDER: Quiet[] = ['empty', 'some', 'crowded'];

/**
 * "Keep this as a place" from the finish screen, and the same sheet to edit a
 * place later. A name, how busy it was today (the same answer as the finish
 * screen's question), and the runner's own notes as tags. Never "safe": a
 * route memory can't know that, so it doesn't offer to say it.
 */
export function SavePlaceSheet({
  open,
  sig,
  initial,
  busy,
  onBusy,
  onSave,
  onClose,
  onDelete,
}: {
  open: boolean;
  sig: RouteSig | null;
  initial: PlaceDraft;
  /** Only when keeping a new place from a run: today's busyness. */
  busy?: Quiet | null;
  onBusy?: (q: Quiet) => void;
  onSave: (d: PlaceDraft) => void;
  onClose: () => void;
  /** Only when editing. */
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [own, setOwn] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setTags(initial.tags);
    setOwn('');
    setAdding(false);
  }, [open]);

  const all = [...PLACE_TAGS, ...tags.filter((t) => !(PLACE_TAGS as readonly string[]).includes(t))];
  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const addOwn = () => {
    const t = cleanTag(own);
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t]);
    setOwn('');
    setAdding(false);
  };
  const editing = !!onDelete;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={ui().savePlaceSheet.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.h2} accessibilityRole="header">
              {editing ? ui().savePlaceSheet.editThisPlace : ui().savePlaceSheet.keepThisAsAPlace}
            </Text>
            <View style={styles.nameRow}>
              {sig ? <RouteShape sig={sig} size={72} /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type.eyebrow} nativeID="placeName">{ui().savePlaceSheet.name}</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  maxLength={40}
                  accessibilityLabel={ui().savePlaceSheet.nameOfThisPlace}
                  accessibilityLabelledBy="placeName"
                  placeholder={ui().savePlaceSheet.afterWorkEscape}
                  placeholderTextColor={colors.inkMuted}
                  returnKeyType="done"
                />
              </View>
            </View>

            {onBusy ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={type.eyebrow}>{ui().savePlaceSheet.howBusyWasItToday}</Text>
                <View style={styles.busyRow} accessibilityRole="radiogroup" accessibilityLabel={ui().savePlaceSheet.howBusyWasItToday}>
                  {BUSY_ORDER.map((q) => {
                    const on = busy === q;
                    return (
                      <Pressable key={q} onPress={() => onBusy(q)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.busy, on && styles.busyOn]}>
                        <Text style={[styles.busyText, on && styles.busyTextOn]}>{BUSY_LABEL[q]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Text style={type.eyebrow}>{ui().savePlaceSheet.yourNotes}</Text>
              <View style={styles.tags}>
                {all.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <Pressable key={t} onPress={() => toggle(t)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
                    </Pressable>
                  );
                })}
                {adding ? (
                  <TextInput
                    autoFocus
                    value={own}
                    onChangeText={setOwn}
                    onSubmitEditing={addOwn}
                    onBlur={addOwn}
                    maxLength={24}
                    style={[styles.chip, styles.chipInput]}
                    accessibilityLabel={ui().savePlaceSheet.yourOwnNote}
                    placeholder={ui().savePlaceSheet.yourOwn}
                    placeholderTextColor={colors.inkMuted}
                    returnKeyType="done"
                  />
                ) : (
                  <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={ui().savePlaceSheet.addYourOwnNote} style={styles.chip}>
                    <Text style={styles.chipText}>{ui().savePlaceSheet.yourOwn2}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={styles.small}>{ui().savePlaceSheet.datedAndKeptOnThis}</Text>
            <Button title={editing ? ui().savePlaceSheet.save : ui().savePlaceSheet.keepThisPlace} disabled={!name.trim()} onPress={() => onSave({ name: name.trim(), tags })} />
            {onDelete ? (
              <Pressable onPress={onDelete} accessibilityRole="button" hitSlop={8} style={styles.forget}>
                <Text style={styles.forgetText}>{ui().savePlaceSheet.forgetThisPlace}</Text>
              </Pressable>
            ) : null}
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  busyRow: { flexDirection: 'row', gap: 6 },
  busy: { flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  busyOn: { backgroundColor: colors.sky },
  busyText: { fontFamily: fonts.body, fontSize: 13, color: colors.text, textAlign: 'center' },
  busyTextOn: { fontFamily: fonts.bodySemi, color: colors.skyDeep },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.white, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.mint },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextOn: { fontFamily: fonts.bodySemi, color: colors.mintDeep },
  chipInput: { minWidth: 120, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  forget: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  forgetText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.peachDeep, textDecorationLine: 'underline' },
});
