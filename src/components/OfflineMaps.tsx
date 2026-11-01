import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { dateLocale } from '../i18n/lang';
import { AROUND_KM, boxAround, roughMb } from '../mapArea';
import { formatDistance } from '../geo';
import { deleteArea, listAreas, saveArea, type SavedArea } from '../offlineMaps';
import { lastPlace } from '../place';
import { useSettings } from '../settings';
import { spacing } from '../theme';
import { Group, kit, Note, PlainRow, WideButton } from './SettingsKit';
import { ui } from '../i18n/ui';

const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1048576));

/**
 * Settings > Map > Maps without signal. Street maps kept on this phone for
 * runs where there's no signal. Only with street tiles on (Plain map off).
 */
export function OfflineMaps() {
  const { settings } = useSettings();
  const [areas, setAreas] = useState<SavedArea[] | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    listAreas()
      .then(setAreas)
      .catch(() => setAreas([]));
  }, []);
  useEffect(reload, [reload]);
  // A map still saving (from here or from a route) shows its progress.
  useEffect(() => {
    if (!areas?.some((a) => !a.done)) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [areas, reload]);

  if (settings.plainMap) return <Note>{ui().offline.plainOn}</Note>;

  async function saveHere() {
    const here = await lastPlace();
    if (!here) return void Alert.alert(ui().offline.title, ui().offline.noPlace);
    const box = boxAround(here.latitude, here.longitude);
    const name = ui().offline.aroundHere(new Date().toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' }));
    Alert.alert(ui().offline.saveHereTitle, ui().offline.saveHereBody(formatDistance(AROUND_KM * 2000, settings.unitsKm), roughMb(box)), [
      { text: ui().offline.notNow, style: 'cancel' },
      {
        text: ui().offline.save,
        onPress: async () => {
          setBusy(true);
          setLine(ui().offline.saving(0));
          const r = await saveArea(name, box, (p) => setLine(ui().offline.saving(p))).catch(() => 'failed' as const);
          setLine(r === 'done' ? ui().offline.saved(name) : ui().offline.failed);
          setBusy(false);
          reload();
        },
      },
    ]);
  }

  function pick(a: SavedArea) {
    Alert.alert(a.name, ui().offline.removeBody, [
      { text: ui().offline.keep, style: 'cancel' },
      { text: ui().offline.remove, style: 'destructive', onPress: () => void deleteArea(a).then(reload) },
    ]);
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Group title={ui().offline.title}>
        {areas?.map((a) => (
          <PlainRow key={a.key} onPress={() => pick(a)} accessibilityLabel={a.name}>
            <View style={{ flex: 1 }}>
              <Text style={kit.label} numberOfLines={1}>{a.name}</Text>
              <Text style={kit.hint}>{a.done ? ui().offline.areaLine(mb(a.bytes)) : ui().offline.saving(a.percent)}</Text>
            </View>
          </PlainRow>
        ))}
      </Group>
      {!busy ? <WideButton label={ui().offline.saveHere} onPress={() => void saveHere()} quiet={!!areas?.length} /> : null}
      {line ? (
        <Note strong>
          <Text accessibilityLiveRegion="polite">{line}</Text>
        </Note>
      ) : null}
      <Note>{ui().offline.about}</Note>
    </View>
  );
}
