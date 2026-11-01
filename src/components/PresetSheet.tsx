import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { PRESETS, type RunPreset } from '../presets';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';
import { Button } from './Button';
import { ui } from '../i18n/ui';

/**
 * "What kind of run today?" The three presets side by side, with what each
 * brings on screen, in your ears and in numbers. Picking one remembers it.
 */
/** Another way to run today, offered under the three when it lost the Run tab's one suggestion (run to work on a plan day). */
export interface SheetExtra {
  title: string;
  text: string;
  hint: string;
  onPress: () => void;
}

export function PresetSheet({ open, value, onPick, onClose, extra }: { open: boolean; value: RunPreset; onPick: (p: RunPreset) => void; onClose: () => void; extra?: SheetExtra }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={ui().presetSheet.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.sm + 4 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.h2} accessibilityRole="header">{ui().presetSheet.whatKindOfRunToday}</Text>
            <Text style={styles.small}>{ui().presetSheet.pickHowMuchComesIn}</Text>
            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm + 2 }}>
              {PRESETS.map((p) => {
                const on = p.key === value;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => onPick(p.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={ui().presetSheet.spoken(p.name, p.screen, p.voice, p.numbers)}
                    style={({ pressed }) => [styles.opt, on && styles.optOn, pressed && { opacity: 0.9 }]}
                  >
                    <View style={styles.optTop}>
                      <Text style={styles.name}>{p.name}</Text>
                      {on ? <Text style={styles.last}>{ui().presetSheet.picked}</Text> : null}
                    </View>
                    <Dial k={ui().presetSheet.onScreen} v={p.screen} on={on} />
                    <Dial k={ui().presetSheet.voice} v={p.voice} on={on} />
                    <Dial k={ui().presetSheet.numbers} v={p.numbers} on={on} />
                  </Pressable>
                );
              })}
            </View>
            {extra ? (
              <Pressable onPress={extra.onPress} accessibilityRole="button" accessibilityHint={extra.hint} style={({ pressed }) => [styles.opt, styles.extra, pressed && { opacity: 0.9 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name}>{extra.title}</Text>
                  <Text style={styles.dv}>{extra.text}</Text>
                </View>
                <Text style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no">
                  ›
                </Text>
              </Pressable>
            ) : null}
            <Text style={styles.small}>{ui().presetSheet.allThreeAreFreeMy}</Text>
            <Button title={ui().presetSheet.done} onPress={onClose} style={{ marginTop: spacing.xs }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Dial({ k, v, on }: { k: string; v: string; on: boolean }) {
  return (
    <View style={styles.dial}>
      <Text style={[styles.dk, on && { color: colors.lilacDeep }]}>{k}</Text>
      <Text style={styles.dv}>{v}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  opt: { gap: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.white },
  optOn: { backgroundColor: colors.lilac },
  extra: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: { fontFamily: fonts.body, fontSize: 22, color: colors.muted },
  optTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 2 },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.text, flexShrink: 1 },
  last: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.lilacDeep },
  dial: { flexDirection: 'row', gap: spacing.sm },
  dk: { width: 92, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  dv: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
}));
