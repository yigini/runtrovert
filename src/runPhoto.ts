// One photo per run, kept on this phone. The picture is made smaller and
// written again as a fresh JPEG before it is saved, which leaves its EXIF
// behind: no GPS position, no camera serial, no time stamp from the camera.
// So every copy (on screen, in a backup, through Share photo) is already clean.
//
// Stored as Base64 under its own key in the settings table, so a backup carries
// it like everything else, and a deleted run takes its photo with it (db.ts).
// Never put into GPX or FIT files.

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb, loadValue, saveValue } from './db';

export type RunPhoto = { b64: string; w: number; h: number; at: number };

/** Longest edge kept: sharp on a phone, about 200–400 KB in a backup. */
const MAX_EDGE = 1600;

export const photoKey = (runId: number) => `photo:${runId}`;

export async function loadPhoto(runId: number): Promise<RunPhoto | null> {
  const p = await loadValue<RunPhoto>(photoKey(runId)).catch(() => null);
  return p && typeof p.b64 === 'string' && p.b64.length > 0 ? p : null;
}

export function photoUri(p: RunPhoto): string {
  return `data:image/jpeg;base64,${p.b64}`;
}

export type PickResult = RunPhoto | 'cancelled' | 'noCamera';

/** Camera or gallery, then made smaller and clean. The gallery needs no permission (the system picker). */
export async function pickPhoto(runId: number, from: 'camera' | 'library'): Promise<PickResult> {
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'noCamera';
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false, allowsMultipleSelection: false };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return 'cancelled';
  const a = res.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  const long = Math.max(a.width || 0, a.height || 0);
  if (long > MAX_EDGE) ctx.resize(a.width >= a.height ? { width: MAX_EDGE, height: null } : { width: null, height: MAX_EDGE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!out.base64) throw new Error('no image data');
  const photo: RunPhoto = { b64: out.base64, w: out.width, h: out.height, at: Date.now() };
  await saveValue(photoKey(runId), photo);
  try {
    new File(out.uri).delete();
  } catch {
    // the cache clears itself
  }
  return photo;
}

export async function removePhoto(runId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?', photoKey(runId));
}

/** The clean copy, through the share sheet. */
export async function sharePhoto(runId: number, title: string): Promise<void> {
  const p = await loadPhoto(runId);
  if (!p) return;
  const file = new File(Paths.cache, `runtrovert-photo-${runId}.jpg`);
  if (file.exists) file.delete();
  file.create();
  await file.write(p.b64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg', dialogTitle: title });
}
