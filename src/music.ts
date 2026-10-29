import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';

/**
 * Music during a run, without logging in to anything.
 *
 * Android: previous / play-pause / next go out as media-button presses, the
 * same thing headphones send, so they reach whichever app is playing.
 * iPhone: Apple keeps other apps' playback off-limits, so we open your music
 * app and leave the rest to the lock screen and Control Center.
 * Both: voice cues lower the music for a moment instead of talking over it.
 */

interface Native {
  canControl: boolean;
  isPlaying(): boolean;
  send(command: 'toggle' | 'next' | 'previous'): boolean;
  installed?(ids: string[]): string[];
  open?(id: string | null): boolean;
  duck(on: boolean): boolean;
}

// Missing in Expo Go and on web; everything below degrades to "open the app".
const native = requireOptionalNativeModule<Native>('RuntrovertMusic');

export interface MusicApp {
  key: string;
  name: string;
  android: string; // package
  ios?: string; // URL scheme, declared in app.json LSApplicationQueriesSchemes
}

export const MUSIC_APPS: MusicApp[] = [
  { key: 'spotify', name: 'Spotify', android: 'com.spotify.music', ios: 'spotify:' },
  { key: 'ytmusic', name: 'YouTube Music', android: 'com.google.android.apps.youtube.music', ios: 'youtubemusic:' },
  { key: 'apple', name: 'Apple Music', android: 'com.apple.android.music', ios: 'music:' },
  { key: 'amazon', name: 'Amazon Music', android: 'com.amazon.mp3' },
  { key: 'deezer', name: 'Deezer', android: 'deezer.android.app', ios: 'deezer:' },
  { key: 'tidal', name: 'Tidal', android: 'com.aspiro.tidal', ios: 'tidal:' },
  { key: 'soundcloud', name: 'SoundCloud', android: 'com.soundcloud.android', ios: 'soundcloud:' },
  { key: 'pocketcasts', name: 'Pocket Casts', android: 'au.com.shiftyjelly.pocketcasts', ios: 'pktc:' },
  { key: 'podcasts', name: 'Apple Podcasts', android: '', ios: 'podcasts:' },
];

/** True where the strip can press play/skip itself (Android). */
export const canControl = native?.canControl ?? false;

export function appByKey(key: string | null): MusicApp | null {
  return MUSIC_APPS.find((a) => a.key === key) ?? null;
}

/** The music apps on this phone, in our list's order. */
export async function installedApps(): Promise<MusicApp[]> {
  if (Platform.OS === 'android') {
    const candidates = MUSIC_APPS.filter((a) => a.android);
    if (!native?.installed) return [];
    try {
      const found = new Set(native.installed(candidates.map((a) => a.android)));
      return candidates.filter((a) => found.has(a.android));
    } catch {
      return [];
    }
  }
  const out: MusicApp[] = [];
  for (const a of MUSIC_APPS) {
    if (!a.ios) continue;
    try {
      if (await Linking.canOpenURL(a.ios)) out.push(a);
    } catch {
      // scheme not declared; skip
    }
  }
  return out;
}

/** Which of these Android packages are on the phone. Empty on iPhone and in Expo Go. */
export function installedPackages(pkgs: string[]): Set<string> {
  if (Platform.OS !== 'android' || !native?.installed) return new Set();
  try {
    return new Set(native.installed(pkgs));
  } catch {
    return new Set();
  }
}

/** Opens the chosen app, or the phone's default music app when none is chosen. */
export async function openMusicApp(key: string | null): Promise<boolean> {
  const app = appByKey(key);
  if (Platform.OS === 'android') {
    try {
      if (app && native?.open?.(app.android)) return true;
      return native?.open?.(null) ?? false;
    } catch {
      return false;
    }
  }
  const url = app?.ios ?? 'music:';
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function isPlaying(): boolean {
  try {
    return native?.isPlaying() ?? false;
  } catch {
    return false;
  }
}

export function press(command: 'toggle' | 'next' | 'previous'): boolean {
  try {
    return native?.send(command) ?? false;
  } catch {
    return false;
  }
}

export function duck(on: boolean) {
  try {
    native?.duck(on);
  } catch {
    // no native module (Expo Go): voice simply plays over the music
  }
}
