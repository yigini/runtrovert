import { OfflineManager } from '@maplibre/maplibre-react-native';
import { lightAndDarkStyles } from './components/RouteMap';
import { MAX_TILES, MAX_ZOOM, MIN_ZOOM, tileCount, type Box } from './mapArea';

// Maps without signal: the street map for an area, kept on this phone by
// MapLibre's own offline store. Downloaded once from the same tile host the
// map already uses (OpenFreeMap), then drawn with no network at all. Nothing
// about the runner goes anywhere: the host sees the area's tiles being fetched,
// as it would when the map is looked at.
//
// One saved area is two MapLibre packs, light and dark, so the map is there
// whichever the phone is in. They share the same street tiles, so the second
// costs little more than its drawing style.

export interface SavedArea {
  key: string;
  name: string;
  savedAt: number;
  /** 0–100 over both packs. */
  percent: number;
  bytes: number;
  done: boolean;
  packIds: string[];
}

type Meta = { app?: string; key?: string; name?: string; savedAt?: number };

export async function listAreas(): Promise<SavedArea[]> {
  const packs = await OfflineManager.getPacks();
  const byKey = new Map<string, SavedArea>();
  for (const p of packs) {
    const m = (p.metadata ?? {}) as Meta;
    if (m.app !== 'runtrovert' || !m.key) continue;
    const st = await p.status().catch(() => null);
    const a = byKey.get(m.key) ?? { key: m.key, name: m.name ?? '', savedAt: m.savedAt ?? 0, percent: 0, bytes: 0, done: true, packIds: [] };
    a.packIds.push(p.id);
    a.bytes += st?.completedResourceSize ?? 0;
    a.percent += (st?.percentage ?? 0) / 2;
    a.done = a.done && st?.state === 'complete';
    byKey.set(m.key, a);
  }
  return [...byKey.values()].map((a) => ({ ...a, percent: Math.min(100, Math.round(a.percent)) })).sort((x, y) => y.savedAt - x.savedAt);
}

/** Too big to keep as one area. */
export function tooBig(box: Box): boolean {
  return tileCount(box) > MAX_TILES;
}

/**
 * Saves the street map for the box, light and dark. Resolves when both have
 * finished or failed; `onProgress` gets 0–100 along the way.
 */
export async function saveArea(name: string, box: Box, onProgress?: (percent: number) => void): Promise<'done' | 'failed'> {
  OfflineManager.setTileCountLimit(MAX_TILES * 2 + 500);
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const styles = lightAndDarkStyles();
  const seen: number[] = styles.map(() => 0);
  const results = await Promise.all(
    styles.map(
      (mapStyle, i) =>
        new Promise<'done' | 'failed'>((resolve) => {
          OfflineManager.createPack(
            { mapStyle, bounds: box, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, metadata: { app: 'runtrovert', key, name, savedAt: Date.now() } },
            (pack, status) => {
              seen[i] = status.percentage;
              onProgress?.(Math.round(seen.reduce((a, b) => a + b, 0) / styles.length));
              if (status.state === 'complete' || status.percentage >= 100) {
                OfflineManager.removeListener(pack.id);
                resolve('done');
              }
            },
            (pack) => {
              OfflineManager.removeListener(pack.id);
              resolve('failed');
            },
          ).catch(() => resolve('failed'));
        }),
    ),
  );
  return results.every((r) => r === 'done') ? 'done' : 'failed';
}

export async function deleteArea(a: SavedArea): Promise<void> {
  for (const id of a.packIds) await OfflineManager.deletePack(id).catch(() => {});
}
