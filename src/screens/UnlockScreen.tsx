import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buyUnlock, restoreUnlock, storePrice } from '../billing';
import { Button } from '../components/Button';
import { colors, fonts, radius, spacing, type } from '../theme';
import { BILLING_ON, PRICE_LINE, UNLOCKED_BUILD, UNLOCK_NAME, UNLOCK_PRICE, UNLOCK_PRICE_LATER } from '../unlock';
import { closeUnlock, updateUnlock, useUnlockOpen, useUnlockState, useUnlocked } from '../unlockState';

/** Mounted once in App.tsx. Anything can call openUnlock(); this shows the screen over the app. */
export function UnlockHost() {
  const open = useUnlockOpen();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={closeUnlock} statusBarTranslucent>
      <SafeAreaView style={styles.root}>{open && <UnlockScreen onClose={closeUnlock} />}</SafeAreaView>
    </Modal>
  );
}

const ADDS: Array<{ text: string; dot: string }> = [
  { text: 'Full training plans, past week 1', dot: colors.mint },
  { text: 'Trends and progress over months', dot: colors.peach },
  { text: 'Patterns in your places and your energy', dot: colors.lilac },
  { text: 'Backup, export of every run, Health Connect', dot: colors.sky },
  { text: 'Themes and widgets', dot: colors.butter },
];

/** Everything, once: what it adds, what stays free, one price, one plain line. Nothing else. */
export function UnlockScreen({ onClose }: { onClose: () => void }) {
  const unlocked = useUnlocked();
  const state = useUnlockState();
  const [price, setPrice] = useState(UNLOCK_PRICE);
  useEffect(() => {
    storePrice()
      .then((p) => p && setPrice(p))
      .catch(() => {});
  }, []);

  async function onBuy() {
    const r = await buyUnlock((message) => Alert.alert('The store said no', message));
    if (r.kind === 'off') Alert.alert('Not in this build', 'Purchases arrive with the store version. Test builds have everything unlocked.');
    else if (r.kind === 'error') Alert.alert('The store said no', r.message);
  }

  async function onRestore() {
    const owned = await restoreUnlock();
    if (owned == null) Alert.alert('Could not reach the store', 'Try again with a connection. Nothing on this phone has changed.');
    else if (!owned) Alert.alert('Nothing to restore', `This store account hasn't bought ${UNLOCK_NAME} yet.`);
  }

  // Store prices are local; the "becomes" line only reads right next to the euro price.
  const line = price === UNLOCK_PRICE ? PRICE_LINE : `${price}, once. The price goes up when full training plans arrive.`;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screen}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.back}>
        <Text style={styles.backText}>‹  Back</Text>
      </Pressable>
      <Text style={styles.h1} accessibilityRole="header">
        Everything, once.
      </Text>
      <Text style={styles.lede}>Free for every run. This is for the long run.</Text>

      <View style={styles.card}>
        <Text style={type.eyebrow}>What it adds</Text>
        {ADDS.map((a) => (
          <View key={a.text} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: a.dot }]} />
            <Text style={styles.itemText}>{a.text}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <Text style={type.eyebrow}>Free, always</Text>
        <Text style={styles.free}>Recording, every number from every run, Your places, Listen, quiet reminders, silent runs, the map, privacy. Nobody pays to be left alone.</Text>
      </View>

      <View style={{ flex: 1, minHeight: spacing.lg }} />

      {state.owned ? (
        <View style={[styles.card, { backgroundColor: colors.mint }]}>
          <Text style={[styles.itemText, { fontFamily: fonts.bodySemi }]}>It's yours. Thank you.</Text>
          <Text style={type.small}>One payment, kept by your store account. Nothing to renew, nothing to sign in to.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.small, { textAlign: 'center' }]}>{line}</Text>
          <Button title={unlocked && UNLOCKED_BUILD ? 'Unlocked in this test build' : `Unlock for ${price}`} disabled={unlocked && UNLOCKED_BUILD} onPress={onBuy} />
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.quiet}>
            <Text style={styles.quietText}>Not now</Text>
          </Pressable>
          {BILLING_ON && (
            <Pressable onPress={onRestore} accessibilityRole="button" style={styles.quiet}>
              <Text style={[styles.quietText, { color: colors.muted, fontFamily: fonts.body }]}>Bought it before? Restore</Text>
            </Pressable>
          )}
        </View>
      )}

      {UNLOCKED_BUILD && !state.owned && (
        <View style={[styles.card, { backgroundColor: colors.butter }]}>
          <Text style={[type.eyebrow, { color: colors.butterDeep }]}>Test build</Text>
          <Text style={styles.free}>
            Everything is unlocked here. The store version charges {UNLOCK_PRICE}, then {UNLOCK_PRICE_LATER} once full plans arrive. Switch this on to see the app the way a new store user does.
          </Text>
          <View style={styles.switchRow}>
            <Text style={[styles.itemText, { flex: 1 }]} importantForAccessibility="no" accessibilityElementsHidden>
              Show the locks
            </Text>
            <Switch
              value={state.previewLocks}
              onValueChange={(v) => updateUnlock({ previewLocks: v, ...(v ? { nudge: 'unseen' as const } : {}) })}
              trackColor={{ true: colors.ink }}
              accessibilityLabel="Show the locks"
              accessibilityHint="Previews the store version's locks in this test build"
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  screen: { flexGrow: 1, padding: spacing.md + 4, paddingTop: spacing.sm, gap: spacing.md, backgroundColor: colors.cream },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.5, color: colors.text },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 24, color: colors.inkSoft, marginTop: -spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  itemText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text, flexShrink: 1 },
  free: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: spacing.md },
  backText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14 },
});
