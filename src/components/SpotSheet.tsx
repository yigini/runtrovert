import { Camera, Map as MapLibreMap } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { lastPlace } from '../place';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing } from '../theme';
import type { LatLon } from '../types';
import { askAboutTiles, MAP_STYLE } from './RouteMap';
import { Button } from './Button';
import { ui } from '../i18n/ui';

/**
 * Settings > Home and work: put one of them on the map. The pin stays in the
 * middle and the map moves under it, so a thumb never covers the spot. "Use
 * where I am now" asks the phone once. With Plain map on there are no streets
 * to aim at, so the sheet says so and leans on where you are.
 */
export function SpotSheet({ open, title, initial, onSave, onClose }: { open: boolean; title: string; initial: LatLon | null; onSave: (p: LatLon) => void; onClose: () => void }) {
  const { settings, update } = useSettings();
  const plain = settings.plainMap || !settings.mapNoticeSeen;
  const [start, setStart] = useState<LatLon | null>(initial);
  const center = useRef<LatLon | null>(initial);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNote(null);
    center.current = initial;
    setStart(initial);
    if (!initial) lastPlace().then((p) => p && setStart((cur) => cur ?? p));
    // Streets need the one-time map question answered first, as on every other map.
    if (!settings.plainMap && !settings.mapNoticeSeen) askAboutTiles(update);
  }, [open]);

  async function useHere() {
    setLocating(true);
    setNote(null);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setNote(ui().commute.noLocation);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      // Straight in: standing at the spot is the point of the button.
      onSave(p);
    } catch {
      setNote(ui().commute.noLocation);
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* The scrim sits behind the sheet, not around it: a Pressable around the map
          takes the touch as a press and the map never gets to pan. */}
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={ui().commute.cancel} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.h2} accessibilityRole="header">{title}</Text>
          <Text style={styles.small}>{settings.plainMap ? ui().commute.plainHint : start ? ui().commute.sheetHint : ui().commute.noMapYet}</Text>
          {start && !plain ? (
            <View style={styles.map}>
              <MapLibreMap
                style={StyleSheet.absoluteFill}
                mapStyle={MAP_STYLE}
                logo={false}
                attribution
                compass={false}
                touchRotate={false}
                touchPitch={false}
                onRegionDidChange={(e) => {
                  const [longitude, latitude] = e.nativeEvent.center;
                  center.current = { latitude, longitude };
                }}
              >
                <Camera initialViewState={{ center: [start.longitude, start.latitude], zoom: 15 }} />
              </MapLibreMap>
              <View pointerEvents="none" style={styles.pinWrap} accessible accessibilityLabel={ui().commute.pinLabel}>
                <View style={styles.pin} />
                <View style={styles.pinStem} />
              </View>
            </View>
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Pressable onPress={useHere} disabled={locating} accessibilityRole="button" style={({ pressed }) => [styles.here, pressed && { opacity: 0.85 }]}>
            {locating ? <ActivityIndicator color={colors.lilacDeep} /> : null}
            <Text style={styles.hereText}>{locating ? ui().commute.locating : ui().commute.useHere}</Text>
          </Pressable>
          {start && !plain ? (
            <Button
              title={ui().commute.save}
              onPress={() => {
                const p = center.current ?? start;
                if (p) onSave(p);
              }}
            />
          ) : null}
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>{ui().commute.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,39,51,0.2)', marginTop: -8, marginBottom: 4 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  note: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.peachDeep },
  map: { height: 280, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.mintSoft },
  pinWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 26 },
  pin: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.peach, borderWidth: 3, borderColor: colors.ink },
  pinStem: { width: 3, height: 12, backgroundColor: colors.ink, marginTop: -1 },
  here: { flexDirection: 'row', gap: spacing.sm, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  hereText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.lilacDeep },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textDecorationLine: 'underline' },
});
