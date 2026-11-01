import React, { useCallback, useEffect, useState } from 'react';
import { okToFollow } from '../followCheck';
import { Alert, Text, View } from 'react-native';
import { formatDistance } from '../geo';
import { boxOfPath, roughMb } from '../mapArea';
import { saveArea, tooBig } from '../offlineMaps';
import { deleteRoute, listRoutes, pickAndKeepRoutes, type SavedRoute } from '../routeStore';
import { useSettings } from '../settings';
import { spacing } from '../theme';
import { Group, kit, Note, PlainRow, WideButton } from './SettingsKit';
import { ui } from '../i18n/ui';

/**
 * Settings > Routes to follow. Routes brought in from a file, kept on this
 * phone. Tap one: follow it, keep its map for no signal, or let it go. A past
 * run is followed from Your runs and isn't listed here.
 */
export function RoutesSettings({ onFollow }: { onFollow: (r: SavedRoute) => void }) {
  const { settings } = useSettings();
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const reload = useCallback(() => {
    listRoutes()
      .then(setRoutes)
      .catch(() => setRoutes([]));
  }, []);
  useEffect(reload, [reload]);

  async function bringIn() {
    setLine(null);
    const r = await pickAndKeepRoutes(ui().routes.routeN).catch(() => ({ added: 0, empty: 1 }));
    if (!r) return;
    setLine(r.added ? ui().routes.added(r.added) : ui().routes.noneInFile);
    reload();
  }

  async function saveMap(r: SavedRoute) {
    const box = boxOfPath(r.path);
    if (!box) return;
    if (tooBig(box)) return void Alert.alert(ui().offline.tooBigTitle, ui().offline.tooBig);
    setLine(ui().offline.saving(0));
    const result = await saveArea(r.name, box, (p) => setLine(ui().offline.saving(p))).catch(() => 'failed' as const);
    setLine(result === 'done' ? ui().offline.saved(r.name) : ui().offline.failed);
  }

  async function follow(r: SavedRoute) {
    setLine(ui().routes.checking);
    const go = await okToFollow(r.path, r.name, settings.unitsKm);
    setLine(null);
    if (go) onFollow(r);
  }

  function pick(r: SavedRoute) {
    const buttons = [
      { text: ui().routes.follow, onPress: () => void follow(r) },
      ...(settings.plainMap ? [] : [{ text: ui().offline.saveAlong(roughMb(boxOfPath(r.path)!)), onPress: () => void saveMap(r) }]),
      {
        text: ui().routes.remove,
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert(ui().routes.removeTitle(r.name), ui().routes.removeBody, [
            { text: ui().routes.keep, style: 'cancel' },
            { text: ui().routes.remove, style: 'destructive', onPress: () => void deleteRoute(r.id).then(reload) },
          ]),
      },
    ];
    Alert.alert(r.name, formatDistance(r.distanceM, settings.unitsKm), buttons, { cancelable: true });
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Note strong>{ui().routes.intro}</Note>
      {routes && routes.length ? (
        <Group>
          {routes.map((r) => (
            <PlainRow key={r.id} onPress={() => pick(r)} accessibilityLabel={`${r.name}. ${formatDistance(r.distanceM, settings.unitsKm)}`}>
              <View style={{ flex: 1 }}>
                <Text style={kit.label} numberOfLines={1}>{r.name}</Text>
                <Text style={kit.hint}>{formatDistance(r.distanceM, settings.unitsKm)}</Text>
              </View>
            </PlainRow>
          ))}
        </Group>
      ) : routes ? (
        <Note>{ui().routes.none}</Note>
      ) : null}
      <WideButton label={ui().routes.bringIn} onPress={() => void bringIn()} />
      {line ? (
        <Note strong>
          <Text accessibilityLiveRegion="polite">{line}</Text>
        </Note>
      ) : null}
      <Note>{ui().routes.where}</Note>
    </View>
  );
}
