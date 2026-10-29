import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRESETS, type RunPreset } from '../presets';
import { colors, fonts, radius, spacing } from '../theme';
import { Button } from './Button';

/**
 * "What kind of run today?" The three presets side by side, with what each
 * brings on screen, in your ears and in numbers. Picking one remembers it.
 */
export function PresetSheet({ open, value, onPick, onClose }: { open: boolean; value: RunPreset; onPick: (p: RunPreset) => void; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={{ gap: spacing.sm + 4 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.h2} accessibilityRole="header">
              What kind of run today?
            </Text>
            <Text style={styles.small}>Pick how much comes in with you. It’s remembered, so next time you just press Start.</Text>
            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm + 2 }}>
              {PRESETS.map((p) => {
                const on = p.key === value;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => onPick(p.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${p.name}. On screen: ${p.screen}. Voice: ${p.voice}. Numbers: ${p.numbers}.`}
                    style={({ pressed }) => [styles.opt, on && styles.optOn, pressed && { opacity: 0.9 }]}
                  >
                    <View style={styles.optTop}>
                      <Text style={styles.name}>{p.name}</Text>
                      {on ? <Text style={styles.last}>Picked</Text> : null}
                    </View>
                    <Dial k="On screen" v={p.screen} on={on} />
                    <Dial k="Voice" v={p.voice} on={on} />
                    <Dial k="Numbers" v={p.numbers} on={on} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.small}>All three are free. My plan needs a plan from the Train tab; without one it runs as Just run.</Text>
            <Button title="Done" onPress={onClose} style={{ marginTop: spacing.xs }} />
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

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,39,51,0.2)', marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  opt: { gap: 6, paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.white },
  optOn: { backgroundColor: colors.lilac },
  optTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 2 },
  name: { fontFamily: fonts.display, fontSize: 20, color: colors.text, flexShrink: 1 },
  last: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.lilacDeep },
  dial: { flexDirection: 'row', gap: spacing.sm },
  dk: { width: 92, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  dv: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
});
