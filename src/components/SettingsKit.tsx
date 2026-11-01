import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts, radius, spacing, themedStyles, themed } from '../theme';

/**
 * The pieces Settings is built from: a group (small heading over a white list),
 * rows inside it, a row that opens a page, a radio list and a segmented control.
 * White lists on cream, with a 2 px cream gap between rows instead of lines.
 * Colour lives only in the small icons on the main page.
 */

export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? (
        <Text style={styles.eyebrow} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.list}>{children}</View>
    </View>
  );
}

/** A quiet line under or between groups. */
export function Note({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <Text style={[styles.note, strong && styles.noteStrong]}>{children}</Text>;
}

/**
 * A setting and its control. The control is handed the row's words, so a
 * screen reader says "Auto-pause, switch, on" rather than just "switch, on".
 * The words themselves are hidden from it to avoid reading them twice.
 */
export function Row({ label, hint, stack, children }: { label: string; hint?: string; stack?: boolean; children: React.ReactNode }) {
  const named = React.Children.map(children, (c) =>
    React.isValidElement<{ accessibilityLabel?: string; accessibilityHint?: string }>(c) && !c.props.accessibilityLabel ? React.cloneElement(c, { accessibilityLabel: label, accessibilityHint: hint }) : c,
  );
  return (
    <View style={[styles.row, stack && styles.rowStack]}>
      <View style={stack ? undefined : { flex: 1, paddingRight: spacing.md }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {named}
    </View>
  );
}

/** A plain row with its own content (a found sensor, a saved spot). */
export function PlainRow({ children, onPress, accessibilityLabel }: { children: React.ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  if (!onPress) return <View style={styles.row}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** A row on the main page: icon, name, what it's set to now, and a way in. */
export function NavRow({ icon, label, value, onPress, disabled }: { icon?: IconName; label: string; value?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}. ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, styles.navRow, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.hint}>{value}</Text> : null}
      </View>
      <Text style={styles.chev} importantForAccessibility="no" accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

/** Pick one. The longer explanation shows only under the option that's picked. */
export function RadioList<K extends string | number>({ options, value, onPick }: { options: Array<{ key: K; label: string; hint?: string }>; value: K; onPick: (k: K) => void }) {
  return (
    <>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onPick(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={[styles.radio, on && styles.radioOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{o.label}</Text>
              {on && o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

// options are the stored values; labels, when given, are what the person reads.
export function Segmented({ value, options, labels, onChange, accessibilityLabel, accessibilityHint, disabled = false }: { value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void; accessibilityLabel?: string; accessibilityHint?: string; disabled?: boolean }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
      {options.map((o) => {
        const on = o === value;
        const label = labels?.[o] ?? o;
        return (
          <Pressable key={o} onPress={() => onChange(o)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${label}` : label} style={[styles.segItem, on && styles.segItemOn, disabled && { opacity: 0.5 }]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small pill button inside a row (Set, Find, Change). */
export function RowButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** An underlined word inside a row (Forget). */
export function RowLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** A full-width button under a group. */
export function WideButton({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.wide, quiet && styles.wideQuiet, pressed && styles.pressed]}>
      <Text style={[styles.wideText, quiet && styles.wideTextQuiet]}>{label}</Text>
    </Pressable>
  );
}

/** A label pill at the end of a row ("Never sent"). */
export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export type IconName = 'run' | 'battery' | 'map' | 'heart' | 'music' | 'bell' | 'home' | 'sun' | 'globe' | 'phone' | 'export' | 'info' | 'moon' | 'route';

const ICON_COLOURS: Record<IconName, [string, string]> = themed(() => ({
  run: [colors.lilac, colors.lilacDeep],
  battery: [colors.sky, colors.skyDeep],
  map: [colors.mint, colors.mintDeep],
  heart: [colors.peach, colors.peachDeep],
  music: [colors.lilac, colors.lilacDeep],
  bell: [colors.butter, colors.butterDeep],
  home: [colors.peach, colors.peachDeep],
  sun: [colors.sky, colors.skyDeep],
  globe: [colors.mint, colors.mintDeep],
  phone: [colors.mint, colors.mintDeep],
  export: [colors.butter, colors.butterDeep],
  info: [colors.lilacSoft, colors.lilacDeep],
  moon: [colors.lilac, colors.lilacDeep],
  route: [colors.butter, colors.butterDeep],
}));

function Icon({ name }: { name: IconName }) {
  const [bg, fg] = ICON_COLOURS[name];
  const p = { stroke: fg, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <View style={[styles.icon, { backgroundColor: bg }]} importantForAccessibility="no" accessibilityElementsHidden>
      <Svg width={17} height={17} viewBox="0 0 24 24">
        {name === 'run' && (
          <>
            <Circle cx={13} cy={4} r={2} {...p} />
            <Path d="M8 21l3-6 3 2v4M6 11l3-3 4 1 3 3 3 1" {...p} />
          </>
        )}
        {name === 'battery' && (
          <>
            <Rect x={3} y={7} width={16} height={10} rx={2} {...p} />
            <Path d="M21 11v2M7 10v4M10 10v4" {...p} />
          </>
        )}
        {name === 'map' && <Path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" {...p} />}
        {name === 'heart' && <Path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" {...p} />}
        {name === 'music' && (
          <>
            <Path d="M9 18V5l11-2v13" {...p} />
            <Circle cx={6} cy={18} r={3} {...p} />
            <Circle cx={17} cy={16} r={3} {...p} />
          </>
        )}
        {name === 'bell' && <Path d="M6 9a6 6 0 1112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0" {...p} />}
        {name === 'home' && <Path d="M3 11l9-7 9 7M5 10v10h14V10" {...p} />}
        {name === 'sun' && (
          <>
            <Circle cx={12} cy={12} r={4} {...p} />
            <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" {...p} />
          </>
        )}
        {name === 'globe' && (
          <>
            <Circle cx={12} cy={12} r={9} {...p} />
            <Path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" {...p} />
          </>
        )}
        {name === 'phone' && (
          <>
            <Rect x={7} y={2} width={10} height={20} rx={2} {...p} />
            <Path d="M11 18h2" {...p} />
          </>
        )}
        {name === 'route' && (
          <>
            <Circle cx={6} cy={19} r={2} {...p} />
            <Circle cx={18} cy={5} r={2} {...p} />
            <Path d="M8 19h7a3 3 0 000-6H9a3 3 0 010-6h7" {...p} />
          </>
        )}
        {name === 'moon' && <Path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" {...p} />}
        {name === 'export' && <Path d="M12 3v12M7 10l5 5 5-5M4 19h16" {...p} />}
        {name === 'info' && (
          <>
            <Circle cx={12} cy={12} r={9} {...p} />
            <Path d="M12 11v6M12 7.5v.5" {...p} />
          </>
        )}
      </Svg>
    </View>
  );
}

export const kit = themedStyles(() => ({
  label: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
}));

const styles = themedStyles(() => ({
  group: { gap: 6 },
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted, paddingLeft: spacing.xs },
  list: { borderRadius: radius.md, overflow: 'hidden', gap: 2, backgroundColor: colors.cream },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingVertical: 12, paddingHorizontal: 14, minHeight: 52, gap: spacing.sm + 2 },
  navRow: { minHeight: 58 },
  rowStack: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm },
  pressed: { opacity: 0.85 },
  label: kit.label,
  hint: kit.hint,
  chev: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.muted, paddingLeft: spacing.xs },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.ring },
  radioOn: { borderWidth: 6, borderColor: colors.ink },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, paddingHorizontal: spacing.xs },
  noteStrong: { color: colors.text },
  seg: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.cream, borderRadius: radius.pill, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.pill, minHeight: 32, justifyContent: 'center' },
  segItemOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  segTextOn: { color: colors.cream },
  button: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 13 },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, textDecorationLine: 'underline' },
  wide: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center' },
  wideQuiet: { backgroundColor: colors.white },
  wideText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 14 },
  wideTextQuiet: { color: colors.text },
  tag: { backgroundColor: colors.mint, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  tagText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.mintDeep },
}));
