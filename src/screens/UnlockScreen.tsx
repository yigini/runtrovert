import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buyUnlock, restoreUnlock, storePrice } from '../billing';
import { Button } from '../components/Button';
import { colors, fonts, radius, spacing, type, themedStyles, themed, switchColors } from '../theme';
import { BILLING_ON, priceLine, UNLOCKED_BUILD, unlockName, UNLOCK_PRICE, UNLOCK_PRICE_LATER } from '../unlock';
import { closeUnlock, updateUnlock, useUnlockOpen, useUnlockState, useUnlocked } from '../unlockState';
import { live, ui } from '../i18n/ui';

/** Mounted once in App.tsx. Anything can call openUnlock(); this shows the screen over the app. */
export function UnlockHost() {
  const open = useUnlockOpen();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={closeUnlock} statusBarTranslucent>
      <SafeAreaView style={styles.root}>{open && <UnlockScreen onClose={closeUnlock} />}</SafeAreaView>
    </Modal>
  );
}

const DOTS = themed(() => [colors.mint, colors.peach, colors.lilac, colors.sky, colors.butter]);
const ADDS: string[] = live(() => ui().unlock.adds);

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
    const r = await buyUnlock((message) => Alert.alert(ui().unlock.theStoreSaidNo, message));
    if (r.kind === 'off') Alert.alert(ui().unlock.notInThisBuild, ui().unlock.purchasesArriveWithTheStore);
    else if (r.kind === 'error') Alert.alert(ui().unlock.theStoreSaidNo, r.message);
  }

  async function onRestore() {
    const owned = await restoreUnlock();
    if (owned == null) Alert.alert(ui().unlock.couldNotReachTheStore, ui().unlock.tryAgainWithAConnection);
    else if (!owned) Alert.alert(ui().unlock.nothingToRestore, ui().unlock.thisStoreAccountHasnT(unlockName()));
  }

  // Store prices are local; the "becomes" line only reads right next to the euro price.
  const line = price === UNLOCK_PRICE ? priceLine() : ui().unlock.xOnceThePriceGoes(price);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screen}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={ui().unlock.close} hitSlop={10} style={styles.back}>
        <Text style={styles.backText}>{ui().unlock.back}</Text>
      </Pressable>
      <Text style={styles.h1} accessibilityRole="header">{ui().unlock.everythingOnce}</Text>
      <Text style={styles.lede}>{ui().unlock.freeForEveryRunThis}</Text>

      <View style={styles.card}>
        <Text style={type.eyebrow}>{ui().unlock.whatItAdds}</Text>
        {ADDS.map((text, i) => (
          <View key={text} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: DOTS[i] }]} />
            <Text style={styles.itemText}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <Text style={type.eyebrow}>{ui().unlock.freeAlways}</Text>
        <Text style={styles.free}>{ui().unlock.recordingEveryNumberFromEvery}</Text>
      </View>

      <View style={{ flex: 1, minHeight: spacing.lg }} />

      {state.owned ? (
        <View style={[styles.card, { backgroundColor: colors.mint }]}>
          <Text style={[styles.itemText, { fontFamily: fonts.bodySemi }]}>{ui().unlock.itSYoursThankYou}</Text>
          <Text style={type.small}>{ui().unlock.onePaymentKeptByYour}</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.small, { textAlign: 'center' }]}>{line}</Text>
          <Button title={unlocked && UNLOCKED_BUILD ? ui().unlock.unlockedInThisTestBuild : ui().unlock.unlockForX(price)} disabled={unlocked && UNLOCKED_BUILD} onPress={onBuy} />
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.quiet}>
            <Text style={styles.quietText}>{ui().unlock.notNow}</Text>
          </Pressable>
          {BILLING_ON && (
            <Pressable onPress={onRestore} accessibilityRole="button" style={styles.quiet}>
              <Text style={[styles.quietText, { color: colors.muted, fontFamily: fonts.body }]}>{ui().unlock.boughtItBeforeRestore}</Text>
            </Pressable>
          )}
        </View>
      )}

      {UNLOCKED_BUILD && !state.owned && (
        <View style={[styles.card, { backgroundColor: colors.butter }]}>
          <Text style={[type.eyebrow, { color: colors.butterDeep }]}>{ui().unlock.testBuild}</Text>
          <Text style={styles.free}>{ui().unlock.everythingIsUnlockedHereThe(UNLOCK_PRICE, UNLOCK_PRICE_LATER)}</Text>
          <View style={styles.switchRow}>
            <Text style={[styles.itemText, { flex: 1 }]} importantForAccessibility="no" accessibilityElementsHidden>{ui().unlock.showTheLocks}</Text>
            <Switch
              value={state.previewLocks}
              onValueChange={(v) => updateUnlock({ previewLocks: v, ...(v ? { nudge: 'unseen' as const } : {}) })}
              {...switchColors(state.previewLocks)}
              accessibilityLabel={ui().unlock.showTheLocks}
              accessibilityHint={ui().unlock.previewsTheStoreVersionS}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
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
}));
