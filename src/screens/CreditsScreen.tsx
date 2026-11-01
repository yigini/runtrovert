import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { PEXELS } from '../footage';
import { colors, fonts, radius, spacing, themedStyles } from '../theme';
import { ui } from '../i18n/ui';
import credits from '../credits/libraries.json';

type Library = { name: string; version?: string; licence: string; copyright: string[]; url: string };
const LIBRARIES = credits.libraries as Library[];
const TEXTS = credits.texts as Record<string, string>;
const VIDEOS = Object.entries(PEXELS);

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const OPEN_METEO = 'https://open-meteo.com/';
const PEXELS_LICENCE = 'https://www.pexels.com/license/';
const OFL = 'https://openfontlicense.org/';
const MAIL = 'mailto:hello@runtrovert.app';

const open = (url: string) => void Linking.openURL(url).catch(() => {});

/** Settings > About > Credits and licences. Who made what the app is built from, and on what terms. */
export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const t = ui().credits;
  const [videos, setVideos] = useState(false);
  const [reading, setReading] = useState<string | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      <BackButton label={ui().settings.settings} onPress={onBack} />
      <Text style={styles.h1} accessibilityRole="header">{t.title}</Text>
      <Text style={styles.body}>{t.intro}</Text>

      <Block title={t.map} bg={colors.mint} fg={colors.mintDeep}>
        <Text style={styles.body}>{t.mapLine}</Text>
        <Link label={t.osmLink} url={OSM_COPYRIGHT} color={colors.mintDeep} />
      </Block>

      <Block title={t.passed} bg={colors.butter} fg={colors.butterDeep}>
        <Text style={styles.body}>{t.passedLine}</Text>
      </Block>

      <Block title={t.weather} bg={colors.sky} fg={colors.skyDeep}>
        <Text style={styles.body}>{t.weatherLine}</Text>
        <Link label="Open-Meteo.com" url={OPEN_METEO} color={colors.skyDeep} />
      </Block>

      <Block title={t.footage} bg={colors.peach} fg={colors.peachDeep}>
        <Text style={styles.body}>{t.footageLine(VIDEOS.length)}</Text>
        <Link label="pexels.com/license" url={PEXELS_LICENCE} color={colors.peachDeep} />
        <Toggle label={videos ? t.hideVideos : t.showVideos} open={videos} onPress={() => setVideos((v) => !v)} />
        {videos && VIDEOS.map(([name, id]) => <Link key={name} label={t.pexelsVideo(id)} url={`https://www.pexels.com/video/${id}/`} color={colors.peachDeep} />)}
      </Block>

      <Block title={t.listen} bg={colors.lilac} fg={colors.lilacDeep}>
        <Text style={styles.body}>{t.listenLine}</Text>
      </Block>

      <Block title={t.fonts} bg={colors.butter} fg={colors.butterDeep}>
        <Text style={styles.body}>{t.fontsLine}</Text>
        {credits.fonts.map((line) => (
          <Text key={line} style={styles.small}>{line}</Text>
        ))}
        <Link label="openfontlicense.org" url={OFL} color={colors.butterDeep} />
        <Toggle label={reading === 'fonts' ? t.hideLicence : t.readLicence('SIL OFL 1.1')} open={reading === 'fonts'} onPress={() => setReading((r) => (r === 'fonts' ? null : 'fonts'))} />
        {reading === 'fonts' && <Text style={styles.licence}>{TEXTS['OFL-1.1']}</Text>}
      </Block>

      <Block title={t.software} bg={colors.white} fg={colors.muted}>
        <Text style={styles.body}>{t.softwareLine}</Text>
        {LIBRARIES.map((lib) => {
          const text = TEXTS[lib.licence];
          const isOpen = reading === lib.name;
          return (
            <View key={lib.name} style={styles.lib}>
              <Text style={styles.libName} onPress={() => open(lib.url)} accessibilityRole="link">
                {lib.version ? `${lib.name} ${lib.version}` : lib.name}
              </Text>
              {lib.copyright.map((c) => (
                <Text key={c} style={styles.small}>{c}</Text>
              ))}
              {text ? (
                <Toggle label={isOpen ? t.hideLicence : t.readLicence(lib.licence)} open={isOpen} onPress={() => setReading(isOpen ? null : lib.name)} />
              ) : (
                <Text style={styles.small}>{t.publicDomain}</Text>
              )}
              {isOpen && <Text style={styles.licence}>{text}</Text>}
            </View>
          );
        })}
      </Block>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.body}>{t.madeBy}</Text>
        <Link label={t.write} url={MAIL} color={colors.inkMuted} />
      </View>
    </ScrollView>
  );
}

function Block({ title, bg, fg, children }: { title: string; bg: string; fg: string; children: React.ReactNode }) {
  return (
    <View style={[styles.block, { backgroundColor: bg }]}>
      <Text style={[styles.blockTitle, { color: fg }]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function Link({ label, url, color }: { label: string; url: string; color: string }) {
  return (
    <Text style={[styles.link, { color }]} onPress={() => open(url)} accessibilityRole="link">
      {label}
    </Text>
  );
}

function Toggle({ label, open: isOpen, onPress }: { label: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} hitSlop={8} style={styles.toggle}>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 19 },
  block: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  blockTitle: { fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5 },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 22, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' },
  toggle: { alignSelf: 'flex-start', backgroundColor: colors.cream, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  toggleText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  lib: { backgroundColor: colors.cream, borderRadius: radius.md, padding: 14, gap: 4 },
  libName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  licence: { fontFamily: fonts.body, color: colors.text, fontSize: 12, lineHeight: 18 },
}));
