import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { distanceUnit } from '../geo';
import { dateLocale } from '../i18n/lang';
import { ui } from '../i18n/ui';
import { applyFilter, bandEdges, choicesFor, NO_FILTER, type Band, type FilterRun, type Names, type Origin, type RunFilter } from '../runFilter';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';
import { Button } from './Button';

/**
 * Your runs › Filter. A sheet, so the list itself stays calm: words, year and
 * month, distance, and only the other choices that would find a run (places,
 * where runs came from, shoes, plan). The button says how many runs it will show.
 */
export function RunFilterSheet({
  open,
  value,
  runs,
  names,
  km,
  onClose,
  onApply,
}: {
  open: boolean;
  value: RunFilter;
  runs: FilterRun[];
  names: Names;
  km: boolean;
  onClose: () => void;
  onApply: (f: RunFilter) => void;
}) {
  const [draft, setDraft] = useState<RunFilter>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const choices = useMemo(() => choicesFor(runs, draft.year, km), [runs, draft.year, km]);
  const count = useMemo(() => (open ? applyFilter(runs, draft, km, names).length : 0), [open, runs, draft, km, names]);
  const set = (patch: Partial<RunFilter>) => setDraft((d) => ({ ...d, ...patch }));
  const t = ui().runFilter;

  const months = useMemo(() => {
    const f = new Intl.DateTimeFormat(dateLocale(), { month: 'short' });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2026, m, 1)));
  }, [open]);

  const bandLabel = (b: Band) => bandName(b, km);
  const originLabel = originNames();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.h2} accessibilityRole="header">
              {t.title}
            </Text>
            <TextInput
              value={draft.text}
              onChangeText={(text) => set({ text })}
              style={styles.input}
              placeholder={t.search}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t.search}
              returnKeyType="search"
              autoCorrect={false}
            />

            <Group label={t.year}>
              <Chip label={t.any} on={draft.year == null} onPress={() => set({ year: null, month: null })} />
              {choices.years.map((y) => (
                <Chip key={y} label={String(y)} on={draft.year === y} onPress={() => set({ year: y, month: null })} />
              ))}
            </Group>
            {draft.year != null && choices.months.length > 1 ? (
              <Group label={t.month}>
                <Chip label={t.any} on={draft.month == null} onPress={() => set({ month: null })} />
                {choices.months.map((m) => (
                  <Chip key={m} label={months[m]} on={draft.month === m} onPress={() => set({ month: m })} />
                ))}
              </Group>
            ) : null}

            {choices.bands.length > 1 ? (
              <Group label={t.distance}>
                <Chip label={t.any} on={draft.band == null} onPress={() => set({ band: null })} />
                {choices.bands.map((b) => (
                  <Chip key={b} label={bandLabel(b)} on={draft.band === b} onPress={() => set({ band: b })} />
                ))}
              </Group>
            ) : null}

            {choices.places.length ? (
              <Group label={t.place}>
                <Chip label={t.any} on={draft.placeId == null} onPress={() => set({ placeId: null })} />
                {choices.places.map((id) => (
                  <Chip key={id} label={names.places.get(id) ?? '…'} on={draft.placeId === id} onPress={() => set({ placeId: id })} />
                ))}
              </Group>
            ) : null}

            {choices.origins.length ? (
              <Group label={t.origin}>
                <Chip label={t.any} on={draft.origin == null} onPress={() => set({ origin: null })} />
                {choices.origins.map((o) => (
                  <Chip key={o} label={originLabel[o]} on={draft.origin === o} onPress={() => set({ origin: o })} />
                ))}
              </Group>
            ) : null}

            {choices.shoes.length ? (
              <Group label={t.shoes}>
                <Chip label={t.any} on={draft.shoeId == null} onPress={() => set({ shoeId: null })} />
                {choices.shoes.map((id) => (
                  <Chip key={id} label={names.shoes.get(id) ?? '…'} on={draft.shoeId === id} onPress={() => set({ shoeId: id })} />
                ))}
              </Group>
            ) : null}

            {choices.plan ? (
              <Group label={t.plan}>
                <Chip label={t.any} on={draft.plan == null} onPress={() => set({ plan: null })} />
                <Chip label={t.fromPlan} on={draft.plan === 'plan'} onPress={() => set({ plan: 'plan' })} />
                <Chip label={t.freeRuns} on={draft.plan === 'free'} onPress={() => set({ plan: 'free' })} />
              </Group>
            ) : null}

            <Button title={t.show(count)} onPress={() => onApply(draft)} disabled={count === 0} />
            <Pressable onPress={() => onApply(NO_FILTER)} accessibilityRole="button" hitSlop={8} style={styles.clear}>
              <Text style={styles.clearText}>{t.clear}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Under 5 km", "5 km to 10 km", "10 km to half marathon", "Half marathon and more". */
export function bandName(b: Band, km: boolean): string {
  const t = ui().runFilter;
  const [low, high] = bandEdges(km);
  const unit = distanceUnit(km);
  const n = (m: number) => `${Math.round(km ? m / 1000 : m / 1609.344)} ${unit}`;
  return b === 'short' ? t.under(n(low)) : b === 'mid' ? t.between(n(low), n(high)) : b === 'long' ? t.toHalf(n(high)) : t.halfAndMore;
}

function originNames(): Record<Origin, string> {
  const t = ui().runFilter;
  return { recorded: t.recorded, imported: t.imported, manual: t.manual };
}

/** The filter as a few short words for the quiet line above the list: "2017 · Oct · Canal loop". */
export function filterParts(f: RunFilter, names: Names, km: boolean): string[] {
  const t = ui().runFilter;
  const out: string[] = [];
  if (f.year != null) out.push(f.month != null ? `${new Intl.DateTimeFormat(dateLocale(), { month: 'short' }).format(new Date(f.year, f.month, 1))} ${f.year}` : String(f.year));
  if (f.band) out.push(bandName(f.band, km));
  if (f.placeId != null) out.push(names.places.get(f.placeId) ?? t.place);
  if (f.origin) out.push(originNames()[f.origin]);
  if (f.shoeId != null) out.push(names.shoes.get(f.shoeId) ?? t.shoes);
  if (f.plan) out.push(f.plan === 'plan' ? t.fromPlan : t.freeRuns);
  if (f.text.trim()) out.push(`“${f.text.trim()}”`);
  return out;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label} accessibilityRole="header">
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onInk },
  clear: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  clearText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.lilacDeep, textDecorationLine: 'underline' },
}));
