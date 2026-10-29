import React from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { type Tip } from '../tips';
import { localTips, localTipsByTopic } from '../i18n/voice';
import { ui } from '../i18n/ui';

const GROUPS = localTipsByTopic();
const COUNT = localTips().length;
const TINT = [colors.mint, colors.peach, colors.lilac, colors.butter, colors.sky];

/** The whole list, grouped. Something to read on the sofa, not during the run. */
export function TipsScreen({ visible, today, hidden, onHidden, onClose }: { visible: boolean; today: Tip | null; hidden: boolean; onHidden: (v: boolean) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.top}>
            <Text style={styles.h1} accessibilityRole="header">{ui().tips.thingsNobodyTellsYou}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={ui().tips.close} hitSlop={12} style={styles.close}>
              <Text style={styles.closeText}>{ui().tips.done}</Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>{ui().tips.xSmallThingsAboutRunning(COUNT)}</Text>

          {today ? (
            <View style={[styles.today]}>
              <Text style={styles.todayLabel}>{ui().tips.today}</Text>
              <Text style={styles.todayText}>{today.text}</Text>
              {today.source ? <Text style={styles.sourceOnInk}>{today.source}</Text> : null}
            </View>
          ) : null}

          {GROUPS.map((g, i) => (
            <View key={g.key} style={[styles.group, { backgroundColor: TINT[i % TINT.length] }]}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              {g.tips.map((t) => (
                <View key={t.id} style={styles.tip}>
                  <Text style={styles.tipText}>{t.text}</Text>
                  {t.source ? <Text style={styles.source}>{t.source}</Text> : null}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.rowLabel}>{ui().tips.oneOnTheHomeScreen}</Text>
              <Text style={styles.rowHint}>{ui().tips.aNewOneEachDay}</Text>
            </View>
            <Switch value={!hidden} onValueChange={(v) => onHidden(!v)} trackColor={{ true: colors.ink }} />
          </View>
          <Text style={styles.small}>{ui().tips.tipsNotMedicalAdviceIf}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.md, paddingTop: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  h1: { flex: 1, fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  close: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9, marginTop: 4 },
  closeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },
  sub: { fontFamily: fonts.displayItalic, fontSize: 16, lineHeight: 22, color: colors.inkSoft },
  today: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  todayLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.onInkMuted },
  todayText: { fontFamily: fonts.displayItalic, fontSize: 18, lineHeight: 25, color: colors.cream },
  sourceOnInk: { fontFamily: fonts.body, fontSize: 12, color: colors.onInkMuted },
  group: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  groupTitle: { fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.inkSoft },
  tip: { backgroundColor: colors.cream, borderRadius: radius.md, padding: 14, gap: 4 },
  tipText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  source: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14 },
  rowLabel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  rowHint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center' },
});
