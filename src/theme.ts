// Runtrovert identity. A cream ground by day, a dusk ground by night; ink for
// text and the one primary action per screen; five pastels that each own a job.
// No shadows, no gradients: colour blocks do the separating. Pills and big radii.
//
// Two palettes with the same names. Light is the original. Dark is designed,
// not inverted: a warm aubergine dusk, the pastels turned into deep tinted
// blocks, and each "Deep" colour (the text that sits on its pastel) turned
// into the light version of itself, so every pastel-on-pastel pair keeps its
// meaning and its contrast. Ink and cream swap, so an ink button stays the
// strongest thing on the screen in both.
//
// `colors` always reads the palette in use, and `themedStyles` builds a
// screen's styles once per palette, so module-level styles follow the phone.
// The app redraws its screens when the palette changes (App.tsx), never during
// a live run. `night` is the palette for screens that are dark on purpose in
// both (the live run's dusk map screen and the countdown over footage).

import { StyleSheet } from 'react-native';

export type Scheme = 'light' | 'dark';
export type ThemeChoice = import('./types').Settings['theme'];

const light = {
  cream: '#f6f1ea',
  ink: '#2b2733',
  inkSoft: '#3a3447',
  inkMuted: '#6b5f86',
  white: '#ffffff',

  mint: '#c9e7d6', // time & recovery
  mintDeep: '#2f5c47',
  mintSoft: '#d8eee2',
  lilac: '#d9d0f0', // you: mood, cues
  lilacDeep: '#4a3f6b',
  lilacSoft: '#e8e2f5',
  peach: '#f7c9b6', // pace & effort, stop
  peachDeep: '#6b3a2a',
  butter: '#f5e3a8', // reminders & sun
  butterDeep: '#6b5a1f',
  sky: '#c5dcf0', // welcome
  skyDeep: '#2f4a6b',

  // Semantic tokens
  bg: '#f6f1ea', // the ground of every screen
  text: '#2b2733',
  muted: '#6b5f86',
  card: '#ffffff', // a raised surface on the ground
  sunk: '#ece5da', // a lowered surface: segmented controls, locked lines
  line: '#e4dccf', // hairlines between rows
  lineSoft: '#efe8dd',
  accent: '#2b2733',
  danger: '#6b3a2a',
  track: '#2b2733',
  onInk: '#f6f1ea',
  onInkMuted: '#b7afc9',
  /** An empty radio or an unfilled marker on a card. */
  ring: '#b7afc9',
  /** Bottom-sheet scrim and its grabber. */
  scrim: 'rgba(43,39,51,0.45)',
  grabber: 'rgba(43,39,51,0.2)',
  /** Cards that sit straight on the background footage. */
  glass: 'rgba(255,255,255,0.8)',
  glassSoft: 'rgba(255,255,255,0.72)',
  /** The ground colour, see-through, for washes over a map or a photo. */
  wash: 'rgba(246,241,234,0.92)',
  /** Empty part of a bar or a segment. */
  empty: 'rgba(43,39,51,0.1)',
  /** Mid green of the year heatmap. */
  yearMid: '#6fa58a',
  /** Pastels as chart marks (bars, guide lines) rather than blocks: the pastel itself by day, a brighter mid-tone at night. */
  mintMark: '#c9e7d6',
  lilacMark: '#d9d0f0',
  peachMark: '#f7c9b6',
  butterMark: '#f5e3a8',
  skyMark: '#c5dcf0',
  /** Ends of the heart-rate zone ramp. */
  zoneLow: '#d8eee2',
  zoneHigh: '#6b3a2a',
};

export type Palette = typeof light;

