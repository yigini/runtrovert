import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { saveStrap, scanStraps, strapCheck, strapSupported, useStrap, type Strap } from '../strap';
import { colors, fonts, spacing, themedStyles } from '../theme';
import { Group, kit, Note, PlainRow, RowButton, RowLink } from './SettingsKit';
import { ui } from '../i18n/ui';

type Look = { kind: 'idle' } | { kind: 'looking'; found: Strap[] } | { kind: 'done'; found: Strap[] } | { kind: 'off' } | { kind: 'denied' };

/**
 * Settings > Watch and heart rate, the strap part. Find a sensor once; after that
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
    <View style={{ gap: spacing.md }}>
      <Group title={ui().strap.section}>
        <PlainRow>
          <View style={{ flex: 1, paddingRight: spacing.sm }} accessible accessibilityLiveRegion="polite">
            <Text style={kit.label}>{v.strap ? v.strap.name : ui().strap.none}</Text>
            {v.strap ? <Text style={kit.hint}>{status}</Text> : null}
          </View>
          {v.strap ? <RowLink label={ui().strap.forget} onPress={() => void saveStrap(null)} accessibilityLabel={ui().strap.forgetX(v.strap.name)} /> : null}
          {look.kind === 'looking' ? (
            <RowButton
              label={ui().strap.cancel}
              onPress={() => {
                stop.current?.();
                stop.current = null;
                setLook({ kind: 'idle' });
              }}
            />
          ) : (
            <RowButton label={v.strap ? ui().strap.change : ui().strap.find} onPress={() => void find()} />
          )}
        </PlainRow>
        {look.kind === 'looking' || look.kind === 'done'
          ? look.found.map((s) => (
              <PlainRow key={s.id} onPress={() => pick(s)} accessibilityLabel={ui().strap.useX(s.name)}>
                <Text style={[kit.label, { flex: 1 }]}>{s.name}</Text>
                <Text style={styles.use}>{ui().strap.use}</Text>
              </PlainRow>
            ))
          : null}
      </Group>
      <Note>{ui().strap.intro}</Note>
      {look.kind === 'looking' ? <Text style={styles.warning} accessibilityLiveRegion="polite">{ui().strap.looking}</Text> : null}
      {look.kind === 'done' && !look.found.length ? <Text style={styles.warning} accessibilityLiveRegion="polite">{ui().strap.nothingFound}</Text> : null}
      {look.kind === 'off' ? <Text style={styles.warning}>{ui().strap.bluetoothOff}</Text> : null}
      {look.kind === 'denied' ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="link">
          <Text style={[styles.warning, { textDecorationLine: 'underline' }]}>{ui().strap.denied}</Text>
        </Pressable>
      ) : null}
      <Note>{ui().strap.privacy}</Note>
    </View>
  );
}

const styles = themedStyles(() => ({
  use: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep },
  warning: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text, paddingHorizontal: spacing.xs },
}));
