import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { listRuns } from '../db';
import { useSettings } from '../settings';
import { phoneLocale, refreshShelf, storedShelf } from '../shelf';
import {
  GROUPS,
  OFFER_TOPICS,
  PODCAST_APPS,
  filterOffers,
  fitsRun,
  inGroup,
  localShows,
  offersFor,
  parseLocale,
  pickCountry,
  showLink,
  usualRunMin,
  type Group,
  type Offer,
  type Shelf,
  type Show,
} from '../shelfLogic';
import { colors, fonts, radius, spacing } from '../theme';
import type { PodcastApp } from '../types';

/**
 * Podcasts to take on a run. Runtrovert never plays them: a show opens in the
 * runner's own podcast app, so the podcast hosts never meet a Runtrovert user.
 * Kit & offers lives at the very bottom, only when a sponsor exists.
 */

type Tab = 'local' | Group;

const GROUP_TINT: Record<Group, { bg: string; fg: string }> = {
  quiet: { bg: colors.mint, fg: colors.mintDeep },
  stories: { bg: colors.lilac, fg: colors.lilacDeep },
  learn: { bg: colors.sky, fg: colors.skyDeep },
  start: { bg: colors.butter, fg: colors.butterDeep },
};

export function ListenScreen() {
  const { settings, update } = useSettings();
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [usual, setUsual] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [choosing, setChoosing] = useState<Show | null>(null);
  const [kit, setKit] = useState(false);
  const [countries, setCountries] = useState(false);

  useEffect(() => {
    let live = true;
    storedShelf().then((s) => live && (setShelf(s.shelf), setFetchedAt(s.fetchedAt)));
    listRuns()
      .then((runs) => live && setUsual(usualRunMin(runs.map((r) => r.durationS))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Only once the runner said yes, and only now that the tab is open.
  useEffect(() => {
    if (settings.listenDownload !== 'on') return;
    let live = true;
    refreshShelf().then((s) => live && (setShelf(s.shelf), setFetchedAt(s.fetchedAt)));
    return () => {
      live = false;
    };
  }, [settings.listenDownload]);

  const locale = phoneLocale();
  const cc = shelf ? pickCountry(shelf, locale, settings.podcastCountry) : null;
  const local = shelf ? localShows(shelf, cc) : [];
  const today = new Date().toISOString().slice(0, 10);
  const offers = shelf && !settings.offersHidden ? offersFor(shelf.offers, cc, today) : [];
  const englishPhone = parseLocale(locale).lang === 'en';
  const active: Tab = tab ?? (local.length && !englishPhone ? 'local' : 'quiet');

  const shows = useMemo(() => {
    if (!shelf) return [];
    return active === 'local' ? local : inGroup(shelf.curated, active);
  }, [shelf, active, cc]);

  async function open(show: Show, app: PodcastApp | null) {
    if (!app) {
      setChoosing(show);
      return;
    }
    const url = showLink(app, show);
    if (url) {
      const ok = await Linking.openURL(url).then(() => true, () => false);
      if (ok) return;
    }
    Share.share({ message: show.feed, title: show.name }).catch(() => {});
  }

  if (kit && shelf) {
    return <KitShelf offers={offers} onBack={() => setKit(false)} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <Text style={styles.h1}>Listen</Text>
      <Text style={styles.lede}>Voices to take with you. Nobody here will ask you anything.</Text>

      {settings.listenDownload === 'ask' ? (
        <View style={[styles.card, { backgroundColor: colors.butter }]}>
          <Text style={styles.cardTitle}>Get today's episodes?</Text>
          <Text style={styles.cardText}>
            One small download from Runtrovert's public list, when you open this tab. It holds every country, so nothing about you is sent. Without it you
            get the list this version shipped with.
          </Text>
          <View style={styles.rowGap}>
            <Pill label="Yes, keep it fresh" dark onPress={() => update({ listenDownload: 'on' })} />
            <Pill label="No thanks" onPress={() => update({ listenDownload: 'off' })} />
          </View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {local.length ? <Chip label={`Near you ${flag(cc)}`} on={active === 'local'} onPress={() => setTab('local')} /> : null}
        {GROUPS.map((g) => (
          <Chip key={g.key} label={g.label} on={active === g.key} onPress={() => setTab(g.key)} />
        ))}
      </ScrollView>

      <Text style={styles.hint}>
        {active === 'local' ? 'Running podcasts people listen to where you are, still publishing this season.' : GROUPS.find((g) => g.key === active)?.hint}
      </Text>

      {shows.map((s) => (
        <ShowCard key={s.id} show={s} group={active === 'local' ? null : active} usual={usual} app={settings.podcastApp} onOpen={(app) => open(s, app)} />
      ))}

      {active === 'local' || (shelf && Object.keys(shelf.regions).length) ? (
        <Pressable onPress={() => setCountries(true)} accessibilityRole="button">
          <Text style={styles.link}>{cc ? `Showing shows from ${flag(cc)} ${cc.toUpperCase()}. Change country` : 'Pick a country for local shows'}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footnote}>
        {shelf ? `List from ${shelf.builtAt.slice(0, 10)}${fetchedAt ? '' : ', the one this version shipped with'}. ` : ''}
        These shows carry their own adverts. Runtrovert doesn't, and never sees what you play.
      </Text>

      {offers.length ? (
        <Pressable onPress={() => setKit(true)} accessibilityRole="button" style={styles.kitRow}>
          <Text style={styles.kitText}>Kit & offers, if you ever want them ›</Text>
        </Pressable>
      ) : null}

      <AppChooser
        show={choosing}
        onClose={() => setChoosing(null)}
        onPick={(app) => {
          const show = choosing;
          update({ podcastApp: app });
          setChoosing(null);
          if (show) open(show, app);
        }}
      />
      <CountryChooser
        open={countries}
        codes={shelf ? Object.keys(shelf.regions).sort() : []}
        current={settings.podcastCountry}
        onClose={() => setCountries(false)}
        onPick={(code) => {
          update({ podcastCountry: code });
          setCountries(false);
          setTab(code ? 'local' : null);
        }}
      />
    </ScrollView>
  );
}

function ShowCard({ show, group, usual, app, onOpen }: { show: Show; group: Group | null; usual: number | null; app: PodcastApp | null; onOpen: (app: PodcastApp | null) => void }) {
  const tint = group ? GROUP_TINT[group] : { bg: colors.peach, fg: colors.peachDeep };
  const ep = show.latest[0];
  const appLabel = app ? PODCAST_APPS.find((a) => a.key === app)?.label : null;
  return (
    <View style={styles.show}>
      <View style={[styles.art, { backgroundColor: tint.bg }]}>
        <Text style={[styles.artText, { color: tint.fg }]}>{initials(show.name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.showName}>{show.name}</Text>
        <Text style={styles.showBy}>
          {show.by}
          {show.since ? ` · since ${show.since}` : show.episodes ? ` · ${show.episodes} episodes` : ''}
        </Text>
        {show.why ? <Text style={styles.why}>{show.why}</Text> : null}
        {ep ? (
          <Text style={styles.ep}>
            New: {ep.title}
            {ep.min ? ` · ${ep.min} min` : ''}
            {fitsRun(ep.min, usual) ? ' · fits your usual run' : ''}
          </Text>
        ) : null}
        <View style={[styles.rowGap, { marginTop: 6 }]}>
          <Pill label={appLabel && app !== 'share' ? `Open in ${appLabel}` : 'Open'} dark onPress={() => onOpen(app)} />
          {app ? <Pill label="Other app" onPress={() => onOpen(null)} /> : null}
        </View>
      </View>
    </View>
  );
}

function KitShelf({ offers, onBack }: { offers: Offer[]; onBack: () => void }) {
  const { settings, update } = useSettings();
  const shown = filterOffers(offers, settings.offerTopics);
  const topics = OFFER_TOPICS.filter((t) => offers.some((o) => o.topics.includes(t)));
  function toggle(t: string) {
    const on = settings.offerTopics.includes(t);
    update({ offerTopics: on ? settings.offerTopics.filter((x) => x !== t) : [...settings.offerTopics, t] });
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
      <BackButton label="Listen" onPress={onBack} />
      <Text style={styles.h1}>Kit & offers</Text>
      <Text style={styles.lede}>Paid for by them. Opened by you. Seen by nobody.</Text>
      {topics.length ? (
        <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
          {topics.map((t) => (
            <Chip key={t} label={t} on={settings.offerTopics.includes(t)} onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
      {shown.map((o) => (
        <View key={o.id} style={styles.offer}>
          <Text style={styles.paid}>Paid placement</Text>
          <Text style={styles.showName}>{o.title}</Text>
          <Text style={styles.showBy}>{o.sponsor}</Text>
          <Text style={styles.why}>{o.text}</Text>
          {o.code ? (
            <Text selectable style={styles.code}>
              {o.code}
            </Text>
          ) : null}
          <View style={[styles.rowGap, { marginTop: 4 }]}>
            <Pill label={`Visit ${o.sponsor}`} dark onPress={() => Linking.openURL(o.url).catch(() => {})} />
          </View>
        </View>
      ))}
      {!shown.length ? <Text style={styles.hint}>Nothing for those picks right now.</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.sky }]}>
        <Text style={[styles.cardText, { color: colors.skyDeep }]}>
          Your picks stay on this phone. Taps aren't recorded anywhere. Links open in your browser with nothing added to them. Sponsors pay a flat fee for a
          place here and never learn who looked.
        </Text>
      </View>
      <Pressable
        onPress={() => {
          update({ offersHidden: true });
          onBack();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.link}>Hide this shelf for good (Settings can bring it back)</Text>
      </Pressable>
    </ScrollView>
  );
}

function AppChooser({ show, onClose, onPick }: { show: Show | null; onClose: () => void; onPick: (app: PodcastApp) => void }) {
  const apps = PODCAST_APPS.filter((a) => (Platform.OS === 'ios' ? a.ios : a.android));
  return (
    <Modal visible={!!show} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.cardTitle}>Where do you listen?</Text>
          <Text style={styles.hint}>Remembered on this phone. Change it in Settings.</Text>
          {apps.map((a) => (
            <Pressable key={a.key} onPress={() => onPick(a.key)} style={styles.sheetRow} accessibilityRole="button">
              <Text style={styles.sheetText}>{a.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CountryChooser({ open, codes, current, onClose, onPick }: { open: boolean; codes: string[]; current: string | null; onClose: () => void; onPick: (cc: string | null) => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { maxHeight: '75%' }]} onPress={() => {}}>
          <Text style={styles.cardTitle}>Local shows from</Text>
          <Text style={styles.hint}>Chosen here, kept here. The download is the same for everyone.</Text>
          <ScrollView>
            <Pressable onPress={() => onPick(null)} style={[styles.sheetRow, current == null && styles.sheetRowOn]}>
              <Text style={[styles.sheetText, current == null && styles.sheetTextOn]}>The phone's region</Text>
            </Pressable>
            {codes.map((c) => (
              <Pressable key={c} onPress={() => onPick(c)} style={[styles.sheetRow, current === c && styles.sheetRowOn]}>
                <Text style={[styles.sheetText, current === c && styles.sheetTextOn]}>
                  {flag(c)} {c.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Pill({ label, dark, onPress }: { label: string; dark?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.pill, dark && styles.pillDark]}>
      <Text style={[styles.pillText, dark && styles.pillTextDark]}>{label}</Text>
    </Pressable>
  );
}

function initials(name: string): string {
  const words = name.replace(/^the\s+/i, '').split(/[\s\-–|:]+/).filter((w) => w && !/^[\d.#&+]+$/.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '•';
}

/** Two letters to the regional-indicator pair the phone draws as a flag. */
function flag(cc: string | null): string {
  if (!cc || !/^[a-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft, marginTop: -8 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  footnote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.sm },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  cardText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.md },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.cream },
  show: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14 },
  art: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  artText: { fontFamily: fonts.display, fontSize: 18 },
  showName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  showBy: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  why: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  ep: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  pill: { borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: colors.cream },
  pillDark: { backgroundColor: colors.ink },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  pillTextDark: { color: colors.cream },
  kitRow: { paddingVertical: spacing.md, alignItems: 'center' },
  kitText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  offer: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 3 },
  paid: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.peachDeep },
  code: { alignSelf: 'flex-start', fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 1, color: colors.butterDeep, backgroundColor: colors.butter, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  sheetRow: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.white, marginTop: 6 },
  sheetRowOn: { backgroundColor: colors.ink },
  sheetText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  sheetTextOn: { color: colors.cream },
});
