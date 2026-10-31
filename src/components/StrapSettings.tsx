import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { saveStrap, scanStraps, strapCheck, strapSupported, useStrap, type Strap } from '../strap';
import { colors, fonts, radius, spacing } from '../theme';
import { ui } from '../i18n/ui';

type Look = { kind: 'idle' } | { kind: 'looking'; found: Strap[] } | { kind: 'done'; found: Strap[] } | { kind: 'off' } | { kind: 'denied' };

/**
 * Settings > Heart rate from a strap or watch. Find a sensor once; after that
 * the phone connects to it by itself whenever a run starts (src/strap.ts).
 * While this section is on screen it shows the live reading, so the runner
 * knows it works before going out. Android only, free.
 */
export function StrapSettings() {
  const v = useStrap();
  const [look, setLook] = useState<Look>({ kind: 'idle' });
  const stop = useRef<(() => void) | null>(null);

  // The live reading while Settings is open; let go on the way out.
  useEffect(() => {
    strapCheck(true);
    return () => {
      strapCheck(false);
      stop.current?.();
    };
  }, []);

  if (!strapSupported()) return null;

  async function find() {
    stop.current?.();
    const found: Strap[] = [];
    setLook({ kind: 'looking', found: [] });
    const r = await scanStraps(
      (s) => {
        found.push(s);
        setLook({ kind: 'looking', found: found.slice() });
      },
      () => setLook({ kind: 'done', found: found.slice() }),
    );
    if (r === 'off' || r === 'denied') setLook({ kind: r });
    else stop.current = r;
  }

  function pick(s: Strap) {
    stop.current?.();
    stop.current = null;
    setLook({ kind: 'idle' });
    void saveStrap(s);
  }

  const status = !v.strap
    ? ui().strap.none
    : v.bpm != null
      ? ui().strap.hearing(v.bpm)
      : v.state === 'noHeart'
        ? ui().strap.noHeart
        : v.state === 'connected'
          ? ui().strap.waiting
          : ui().strap.notReached;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{ui().strap.section}</Text>
      <Text style={styles.intro}>{ui().strap.intro}</Text>

      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: spacing.md }} accessible accessibilityLiveRegion="polite">
          <Text style={styles.label}>{v.strap ? v.strap.name : ui().strap.none}</Text>
          {v.strap ? <Text style={styles.hint}>{status}</Text> : null}
        </View>
        {v.strap ? (
          <Pressable onPress={() => void saveStrap(null)} accessibilityRole="button" accessibilityLabel={ui().strap.forgetX(v.strap.name)} hitSlop={8} style={styles.link}>
            <Text style={styles.linkText}>{ui().strap.forget}</Text>
          </Pressable>
        ) : null}
        {look.kind === 'looking' ? (
          <Pressable
            onPress={() => {
              stop.current?.();
              stop.current = null;
              setLook({ kind: 'idle' });
            }}
            accessibilityRole="button"
            style={styles.button}
          >
            <Text style={styles.buttonText}>{ui().strap.cancel}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => void find()} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>{v.strap ? ui().strap.change : ui().strap.find}</Text>
          </Pressable>
        )}
      </View>

      {look.kind === 'looking' || look.kind === 'done' ? (
        <View style={{ gap: spacing.sm }}>
          {look.found.map((s) => (
            <Pressable key={s.id} onPress={() => pick(s)} accessibilityRole="button" accessibilityLabel={ui().strap.useX(s.name)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.label, { flex: 1 }]}>{s.name}</Text>
              <Text style={styles.use}>{ui().strap.use}</Text>
            </Pressable>
          ))}
          {look.kind === 'looking' ? <Text style={styles.intro} accessibilityLiveRegion="polite">{ui().strap.looking}</Text> : null}
          {look.kind === 'done' && !look.found.length ? <Text style={styles.intro} accessibilityLiveRegion="polite">{ui().strap.nothingFound}</Text> : null}
        </View>
      ) : null}
      {look.kind === 'off' ? <Text style={styles.warning}>{ui().strap.bluetoothOff}</Text> : null}
      {look.kind === 'denied' ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="link">
          <Text style={styles.warning}>{ui().strap.denied}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.intro}>{ui().strap.privacy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 2, backgroundColor: colors.mint },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mintDeep },
  intro: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14, minHeight: 48 },
  label: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  use: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep },
  warning: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text },
  button: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 13 },
  link: { marginRight: spacing.md, minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep, textDecorationLine: 'underline' },
});
