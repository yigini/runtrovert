// Runtrovert identity. Cream ground, ink for text and the one primary action
// per screen, five pastels that each own a job. No borders, no shadows, no
// gradients: colour blocks do the separating. Pills and big radii everywhere.

export const colors = {
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

  // Semantic aliases used by components
  bg: '#f6f1ea',
  text: '#2b2733',
  muted: '#6b5f86',
  card: '#ffffff',
  accent: '#2b2733',
  danger: '#6b3a2a',
  track: '#2b2733',
  onInk: '#f6f1ea',
  onInkMuted: '#b7afc9',
};

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
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' as const, color: colors.muted },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
};