const dark: Palette = {
  cream: '#17151c',
  ink: '#f2ece3',
  inkSoft: '#ddd5e6',
  inkMuted: '#b3a8ca',
  white: '#231f2a',

  mint: '#25443a',
  mintDeep: '#a8dcc1',
  mintSoft: '#1d2c26',
  lilac: '#382f53',
  lilacDeep: '#d6ccf4',
  lilacSoft: '#262131',
  peach: '#4d2f25',
  peachDeep: '#f5bfa9',
  butter: '#463a1c',
  butterDeep: '#efda92',
  sky: '#22364c',
  skyDeep: '#b2cff0',

  bg: '#17151c',
  text: '#f2ece3',
  muted: '#aa9fc2',
  card: '#231f2a',
  sunk: '#100e14',
  line: '#353040',
  lineSoft: '#2b2734',
  accent: '#f2ece3',
  danger: '#f5bfa9',
  track: '#f2ece3',
  onInk: '#17151c',
  onInkMuted: '#5a5068',
  ring: '#7a7090',
  scrim: 'rgba(0,0,0,0.6)',
  grabber: 'rgba(242,236,227,0.25)',
  glass: 'rgba(29,26,35,0.84)',
  glassSoft: 'rgba(29,26,35,0.78)',
  wash: 'rgba(23,21,28,0.9)',
  empty: 'rgba(242,236,227,0.14)',
  yearMid: '#4f8a6e',
  mintMark: '#5fa585',
  lilacMark: '#9284c9',
  peachMark: '#d98d70',
  butterMark: '#c9ac52',
  skyMark: '#6b9ccc',
  zoneLow: '#3f7560',
  zoneHigh: '#e8a98f',
};

const palettes: Record<Scheme, Palette> = { light, dark };

/** The dusk palette for screens that are dark in both modes: the light palette's ink and cream, fixed. */
export const night: Palette = light;

let current: Scheme = 'light';
const listeners = new Set<(s: Scheme) => void>();

export function scheme(): Scheme {
  return current;
}

/** Switch palette. App.tsx then redraws every screen (a live run waits until it ends). */
export function setScheme(s: Scheme): void {
  if (s === current) return;
  current = s;
  listeners.forEach((l) => l(s));
}

export function onScheme(l: (s: Scheme) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function paletteFor(s: Scheme): Palette {
  return palettes[s];
}

/** The palette in use. Every read goes to the current palette, so it is safe in render and in themedStyles. */
export const colors = {} as Palette;
for (const k of Object.keys(light) as (keyof Palette)[]) {
  Object.defineProperty(colors, k, { enumerable: true, get: () => palettes[current][k] });
}

/**
 * StyleSheet.create, built once per palette and read through the one in use.
 * `const styles = themedStyles(() => ({ ... }))` reads like StyleSheet.create.
 */
type Styles = Parameters<typeof StyleSheet.create>[0];
export function themedStyles<S extends Styles>(make: () => S): Readonly<S> {
  const built: Partial<Record<Scheme, Readonly<S>>> = {};
  const sheet = (): Readonly<S> => (built[current] ??= StyleSheet.create(make()));
  return new Proxy({} as Readonly<S>, {
    get: (_t, k) => (sheet() as any)[k],
    has: (_t, k) => k in (sheet() as object),
    ownKeys: () => Reflect.ownKeys(sheet() as object),
    getOwnPropertyDescriptor: (_t, k) => {
      const v = (sheet() as any)[k];
      return v === undefined ? undefined : { value: v, enumerable: true, configurable: true, writable: false };
    },
  });
}

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayLight: 'Fraunces_300Light',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 12, md: 20, lg: 24, pill: 999 };

export const type = {
  get eyebrow() {
    return { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' as const, color: colors.muted };
  },
  get h1() {
    return { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text };
  },
  get h2() {
    return { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text };
  },
  get body() {
    return { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text };
  },
  get small() {
    return { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted };
  },
  get label() {
    return { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted };
  },
};

/**
 * A module-level value made from colours (a tint table, a list of dots), made
 * again for the palette in use. Reads like the value itself.
 */
export function themed<T extends object>(make: () => T): T {
  const made: Partial<Record<Scheme, T>> = {};
  const value = (): T => (made[current] ??= make());
  const target = value();
  return new Proxy(target, {
    get: (_t, k) => {
      const v = value();
      const out = Reflect.get(v, k, v);
      return typeof out === 'function' && Array.isArray(v) ? out.bind(v) : out;
    },
    has: (_t, k) => Reflect.has(value(), k),
    ownKeys: () => Reflect.ownKeys(value()),
    getOwnPropertyDescriptor: (_t, k) => Reflect.getOwnPropertyDescriptor(value(), k),
  });
}

/** Colours for a plain on/off Switch on a card: ink when on, as before by day; at night a dark thumb on the light ink track. */
export function switchColors(on: boolean): { trackColor: { true: string; false?: string }; thumbColor?: string } {
  if (current === 'light') return { trackColor: { true: colors.ink } };
  return { trackColor: { true: colors.ink, false: colors.line }, thumbColor: on ? colors.onInk : colors.inkMuted };
}
