import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { listRuns } from '../db';
import { changeShoes, useShoes } from '../shoeStore';
import { addShoe, DEFAULT_LIMIT_M, editShoe, parseWholeDistance, removeShoe, retireShoe, totals, wear, wholeDistance, type Shoe } from '../shoes';
import { useSettings } from '../settings';
import { roughDistance } from '../weekGoal';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import type { Run } from '../types';
import { Button } from './Button';
import { Group, Note, PlainRow, Tag, WideButton } from './SettingsKit';
import { ui } from '../i18n/ui';

type Draft = { id: string | null; name: string; already: string; limit: string; problem: string | null };

/** Settings > Shoes: the pairs in use with how far each has gone, the ones put away, and one way to add. */
export function ShoesSettings() {
  const book = useShoes();
  const km = useSettings().settings.unitsKm;
  const [runs, setRuns] = useState<Run[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    listRuns()
      .then(setRuns)
      .catch(() => {});
  }, []);
  const sums = useMemo(() => (book ? totals(book, runs) : new Map()), [book, runs]);
  if (!book) return null;
  const s = ui().shoes;
  const inUse = book.shoes.filter((x) => !x.retiredAt);
  const away = book.shoes.filter((x) => x.retiredAt);
  const unit = km ? 'km' : 'mi';

  const open = (shoe: Shoe | null) =>
    setDraft(
      shoe
        ? { id: shoe.id, name: shoe.name, already: wholeDistance(shoe.startM, km), limit: wholeDistance(shoe.limitM, km), problem: null }
        : { id: null, name: '', already: '0', limit: wholeDistance(DEFAULT_LIMIT_M, km), problem: null },
    );

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    const startM = parseWholeDistance(draft.already, km);
    const limitM = parseWholeDistance(draft.limit, km);
    if (!name) return setDraft({ ...draft, problem: s.nameProblem });
    if (startM == null || limitM == null || limitM <= 0) return setDraft({ ...draft, problem: s.distanceProblem });
    const id = draft.id;
    setDraft(null);
    await changeShoes((b) => (id ? editShoe(b, id, { name, startM, limitM }) : addShoe(b, name, startM, limitM, Date.now()))).catch(() => {});
  }

  const row = (shoe: Shoe) => {
    const t = sums.get(shoe.id) ?? { distanceM: shoe.startM, runs: 0 };
    const isDefault = book.defaultId === shoe.id;
    return (
      <PlainRow key={shoe.id} onPress={() => open(shoe)} accessibilityLabel={`${shoe.name}. ${s.summary(roughDistance(t.distanceM, km), t.runs)}${isDefault ? `. ${s.forNewRuns}` : ''}`}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.name}>{shoe.name}</Text>
          <Text style={styles.hint}>{s.summary(roughDistance(t.distanceM, km), t.runs)}</Text>
          {!shoe.retiredAt ? (
            <View style={styles.bar} importantForAccessibility="no" accessibilityElementsHidden>
              <View style={[styles.fill, { width: `${Math.round(wear(shoe, t.distanceM) * 100)}%` }]} />
            </View>
          ) : null}
        </View>
        {isDefault ? <Tag label={s.forNewRuns} /> : null}
      </PlainRow>
    );
  };

  const editing = draft?.id ? book.shoes.find((x) => x.id === draft.id) ?? null : null;

  return (
    <>
      <Note>{s.intro}</Note>
      {inUse.length ? <Group title={s.inUse}>{inUse.map(row)}</Group> : null}
      <WideButton label={s.addPair} onPress={() => open(null)} quiet={inUse.length > 0} />
      {away.length ? <Group title={s.putAwayGroup}>{away.map(row)}</Group> : null}
      <Note>{s.replaceHint}</Note>

      <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <Pressable style={styles.scrim} onPress={() => setDraft(null)} accessibilityLabel={s.cancel} accessibilityRole="button">
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
            <View style={styles.grabber} />
            {draft ? (
              <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.h2} accessibilityRole="header">{editing ? s.editPair : s.addPair}</Text>
                <Field label={s.name} value={draft.name} onChange={(name) => setDraft({ ...draft, name, problem: null })} placeholder={s.namePlaceholder} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field label={s.alreadyOn(unit)} value={draft.already} onChange={(already) => setDraft({ ...draft, already, problem: null })} numeric />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label={s.replaceAt(unit)} value={draft.limit} onChange={(limit) => setDraft({ ...draft, limit, problem: null })} numeric />
                  </View>
                </View>
                {draft.problem ? <Text style={styles.problem} accessibilityLiveRegion="polite">{draft.problem}</Text> : null}
                <Button title={s.save} onPress={() => void save()} />
                {editing ? (
                  <View style={styles.links}>
                    {!editing.retiredAt && book.defaultId !== editing.id ? (
                      <Link label={s.useForNewRuns} onPress={() => { setDraft(null); void changeShoes((b) => ({ ...b, defaultId: editing.id })); }} />
                    ) : null}
                    <Link
                      label={editing.retiredAt ? s.bringBack : s.putAway}
                      onPress={() => { setDraft(null); void changeShoes((b) => retireShoe(b, editing.id, editing.retiredAt ? null : Date.now())); }}
                    />
                    <Link
                      label={s.remove}
                      danger
                      onPress={() =>
                        Alert.alert(s.removeTitle(editing.name), s.removeText, [
                          { text: s.keep, style: 'cancel' },
                          { text: s.remove, style: 'destructive', onPress: () => { setDraft(null); void changeShoes((b) => removeShoe(b, editing.id)); } },
                        ])
                      }
                    />
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Field({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        keyboardType={numeric ? 'number-pad' : 'default'}
        maxLength={numeric ? 6 : 40}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Link({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={styles.link}>
      <Text style={[styles.linkText, danger && { color: colors.peachDeep }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  name: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  hint: { ...type.small, marginTop: -4 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.cream, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.mintDeep },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  problem: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.peachDeep },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, textDecorationLine: 'underline' },
}));
