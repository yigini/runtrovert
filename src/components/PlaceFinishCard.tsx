import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { offerLine } from '../places';
import type { FinishPlace, PlaceDraft } from '../placeStore';
import { colors, fonts, radius, spacing } from '../theme';
import { ui } from '../i18n/ui';

/**
 * Where you ran, on the finish screen. A loop you've kept says so and takes
 * today's notes into its log. The third run of a loop you haven't kept gets one
 * quiet offer; "Not now" means never for that loop. Any other run with a route
 * gets one small link to keep it as a place anyway, from the very first run.
 */
export function PlaceFinishCard({ found, draft, onOffer, onNotNow }: { found: FinishPlace | null; draft: PlaceDraft | null; onOffer: () => void; onNotNow: () => void }) {
  if (!found) return null;
  if (found.offer.kind === 'place' && found.place) {
    return (
      <View style={[styles.card, styles.known]} accessible accessibilityLabel={ui().placeFinishCard.onXTodaySBusyness(found.place.name)}>
        <Pin color={colors.mintDeep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{ui().placeFinishCard.onX(found.place.name)}</Text>
          <Text style={styles.small}>{ui().placeFinishCard.todaySBusynessAndNote}</Text>
        </View>
      </View>
    );
  }
  if (!found.sig) return null;
  if (draft) {
    return (
      <Pressable onPress={onOffer} accessibilityRole="button" accessibilityHint={ui().placeFinishCard.changeTheNameOrNotes} style={({ pressed }) => [styles.card, styles.offer, styles.rowCard, pressed && { opacity: 0.9 }]}>
        <Pin color={colors.mintDeep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{ui().placeFinishCard.keptAsX(draft.name)}</Text>
          <Text style={styles.small}>{ui().placeFinishCard.savedWithThisRunWhen}</Text>
        </View>
      </Pressable>
    );
  }
  if (found.offer.kind !== 'offer') {
    return (
      <Pressable onPress={onOffer} accessibilityRole="button" accessibilityHint={ui().placeFinishCard.saveAsAPlaceHint} hitSlop={6} style={({ pressed }) => [styles.link, pressed && { opacity: 0.85 }]}>
        <Pin color={colors.mintDeep} size={18} />
        <Text style={styles.linkText}>{ui().placeFinishCard.saveAsAPlace}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, styles.offer]}>
      <Pressable onPress={onOffer} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
        <Pin color={colors.mintDeep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{offerLine(found.offer.earlier.length)}</Text>
          <Text style={styles.small}>{ui().placeFinishCard.nameItNoteHowBusy}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onNotNow} accessibilityRole="button" accessibilityLabel={ui().placeFinishCard.notNowThisLoopWon} hitSlop={6} style={styles.notNow}>
        <Text style={styles.notNowText}>{ui().placeFinishCard.notNow}</Text>
      </Pressable>
    </View>
  );
}

function Pin({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
      <Circle cx={12} cy={9} r={2.5} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 18, gap: 4 },
  known: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.mintSoft },
  offer: { backgroundColor: colors.mint, flexDirection: 'column' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.mintDeep },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.mintDeep },
  notNow: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44 },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.mintDeep, textDecorationLine: 'underline' },
  notNowText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.mintDeep, textDecorationLine: 'underline' },
});
