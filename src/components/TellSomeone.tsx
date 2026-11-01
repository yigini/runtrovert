import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Share, Switch, Text, View } from 'react-native';
import { tellStore } from '../extraStores';
import { lastPlace } from '../place';
import { BACK_IN, backBy, outMessage } from '../tellSomeone';
import { colors, fonts, radius, spacing, switchColors, type, themedStyles } from '../theme';
import type { LatLon } from '../types';
import { Button } from './Button';
import { Segmented } from './SettingsKit';
import { ui } from '../i18n/ui';

/** The words under Start, only once Tell someone is switched on in Settings. */
export function useTellSomeone(): boolean {
  return tellStore.use()?.on === true;
}

/**
 * Tell someone: how long, whether to add where you start, the message as it
 * will read, then the share sheet. The person is picked in your own messaging
 * app; nothing goes through Runtrovert.
 */
export function TellSomeoneSheet({ open, near, onClose }: { open: boolean; near: string | null; onClose: () => void }) {
  const t = tellStore.use();
  const [minutes, setMinutes] = useState(45);
  const [withPlace, setWithPlace] = useState(false);
  const [start, setStart] = useState<LatLon | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open || !t) return;
    setMinutes(t.minutes);
    setWithPlace(t.withPlace);
    setNow(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open || !withPlace) return;
    let alive = true;
    lastPlace()
      .then((p) => alive && setStart(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, withPlace]);
  if (!t) return null;
  const s = ui().tellSomeone;
  const back = backBy(now, minutes);
  const message = outMessage(near, back, withPlace ? start : null);

  async function send() {
    try {
      const r = await Share.share({ message });
      if (r.action === Share.sharedAction) {
        await tellStore.save({ told: { at: Date.now(), backBy: back } });
        onClose();
      }
    } catch {
      // nothing sent; the sheet stays for another try
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={s.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <Text style={styles.h2} accessibilityRole="header">{s.title}</Text>
          <View style={{ gap: 6 }}>
            <Text style={type.eyebrow}>{s.backInSheet}</Text>
            <Segmented value={String(minutes)} options={BACK_IN.map(String)} labels={Object.fromEntries(BACK_IN.map((m) => [String(m), s.minutes(m)]))} onChange={(v) => setMinutes(Number(v))} accessibilityLabel={s.backInSheet} />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Text style={styles.label}>{s.withPlace}</Text>
              <Text style={type.small}>{s.withPlaceHint}</Text>
            </View>
            <Switch value={withPlace} onValueChange={setWithPlace} accessibilityLabel={s.withPlace} accessibilityHint={s.withPlaceHint} {...switchColors(withPlace)} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={type.eyebrow}>{s.theyRead}</Text>
            <Text style={styles.preview} selectable>{message}</Text>
          </View>
          <Button title={s.send} onPress={() => void send()} />
          <Text style={[type.small, { textAlign: 'center' }]}>{s.sentNote}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  preview: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
}));
