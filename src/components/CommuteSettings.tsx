import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_APART_M, metres, MIN_APART_M } from '../commute';
import { saveCommute, useCommute } from '../commuteStore';
import { colors, fonts, radius, spacing } from '../theme';
import type { LatLon } from '../types';
import { dateLocale } from '../i18n/lang';
import { ui } from '../i18n/ui';
import { SpotSheet } from './SpotSheet';

/** Monday to Friday, as JS days. */
const WEEKDAYS = [1, 2, 3, 4, 5];

function weekdayShort(day: number): string {
  // 2026-10-26 was a Monday.
  return new Date(2026, 9, 25 + day).toLocaleDateString(dateLocale(), { weekday: 'short' });
}

/**
 * Settings > Home and work. Two spots, kept on the phone (src/commuteStore.ts),
 * and the one optional evening-before note. Looks like the sections around it.
 */
export function CommuteSettings() {
  const c = useCommute();
  const [editing, setEditing] = useState<'home' | 'work' | null>(null);
  if (!c) return null;
  const apart = c.home && c.work ? metres(c.home, c.work) : null;
  const warning = apart == null ? null : apart < MIN_APART_M ? ui().commute.tooClose : apart > MAX_APART_M ? ui().commute.tooFar : null;
  const both = !!(c.home && c.work) && !warning;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{ui().commute.section}</Text>
      <Text style={styles.intro}>{ui().commute.intro}</Text>
      <SpotRow label={ui().commute.home} spot={c.home} onSet={() => setEditing('home')} onForget={() => saveCommute({ home: null })} />
      <SpotRow label={ui().commute.work} spot={c.work} onSet={() => setEditing('work')} onForget={() => saveCommute({ work: null })} />
      {warning ? <Text style={styles.warning}>{warning}</Text> : null}
      {both ? (
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm }]}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={styles.label}>{ui().commute.noteLabel}</Text>
            <Text style={styles.hint}>{ui().commute.noteHint}</Text>
          </View>
          <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={ui().commute.noteLabel} accessibilityHint={ui().commute.noteHint}>
            {[null, ...WEEKDAYS].map((d) => {
              const on = c.noteDay === d;
              const label = d == null ? ui().commute.off : weekdayShort(d);
              return (
                <Pressable key={d ?? 'off'} onPress={() => saveCommute({ noteDay: d })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${ui().commute.noteLabel}: ${label}`} style={[styles.segItem, on && styles.segItemOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <Text style={styles.privacy}>{ui().commute.privacy}</Text>
      <SpotSheet
        open={editing != null}
        title={editing === 'work' ? ui().commute.whereWork : ui().commute.whereHome}
        initial={editing === 'work' ? c.work : editing === 'home' ? c.home : null}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          if (editing) saveCommute({ [editing]: p }).catch(() => {});
          setEditing(null);
        }}
      />
    </View>
  );
}

function SpotRow({ label, spot, onSet, onForget }: { label: string; spot: LatLon | null; onSet: () => void; onForget: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{spot ? ui().commute.savedHere : ui().commute.notSet}</Text>
      </View>
      {spot ? (
        <Pressable onPress={onForget} accessibilityRole="button" accessibilityLabel={ui().commute.forgetX(label)} hitSlop={8} style={styles.link}>
          <Text style={styles.linkText}>{ui().commute.forget}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onSet} accessibilityRole="button" accessibilityLabel={spot ? ui().commute.changeX(label) : ui().commute.setX(label)} style={styles.button}>
        <Text style={styles.buttonText}>{spot ? ui().commute.change : ui().commute.set}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 2, backgroundColor: colors.peach },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.peachDeep },
  intro: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14 },
  label: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  warning: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.peachDeep },
  privacy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  button: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 13 },
  link: { marginRight: spacing.md, minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.peachDeep, textDecorationLine: 'underline' },
  seg: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: radius.pill, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.pill },
  segItemOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  segTextOn: { color: colors.cream },
});
