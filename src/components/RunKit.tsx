import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { changeShoes, useShoes } from '../shoeStore';
import { dueForReplacing, retireShoe, setRunShoe, totals } from '../shoes';
import { listRuns } from '../db';
import { roughDistance } from '../weekGoal';
import { loadPhoto, pickPhoto, photoUri, removePhoto, sharePhoto, type RunPhoto } from '../runPhoto';
import { tellStore } from '../extraStores';
import { wantsBack } from '../tellSomeone';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import type { Run } from '../types';
import { Button } from './Button';
import { ui } from '../i18n/ui';

/**
 * The quiet things around a kept run, under its note: the photo (if there is
 * one), which shoes it was in, and a small "Add a photo". Shoes only show once
 * a pair is listed in Settings, so a first run's page stays as it was.
 */
export function RunKit({ run, km }: { run: Run; km: boolean }) {
  const book = useShoes();
  const [photo, setPhoto] = useState<RunPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadPhoto(run.id).then((p) => alive && setPhoto(p));
    return () => {
      alive = false;
    };
  }, [run.id]);
  const hasShoes = !!book && book.shoes.length > 0;
  useEffect(() => {
    if (!hasShoes) return;
    let alive = true;
    listRuns()
      .then((r) => alive && setRuns(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hasShoes, run.id, run.distanceM]);

  const shoeId = book?.runs[String(run.id)] ?? null;
  const shoe = shoeId ? book?.shoes.find((s) => s.id === shoeId) ?? null : null;
  const sums = useMemo(() => (book && runs ? totals(book, runs) : null), [book, runs]);
  const due = book && sums && shoe ? dueForReplacing(book, sums).find((s) => s.id === shoe.id) ?? null : null;

  function addPhoto() {
    const p = ui().runPhoto;
    Alert.alert(p.addTitle, p.addText, [
      { text: p.cancel, style: 'cancel' },
      { text: p.choose, onPress: () => void doPick('library') },
      { text: p.take, onPress: () => void doPick('camera') },
    ]);
  }

  async function doPick(from: 'camera' | 'library') {
    setAdding(true);
    try {
      const r = await pickPhoto(run.id, from);
      if (r === 'noCamera') Alert.alert(ui().runPhoto.couldnt, ui().runPhoto.noCamera);
      else if (r !== 'cancelled') setPhoto(r);
    } catch (e) {
      Alert.alert(ui().runPhoto.couldnt, String((e as Error)?.message ?? e));
    } finally {
      setAdding(false);
    }
  }

  function onRemovePhoto() {
    const p = ui().runPhoto;
    Alert.alert(p.removeTitle, p.removeText, [
      { text: p.keep, style: 'cancel' },
      {
        text: p.removeYes,
        style: 'destructive',
        onPress: async () => {
          await removePhoto(run.id).catch(() => {});
          setPhoto(null);
        },
      },
    ]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {photo ? (
        <View style={{ gap: 4 }}>
          <Image source={{ uri: photoUri(photo) }} style={[styles.photo, { aspectRatio: photo.w && photo.h ? Math.max(0.6, Math.min(1.8, photo.w / photo.h)) : 4 / 3 }]} resizeMode="cover" accessible accessibilityLabel={ui().runPhoto.label} />
          <View style={styles.links}>
            <Pressable onPress={() => void sharePhoto(run.id, ui().runPhoto.share).catch(() => {})} accessibilityRole="button" hitSlop={8} style={styles.link}>
              <Text style={styles.linkText}>{ui().runPhoto.share}</Text>
            </Pressable>
            <Pressable onPress={onRemovePhoto} accessibilityRole="button" hitSlop={8} style={styles.link}>
              <Text style={styles.linkText}>{ui().runPhoto.remove}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.links}>
        {hasShoes ? (
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`${ui().shoes.onRun}: ${shoe?.name ?? ui().shoes.none}. ${ui().shoes.change}`} hitSlop={8} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {ui().shoes.onRun} · {shoe?.name ?? ui().shoes.none} ›
            </Text>
          </Pressable>
        ) : null}
        {!photo ? (
          adding ? (
            <View style={[styles.link, { flexDirection: 'row', gap: 6, alignItems: 'center' }]} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={type.small}>{ui().runPhoto.adding}</Text>
            </View>
          ) : (
            <Pressable onPress={addPhoto} accessibilityRole="button" hitSlop={8} style={styles.link}>
              <Text style={styles.linkText}>{ui().runPhoto.add}</Text>
            </Pressable>
          )
        ) : null}
      </View>
      {due && sums ? (
        <View style={styles.due}>
          <Text style={styles.dueTitle}>{ui().shoes.dueTitle(due.name, roughDistance(sums.get(due.id)?.distanceM ?? 0, km))}</Text>
          <Text style={type.small}>{ui().shoes.dueText}</Text>
          <View style={styles.links}>
            <Pressable onPress={() => void changeShoes((b) => retireShoe(b, due.id, Date.now()))} accessibilityRole="button" hitSlop={8} style={styles.link}>
              <Text style={styles.linkText}>{ui().shoes.putAway}</Text>
            </Pressable>
            <Pressable onPress={() => void changeShoes((b) => ({ ...b, noted: [...b.noted, due.id] }))} accessibilityRole="button" hitSlop={8} style={styles.link}>
              <Text style={styles.linkText}>{ui().shoes.notYet}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {book ? (
        <ShoePicker
          open={picking}
          shoes={book.shoes.filter((s) => !s.retiredAt || s.id === shoeId)}
          value={shoeId}
          onPick={(id) => {
            setPicking(false);
            void changeShoes((b) => setRunShoe(b, run.id, id));
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

function ShoePicker({ open, shoes, value, onPick, onClose }: { open: boolean; shoes: Array<{ id: string; name: string }>; value: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const options = [...shoes.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: ui().shoes.none }];
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={ui().tellSomeone.close} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.grabber} />
          <Text style={styles.h2} accessibilityRole="header">{ui().shoes.pickTitle}</Text>
          <ScrollView contentContainerStyle={{ gap: 2 }} style={{ borderRadius: radius.md }}>
            {options.map((o) => {
              const on = o.id === value;
              return (
                <Pressable key={o.id ?? 'none'} onPress={() => onPick(o.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
                  <View style={[styles.radio, on && styles.radioOn]} />
                  <Text style={styles.optionText}>{o.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Right after Save run, when a "Tell someone" message went out before it: one
 * tap sends "I'm back" through the share sheet. Shown once, for that run.
 */
export function BackHomeCard({ run }: { run: Run }) {
  const tell = tellStore.use();
  if (!tell || run.endedAt == null || !wantsBack(tell, run)) return null;
  const done = () => void tellStore.save({ told: null, backFor: run.id });
  return (
    <View style={styles.back}>
      <Text style={styles.dueTitle}>{ui().tellSomeone.backTitle}</Text>
      <Text style={type.small}>{ui().tellSomeone.sentNote}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Button
          title={ui().tellSomeone.backSend}
          variant="secondary"
          onPress={() => {
            Share.share({ message: ui().tellSomeone.msgBack })
              .then((r) => {
                if (r.action === Share.sharedAction) done();
              })
              .catch(() => {});
          }}
          style={{ flex: 1, minHeight: 48 }}
        />
        <Pressable onPress={done} accessibilityRole="button" hitSlop={8} style={styles.link}>
          <Text style={styles.linkText}>{ui().tellSomeone.notNow}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  photo: { width: '100%', borderRadius: radius.lg, backgroundColor: colors.white },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textDecorationLine: 'underline' },
  chip: { minHeight: 36, justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 14, maxWidth: '100%' },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  due: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  back: { backgroundColor: colors.lilacSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  dueTitle: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.text },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grabber, marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, backgroundColor: colors.white, minHeight: 52, paddingHorizontal: 14 },
  optionText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, flex: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.ring },
  radioOn: { borderWidth: 6, borderColor: colors.ink },
}));
