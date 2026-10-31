import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { MusicStrip } from '../components/MusicStrip';
import { listRuns } from '../db';
import { appByKey, canControl, installedApps, installedPackages, openMusicApp, type MusicApp } from '../music';
import { playlistTarget, type Mood, type MoodKey } from '../playlistLogic';
import { MOODS } from '../playlists';
import { dayKey } from '../presets';
import { useSettings } from '../settings';
import { coverFetchable, coverFor, fetchShowCover, phoneLocale, refreshShelf, storedShelf } from '../shelf';
import {
  GROUPS,
  OFFER_TOPICS,
  topicLabel,
  PODCAST_APPS,
  filterOffers,
  fitsRun,
  freshEpisodes,
  inGroup,
  localShows,
  offersFor,
  parseLocale,
  pickCountry,
  openTarget,
  usualRunMin,
  whenLabel,
  type Episode,
  type Fresh,
  type Group,
  type Offer,
  type Shelf,
  type Show,
} from '../shelfLogic';
import { colors, fonts, radius, spacing } from '../theme';
import type { PodcastApp } from '../types';
import { ui } from '../i18n/ui';
import { DISPLAY_MAX_SCALE } from '../a11y';
import { dateLocale } from '../i18n/lang';
import { useReduceMotion } from '../motion';

/**
 * Everything you hear on a run, in one place: which app plays your music, which
 * one plays podcasts, what the run screen's music strip does, and shows worth
 * taking along. Runtrovert never plays audio itself: a show opens in the runner's
 * own podcast app, so the podcast hosts never meet a Runtrovert user.
 * Kit & offers lives at the very bottom, only when a sponsor exists.
 *
 * With TalkBack or VoiceOver: section names are headings, app and country
 * pickers are radio groups, each episode card is two stops (the card, then its
 * Open button), and every sheet keeps the reader inside it until it closes.
 */

type Tint = { bg: string; fg: string };

const GROUP_TINT: Record<Group, Tint> = {
  quiet: { bg: colors.mint, fg: colors.mintDeep },
  stories: { bg: colors.lilac, fg: colors.lilacDeep },
  learn: { bg: colors.sky, fg: colors.skyDeep },
  start: { bg: colors.butter, fg: colors.butterDeep },
};
const LOCAL_TINT: Tint = { bg: colors.peach, fg: colors.peachDeep };

const MOOD_TINT: Record<MoodKey, Tint> = {
  easy: { bg: colors.mint, fg: colors.mintDeep },
  long: { bg: colors.sky, fg: colors.skyDeep },
  tempo: { bg: colors.butter, fg: colors.butterDeep },
  fast: { bg: colors.peach, fg: colors.peachDeep },
};

type Picking = { kind: 'music'; then?: Mood } | { kind: 'podcast'; then: Show | null; ep?: Episode | null };

/** runLive: opened from a run in progress, so Back returns to it and the top says it's still recording. */
export function ListenScreen({ onBack, runLive = false }: { onBack?: () => void; runLive?: boolean }) {
  const { settings, update } = useSettings();
  const { width } = useWindowDimensions();
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [usual, setUsual] = useState<number | null>(null);
  const [musicApps, setMusicApps] = useState<MusicApp[]>([]);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [detail, setDetail] = useState<{ show: Show; tint: Tint } | null>(null);
  const [kit, setKit] = useState(false);
  const [countries, setCountries] = useState(false);

  useEffect(() => {
    let live = true;
    storedShelf().then((s) => live && (setShelf(s.shelf), setFetchedAt(s.fetchedAt)));
    listRuns()
      .then((runs) => live && setUsual(usualRunMin(runs.map((r) => r.durationS))))
      .catch(() => {});
    installedApps().then((a) => live && setMusicApps(a));
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

  // Pull down for today's list now, whatever the age of the one on the phone.
  const [pulling, setPulling] = useState(false);
  async function pull() {
    if (settings.listenDownload !== 'on') return;
    setPulling(true);
    const s = await refreshShelf(true);
    setShelf(s.shelf);
    setFetchedAt(s.fetchedAt);
    setPulling(false);
  }

  const online = settings.listenDownload === 'on';
  const locale = phoneLocale();
  const cc = shelf ? pickCountry(shelf, locale, settings.podcastCountry) : null;
  const local = shelf ? localShows(shelf, cc) : [];
  const today = new Date().toISOString().slice(0, 10);
  const offers = shelf && !settings.offersHidden ? offersFor(shelf.offers, cc, today) : [];
  const localFirst = local.length > 0 && parseLocale(locale).lang !== 'en';
  const fresh = useMemo(() => (shelf ? freshEpisodes([...local, ...shelf.curated], today, usual) : []), [shelf, cc, usual, today]);
  const podcastApp = PODCAST_APPS.find((a) => a.key === settings.podcastApp) ?? null;
  const tintOf = (show: Show): Tint => {
    const g = shelf?.curated.find((c) => c.id === show.id)?.groups?.[0];
    return g ? GROUP_TINT[g] : LOCAL_TINT;
  };

  async function open(show: Show, app: PodcastApp | null, ep?: Episode | null) {
    if (!app) {
      setPicking({ kind: 'podcast', then: show, ep });
      return;
    }
    await openShowIn(show, app, ep);
  }

  if (kit && shelf) {
    return <KitShelf offers={offers} onBack={() => setKit(false)} />;
  }

  const localRail = local.length ? (
    <Rail
      title={ui().listen.nearYouX(flag(cc))}
      hint={ui().listen.runningPodcastsPeopleListenTo}
      action={{ label: ui().listen.changeCountry, onPress: () => setCountries(true) }}
      shows={local}
      tint={LOCAL_TINT}
      online={online}
      onOpen={(s) => setDetail({ show: s, tint: LOCAL_TINT })}
    />
  ) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}
      refreshControl={settings.listenDownload === 'on' ? <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={colors.ink} colors={[colors.ink]} /> : undefined}
    >
      {onBack ? <BackButton label={runLive ? ui().listen.backToYourRun : ui().listen.start} onPress={onBack} /> : null}
      {runLive ? (
        <View style={styles.recording} accessible accessibilityLiveRegion="polite">
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>{ui().listen.stillRecording}</Text>
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.h1} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{ui().listen.listen}</Text>
        <Text style={styles.lede}>{ui().listen.voicesToTakeWithYou}</Text>
      </View>

      <View style={styles.sound}>
        <Text style={styles.soundEyebrow} accessibilityRole="header">{ui().listen.yourSound}</Text>
        <View style={styles.rowGap}>
          <AppTile
            kind="music"
            label={ui().listen.music}
            value={appByKey(settings.musicApp)?.name ?? ui().listen.phoneSDefault}
            onPress={() => setPicking({ kind: 'music' })}
          />
          <AppTile kind="podcast" label={ui().listen.podcasts} value={podcastApp ? short(podcastApp.label) : ui().listen.askEachTime} onPress={() => setPicking({ kind: 'podcast', then: null })} />
        </View>
        <View style={styles.stripHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.soundTitle}>{ui().listen.onTheRunScreen}</Text>
            <Text style={styles.soundHint}>
              {canControl
                ? ui().listen.previousPlayAndNextReach
                : ui().listen.aButtonThatOpensYour}
            </Text>
          </View>
          <Switch
            value={settings.musicStrip}
            onValueChange={(v) => update({ musicStrip: v })}
            trackColor={{ true: colors.lilac, false: 'rgba(246,241,234,0.2)' }}
            thumbColor={settings.musicStrip ? colors.cream : colors.onInkMuted}
            accessibilityLabel={ui().listen.musicStripOnTheRun}
          />
        </View>
        {settings.musicStrip ? <MusicStrip appKey={settings.musicApp} /> : null}
        <Text style={styles.soundHint}>{ui().listen.voiceCuesLowerYourMusic}</Text>
      </View>

      <MusicMoods
        appKey={settings.musicApp}
        onOpen={(mood) => (settings.musicApp ? openMood(mood, settings.musicApp) : setPicking({ kind: 'music', then: mood }))}
      />

      {settings.listenDownload === 'ask' ? (
        <View style={[styles.card, { backgroundColor: colors.butter }]}>
          <Text style={styles.cardTitle} accessibilityRole="header">{ui().listen.getTodaySEpisodesAnd}</Text>
          <Text style={styles.cardText}>{ui().listen.oneSmallDownloadFromRuntrovert}</Text>
          <View style={styles.rowGap}>
            <Pill label={ui().listen.yesKeepItFresh} dark onPress={() => update({ listenDownload: 'on' })} />
            <Pill label={ui().listen.noThanks} onPress={() => update({ listenDownload: 'off' })} />
          </View>
        </View>
      ) : null}

      {fresh.length ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHead
            title={ui().listen.newForYourRun}
            hint={usual ? ui().listen.outThisWeekTheOnes(usual) : ui().listen.outThisWeekNewestFirst}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={Math.min(width * 0.82, 360) + spacing.sm}
            decelerationRate="fast"
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
            style={styles.bleed}
          >
            {fresh.map((f) => (
              <EpisodeCard
                key={f.show.id}
                item={f}
                width={Math.min(width * 0.82, 360)}
                today={today}
                tint={tintOf(f.show)}
                online={online}
                label={buttonLabel(settings.podcastApp, f.show, f.ep)}
                onOpen={() => open(f.show, settings.podcastApp, f.ep)}
                onMore={() => setDetail({ show: f.show, tint: tintOf(f.show) })}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {localFirst ? localRail : null}

      {shelf
        ? GROUPS.map((g) => {
            const shows = inGroup(shelf.curated, g.key);
            return shows.length ? (
              <Rail
                key={g.key}
                title={g.label}
                hint={g.hint}
                shows={shows}
                tint={GROUP_TINT[g.key]}
                online={online}
                onOpen={(s) => setDetail({ show: s, tint: GROUP_TINT[g.key] })}
              />
            ) : null;
          })
        : null}

      {localFirst ? null : localRail}

      {!local.length && shelf && Object.keys(shelf.regions).length ? (
        <Pressable onPress={() => setCountries(true)} accessibilityRole="button" style={styles.linkRow}>
          <Text style={styles.link}>{ui().listen.pickACountryForLocal}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footnote}>
        {shelf ? ui().listen.listFromXX(shelf.builtAt.slice(0, 10), fetchedAt ? '' : ui().listen.theOneThisVersionShipped) : ''}
        {ui().listen.adverts} {ui().listen.coversBelong}
      </Text>

      {offers.length ? (
        <Pressable onPress={() => setKit(true)} accessibilityRole="button" style={styles.kitRow}>
          <Text style={styles.kitText}>{ui().listen.kitOffersIfYouEver}</Text>
        </Pressable>
      ) : null}

      <ShowSheet
        item={detail}
        usual={usual}
        today={today}
        online={online}
        onClose={() => setDetail(null)}
        onOpen={(app, ep) => {
          const show = detail?.show;
          setDetail(null);
          if (show) open(show, app, ep);
        }}
      />
      <AppSheet
        picking={picking}
        musicApps={musicApps}
        musicApp={settings.musicApp}
        podcastApp={settings.podcastApp}
        onClose={() => setPicking(null)}
        onMusic={(key) => {
          const mood = picking?.kind === 'music' ? picking.then : undefined;
          update({ musicApp: key });
          setPicking(null);
          if (mood) openMood(mood, key);
        }}
        onPodcast={(app) => {
          const show = picking?.kind === 'podcast' ? picking.then : null;
          const ep = picking?.kind === 'podcast' ? picking.ep : null;
          update({ podcastApp: app });
          setPicking(null);
          if (show && app) open(show, app, ep);
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
        }}
      />
    </ScrollView>
  );
}

/**
 * Opens the episode (or else the show) in the chosen podcast app, using the links
 * the daily list carries. If the app can't take it, shares the feed instead.
 */
async function openShowIn(show: Show, app: PodcastApp, ep?: Episode | null) {
  const target = openTarget(app, show, ep);
  if (target) {
    const ok = await Linking.openURL(target.url).then(() => true, () => false);
    if (ok) return;
  }
  shareFeed(show);
}

/** Opens a running playlist in the music app: the exact one, else a search there, else just the app. */
async function openMood(mood: Mood, app: string | null) {
  const target = playlistTarget(mood, app);
  if (target && (await Linking.openURL(target.url).then(() => true, () => false))) return;
  await openMusicApp(app);
}

function moodName(key: MoodKey): { title: string; hint: string } {
  const l = ui().listen;
  switch (key) {
    case 'easy':
      return { title: l.moodEasy, hint: l.moodEasyHint };
    case 'long':
      return { title: l.moodLong, hint: l.moodLongHint };
    case 'tempo':
      return { title: l.moodTempo, hint: l.moodTempoHint };
    case 'fast':
      return { title: l.moodFast, hint: l.moodFastHint };
  }
}

/** "Open in Spotify", "Search in Tidal", or "Choose your music app" before one is picked. */
function moodLabel(mood: Mood, appKey: string | null): string {
  const app = appByKey(appKey);
  if (!app) return ui().listen.chooseYourMusicApp;
  const t = playlistTarget(mood, app.key);
  return t?.kind === 'search' ? ui().listen.searchInX(app.name) : ui().listen.openInX(app.name);
}

/**
 * Four running playlists, by mood, that open straight in the runner's music app.
 * They ship with the app (content/playlists.json), so showing them fetches nothing.
 */
function MusicMoods({ appKey, onOpen }: { appKey: string | null; onOpen: (mood: Mood) => void }) {
  if (!MOODS.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHead title={ui().listen.musicForYourRun} hint={ui().listen.musicForYourRunHint} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: spacing.md }} style={styles.bleed}>
        {MOODS.map((m) => {
          const tint = MOOD_TINT[m.key] ?? MOOD_TINT.easy;
          const { title, hint } = moodName(m.key);
          const target = playlistTarget(m, appKey);
          const label = moodLabel(m, appKey);
          return (
            <Pressable
              key={m.key}
              onPress={() => onOpen(m)}
              accessibilityRole="button"
              accessibilityLabel={[title, target?.kind === 'playlist' ? target.title : null, hint].filter(Boolean).join('. ')}
              accessibilityHint={label}
              style={({ pressed }) => [styles.moodTile, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]}
            >
              <NoteGlyph color={tint.fg} />
              <View style={{ gap: 4, flex: 1 }}>
                <Text style={styles.moodTitle} numberOfLines={2}>{title}</Text>
                <Text style={[styles.moodHint, { color: tint.fg }]} numberOfLines={3}>{hint}</Text>
              </View>
              <View style={styles.moodFoot}>
                {target?.kind === 'playlist' ? (
                  <Text style={[styles.moodPlaylist, { color: tint.fg }]} numberOfLines={1}>{target.title}</Text>
                ) : null}
                <Text style={styles.moodOpen} numberOfLines={1}>{label} ↗</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>{ui().listen.playlistsBelong}</Text>
    </View>
  );
}

function shareFeed(show: Show) {
  Share.share({ message: show.feed, title: show.name }).catch(() => {});
}

/** "Open in Spotify"; "Search in YouTube Music" when the list has no direct link there. */
function buttonLabel(app: PodcastApp | null, show: Show, ep?: Episode | null): string {
  const a = PODCAST_APPS.find((x) => x.key === app);
  if (!a || a.key === 'share') return ui().listen.open;
  return openTarget(a.key, show, ep)?.kind === 'search' ? ui().listen.searchInX(short(a.label)) : ui().listen.openInX(short(a.label));
}

/**
 * Listen, one tap from Start: your sound, the player, two shows that fit your
 * usual run and a way to run in silence today. Every shelf is one tap deeper.
 */
export function ListenSheet({ open, onClose, onBrowse }: { open: boolean; onClose: () => void; onBrowse: () => void }) {
  const { settings, update } = useSettings();
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [usual, setUsual] = useState<number | null>(null);
  const [musicApps, setMusicApps] = useState<MusicApp[]>([]);
  const [picking, setPicking] = useState<Picking | null>(null);

  // Only what's already on the phone: the sheet never downloads anything.
  useEffect(() => {
    if (!open) return;
    let live = true;
    storedShelf().then((s) => live && setShelf(s.shelf));
    listRuns()
      .then((runs) => live && setUsual(usualRunMin(runs.map((r) => r.durationS))))
      .catch(() => {});
    installedApps().then((a) => live && setMusicApps(a));
    return () => {
      live = false;
    };
  }, [open]);

  const online = settings.listenDownload === 'on';
  const today = new Date().toISOString().slice(0, 10);
  const cc = shelf ? pickCountry(shelf, phoneLocale(), settings.podcastCountry) : null;
  const two = useMemo(() => (shelf ? freshEpisodes([...localShows(shelf, cc), ...shelf.curated], today, usual).slice(0, 2) : []), [shelf, cc, usual, today]);
  const podcastApp = PODCAST_APPS.find((a) => a.key === settings.podcastApp) ?? null;
  const silent = settings.silentDay === dayKey(Date.now());
  const tintOf = (show: Show): Tint => {
    const g = shelf?.curated.find((c) => c.id === show.id)?.groups?.[0];
    return g ? GROUP_TINT[g] : LOCAL_TINT;
  };

  return (
    <SheetModal
      visible={open}
      onClose={onClose}
      sheetStyle={[styles.sheet, { maxHeight: '94%' }]}
      after={
        <AppSheet
          picking={picking}
          musicApps={musicApps}
          musicApp={settings.musicApp}
          podcastApp={settings.podcastApp}
          onClose={() => setPicking(null)}
          onMusic={(key) => {
            update({ musicApp: key });
            setPicking(null);
          }}
          onPodcast={(app) => {
            const show = picking?.kind === 'podcast' ? picking.then : null;
            const ep = picking?.kind === 'podcast' ? picking.ep : null;
            update({ podcastApp: app });
            setPicking(null);
            if (show && app) openShowIn(show, app, ep);
          }}
        />
      }
    >
      <View style={styles.grabber} />
      <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 2 }}>
          <Text style={styles.h2} accessibilityRole="header">{ui().listen.listen}</Text>
          <Text style={styles.lede}>{ui().listen.somethingToTakeWithYou}</Text>
        </View>

        <View style={styles.sound}>
          <View style={styles.rowGap}>
            <AppTile compact kind="music" label={ui().listen.music} value={appByKey(settings.musicApp)?.name ?? ui().listen.phoneSDefault} onPress={() => setPicking({ kind: 'music' })} />
            <AppTile compact kind="podcast" label={ui().listen.podcasts} value={podcastApp ? short(podcastApp.label) : ui().listen.askEachTime} onPress={() => setPicking({ kind: 'podcast', then: null })} />
          </View>
          <MusicStrip appKey={settings.musicApp} />
        </View>

        {two.length ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sheetEyebrow}>{usual ? ui().listen.fitsYourUsualXMinutes(usual) : ui().listen.newThisWeek}</Text>
            {two.map((f) => (
              <Pressable
                key={f.show.id}
                onPress={() => (settings.podcastApp ? openShowIn(f.show, settings.podcastApp, f.ep) : setPicking({ kind: 'podcast', then: f.show, ep: f.ep }))}
                accessibilityRole="button"
                accessibilityLabel={ui().listen.xXXOpensIn(f.ep.title, f.show.name, f.ep.min ? ui().listen.xMinutes(f.ep.min) : '')}
                style={({ pressed }) => [styles.miniEp, pressed && { opacity: 0.85 }]}
              >
                <Cover show={f.show} size={56} tint={tintOf(f.show)} online={online} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.epsTitle} numberOfLines={2}>
                    {f.ep.title}
                  </Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {f.show.name}
                    {f.ep.min ? ui().listen.xMin(f.ep.min) : ''} · {whenLabel(f.ep.date, today)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable onPress={onBrowse} accessibilityRole="button" style={styles.sheetLine}>
          <Text style={styles.sheetLineText}>{ui().listen.browseEveryShelf}</Text>
          <Text style={styles.sheetLineText} importantForAccessibility="no">›</Text>
        </Pressable>
        <View style={[styles.sheetLine, styles.sheetLineRule]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.sheetLineText}>{ui().listen.runInSilenceToday}</Text>
            <Text style={styles.hint}>{ui().listen.noVoiceNoBuzzOn}</Text>
          </View>
          <Switch
            value={silent}
            onValueChange={(v) => update({ silentDay: v ? dayKey(Date.now()) : null })}
            trackColor={{ true: colors.ink }}
            accessibilityLabel={ui().listen.runInSilenceToday}
          />
        </View>
        <Button title={ui().listen.backToStart} onPress={onClose} />
      </ScrollView>
    </SheetModal>
  );
}

/**
 * A sheet over the page. Tapping the shade closes it; with a screen reader the
 * shade is a "Close" button of its own, so the sheet's words stay separate items
 * (a shade wrapped around the sheet would swallow them). The reader stays in
 * the sheet, and the phone's reduce-motion setting turns the slide off.
 */
function SheetModal({
  visible,
  onClose,
  sheetStyle,
  fade,
  after,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  sheetStyle: StyleProp<ViewStyle>;
  fade?: boolean;
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  const still = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={still ? 'none' : fade ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={ui().listen.close} />
        <View style={sheetStyle} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          {children}
        </View>
      </View>
      {after}
    </Modal>
  );
}

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.headRow}>
        <Text style={styles.h2} accessibilityRole="header">{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
            <Text style={styles.headAction}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Rail({
  title,
  hint,
  action,
  shows,
  tint,
  online,
  onOpen,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
  shows: Show[];
  tint: Tint;
  online: boolean;
  onOpen: (show: Show) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHead title={title} hint={hint} action={action} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: spacing.md }} style={styles.bleed}>
        {shows.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onOpen(s)}
            accessibilityRole="button"
            accessibilityLabel={ui().listen.xByX(s.name, s.by)}
            accessibilityHint={ui().listen.opensTheShow}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
          >
            <Cover show={s} size={TILE} tint={tint} online={online} />
            <Text style={styles.tileName} numberOfLines={2}>
              {s.name}
            </Text>
            <Text style={styles.tileBy} numberOfLines={1}>
              {s.latest[0]?.min ? ui().listen.xMin2(s.latest[0].min) : ''}
              {s.by}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function EpisodeCard({
  item,
  width,
  today,
  tint,
  online,
  label,
  onOpen,
  onMore,
}: {
  item: Fresh;
  width: number;
  today: string;
  tint: Tint;
  online: boolean;
  label: string;
  onOpen: () => void;
  onMore: () => void;
}) {
  const { show, ep, fits } = item;
  const meta = `${ep.min ? ui().listen.xMin3(ep.min) : ''}${whenLabel(ep.date, today)}`;
  return (
    <View style={[styles.epCard, { width, backgroundColor: tint.bg }]}>
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={[show.name, ep.title, meta, fits ? ui().listen.fitsYourRun : null].filter(Boolean).join('. ')}
        accessibilityHint={ui().listen.opensTheShow}
        style={({ pressed }) => [{ gap: 14 }, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.epTop}>
          <Cover show={show} size={88} tint={tint} online={online} onTint />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.epShow, { color: tint.fg }]} numberOfLines={1}>
              {show.name}
            </Text>
            <Text style={styles.epTitle} numberOfLines={3}>
              {ep.title}
            </Text>
          </View>
        </View>
        <View style={styles.epBottom}>
          <Text style={[styles.epMeta, { color: tint.fg }]}>{meta}</Text>
          {fits ? (
            <View style={styles.fits}>
              <Text style={styles.fitsText}>{ui().listen.fitsYourRun}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <PlayButton label={label} spoken={`${label}: ${ep.title}`} onPress={onOpen} wide />
    </View>
  );
}

function ShowSheet({
  item,
  usual,
  today,
  online,
  onClose,
  onOpen,
}: {
  item: { show: Show; tint: Tint } | null;
  usual: number | null;
  today: string;
  online: boolean;
  onClose: () => void;
  onOpen: (app: PodcastApp | null, ep?: Episode | null) => void;
}) {
  const { settings } = useSettings();
  const show = item?.show;
  return (
    <SheetModal visible={!!item} onClose={onClose} sheetStyle={[styles.sheet, { backgroundColor: item?.tint.bg ?? colors.cream }]}>
      {show && item ? (
        <>
          <View style={styles.grabber} />
          <View style={styles.epTop}>
            <Cover show={show} size={112} tint={item.tint} online={online} onTint />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sheetName} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{show.name}</Text>
              <Text style={[styles.showBy, { color: item.tint.fg }]}>
                {show.by}
                {show.since ? ui().listen.sinceX(show.since) : show.episodes ? ui().listen.xEpisodes(show.episodes) : ''}
              </Text>
            </View>
          </View>
          {show.why ? <Text style={styles.why}>{show.why}</Text> : null}
          {show.latest.length ? (
            <View style={styles.eps}>
              <Text style={[styles.epsLabel, { color: item.tint.fg }]} accessibilityRole="header">{ui().listen.latest}</Text>
              {show.latest.map((e) => (
                <Pressable
                  key={e.title + e.date}
                  onPress={() => onOpen(settings.podcastApp, e)}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.title}. ${buttonLabel(settings.podcastApp, show, e)}`}
                  style={({ pressed }) => [styles.epsRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.epsTitle} numberOfLines={2}>
                      {e.title}
                    </Text>
                    <Text style={styles.showBy}>
                      {e.min ? ui().listen.xMin4(e.min) : ''}
                      {whenLabel(e.date, today)}
                      {fitsRun(e.min, usual) ? ui().listen.fitsYourUsualRun : ''}
                    </Text>
                  </View>
                  <Svg width={22} height={22} viewBox="0 0 22 22" importantForAccessibility="no">
                    <Circle cx={11} cy={11} r={11} fill={colors.ink} />
                    <Path d="M8.5 6.5 L15.5 11 L8.5 15.5 Z" fill={colors.cream} />
                  </Svg>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={[styles.rowGap, { alignItems: 'center' }]}>
            <PlayButton label={buttonLabel(settings.podcastApp, show)} onPress={() => onOpen(settings.podcastApp)} />
            {settings.podcastApp ? <Pill label={ui().listen.anotherApp} onPress={() => onOpen(null)} /> : null}
          </View>
          {settings.podcastApp && openTarget(settings.podcastApp, show)?.kind === 'search' ? (
            <Pressable onPress={() => shareFeed(show)} accessibilityRole="button" style={styles.linkRow}>
              <Text style={[styles.hint, { color: item.tint.fg }]}>
                {ui().listen.notFoundInYourAppYet}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </SheetModal>
  );
}

function AppSheet({
  picking,
  musicApps,
  musicApp,
  podcastApp,
  onClose,
  onMusic,
  onPodcast,
}: {
  picking: Picking | null;
  musicApps: MusicApp[];
  musicApp: string | null;
  podcastApp: PodcastApp | null;
  onClose: () => void;
  onMusic: (key: string | null) => void;
  onPodcast: (app: PodcastApp | null) => void;
}) {
  const podcastApps = useMemo(() => {
    const list = PODCAST_APPS.filter((a) => (Platform.OS === 'ios' ? a.ios : a.android));
    const here = installedPackages(list.flatMap((a) => (a.pkg ? [a.pkg] : [])));
    return list.map((a) => ({ ...a, here: !!a.pkg && here.has(a.pkg) })).sort((a, b) => Number(b.here) - Number(a.here));
  }, []);
  const music = picking?.kind === 'music';
  const forShow = picking?.kind === 'podcast' && picking.then;
  return (
    <SheetModal visible={!!picking} onClose={onClose} sheetStyle={[styles.sheet, { maxHeight: '80%' }]}>
      <View style={styles.grabber} />
      <Text style={styles.cardTitle} accessibilityRole="header">{music ? ui().listen.musicFrom : ui().listen.podcastsIn}</Text>
      <Text style={styles.hint}>
        {music
          ? ui().listen.openedFromTheRunScreen
          : forShow
            ? ui().listen.whereShouldShowsOpenRemembered
            : ui().listen.showsOpenThereRememberedOn}
      </Text>
      <ScrollView contentContainerStyle={{ gap: 6 }} accessibilityRole="radiogroup">
        {music
          ? [{ key: null, name: ui().listen.phoneSDefault } as { key: string | null; name: string }, ...musicApps].map((a) => (
              <SheetRow key={a.key ?? 'default'} label={a.name} on={musicApp === a.key} onPress={() => onMusic(a.key)} />
            ))
          : [
              ...(forShow ? [] : [<SheetRow key="ask" label={ui().listen.askEachTime} on={podcastApp == null} onPress={() => onPodcast(null)} />]),
              ...podcastApps.map((a) => (
                <SheetRow key={a.key} label={a.label} note={a.here ? ui().listen.onThisPhone : undefined} on={podcastApp === a.key} onPress={() => onPodcast(a.key)} />
              )),
            ]}
      </ScrollView>
    </SheetModal>
  );
}

function SheetRow({ label, note, on, onPress }: { label: string; note?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.sheetRow, on && styles.sheetRowOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={note ? `${label}, ${note}` : label}
    >
      <Text style={[styles.sheetText, on && styles.sheetTextOn]}>{label}</Text>
      {note ? <Text style={[styles.sheetNote, on && { color: colors.onInkMuted }]}>{note}</Text> : null}
    </Pressable>
  );
}

function AppTile({ kind, label, value, onPress, compact }: { kind: 'music' | 'podcast'; label: string; value: string; onPress: () => void; compact?: boolean }) {
  const tint = kind === 'music' ? { bg: colors.lilac, fg: colors.lilacDeep } : { bg: colors.butter, fg: colors.butterDeep };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ui().listen.xXChange(label, value)}
      style={({ pressed }) => [styles.appTile, compact && { minHeight: 0 }, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]}
    >
      {kind === 'music' ? <NoteGlyph color={tint.fg} /> : <MicGlyph color={tint.fg} />}
      <Text style={[styles.appTileLabel, { color: tint.fg }]}>{label}</Text>
      <Text style={styles.appTileValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={[styles.appTileChange, { color: tint.fg }]}>{ui().listen.change}</Text>
    </Pressable>
  );
}

const TILE = 132;

/** The show's cover, or its initials on the section's pastel when there's no cover. */
function Cover({ show, size, tint, online, onTint }: { show: Show; size: number; tint: Tint; online: boolean; onTint?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState<{ id: number; src: ImageSourcePropType } | null>(null);
  const kept = coverFor(show);
  // Not on the phone yet: fetch it once, keep it, and fall back to initials meanwhile or offline.
  useEffect(() => {
    if (kept || !coverFetchable(show, online)) return;
    let live = true;
    fetchShowCover(show).then((s) => live && s && setFetched({ id: show.id, src: s }));
    return () => {
      live = false;
    };
  }, [show.id, online, !!kept]);
  const src: ImageSourcePropType | null = failed ? null : kept ?? (fetched?.id === show.id ? fetched.src : null);
  const r = Math.round(size * 0.16);
  if (src) {
    return <Image source={src} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.white }} accessibilityIgnoresInvertColors accessible={false} importantForAccessibility="no" />;
  }
  // Initials drawn to fit the square: they don't grow with the font size, and the
  // show's name is read out by whatever holds the cover.
  return (
    <View style={[styles.art, { width: size, height: size, borderRadius: r, backgroundColor: onTint ? colors.white : tint.bg }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text style={[styles.artText, { color: tint.fg, fontSize: size * 0.32 }]} allowFontScaling={false}>{initials(show.name)}</Text>
    </View>
  );
}

function PlayButton({ label, spoken, onPress, wide }: { label: string; spoken?: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      style={({ pressed }) => [styles.play, wide && { justifyContent: 'center' }, pressed && { opacity: 0.85 }]}
    >
      <Svg width={14} height={14} viewBox="0 0 14 14">
        <Path d="M3.5 2 L12 7 L3.5 12 Z" fill={colors.cream} stroke={colors.cream} strokeWidth={1.4} strokeLinejoin="round" />
      </Svg>
      <Text style={styles.playText}>{label}</Text>
    </Pressable>
  );
}

function NoteGlyph({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 16 16">
      <Path d="M6 12 V3.4 L13 2 V10.8" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={4.2} cy={12} r={1.9} stroke={color} strokeWidth={1.4} fill="none" />
      <Circle cx={11.2} cy={10.8} r={1.9} stroke={color} strokeWidth={1.4} fill="none" />
    </Svg>
  );
}

function MicGlyph({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 16 16">
      <Rect x={5.6} y={1.6} width={4.8} height={8} rx={2.4} stroke={color} strokeWidth={1.4} fill="none" />
      <Path d="M3.4 7.6 a4.6 4.6 0 0 0 9.2 0 M8 12.2 V14.4 M5.8 14.4 H10.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** "Another app (share the feed)" → "Another app". */
function short(label: string): string {
  return label.replace(/\s*\(.*\)$/, '');
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
      <BackButton label={ui().listen.listen} onPress={onBack} />
      <Text style={styles.h1} accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{ui().listen.kitOffers}</Text>
      <Text style={styles.lede}>{ui().listen.paidForByThemOpened}</Text>
      {topics.length ? (
        <View style={[styles.rowGap, { flexWrap: 'wrap' }]}>
          {topics.map((t) => (
            <Chip key={t} label={topicLabel(t)} on={settings.offerTopics.includes(t)} onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
      {shown.map((o) => (
        <View key={o.id} style={styles.offer}>
          <Text style={styles.paid}>{ui().listen.paidPlacement}</Text>
          <Text style={styles.showName}>{o.title}</Text>
          <Text style={styles.showBy}>{o.sponsor}</Text>
          <Text style={styles.why}>{o.text}</Text>
          {o.code ? (
            <Text selectable style={styles.code}>
              {o.code}
            </Text>
          ) : null}
          <View style={[styles.rowGap, { marginTop: 4 }]}>
            <Pill label={ui().listen.visitX(o.sponsor)} dark onPress={() => Linking.openURL(o.url).catch(() => {})} />
          </View>
        </View>
      ))}
      {!shown.length ? <Text style={styles.hint}>{ui().listen.nothingForThosePicksRight}</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.sky }]}>
        <Text style={[styles.cardText, { color: colors.skyDeep }]}>{ui().listen.yourPicksStayOnThis}</Text>
      </View>
      <Pressable
        onPress={() => {
          update({ offersHidden: true });
          onBack();
        }}
        accessibilityRole="button"
        style={styles.linkRow}
      >
        <Text style={styles.link}>{ui().listen.hideThisShelfForGood}</Text>
      </Pressable>
    </ScrollView>
  );
}

function CountryChooser({ open, codes, current, onClose, onPick }: { open: boolean; codes: string[]; current: string | null; onClose: () => void; onPick: (cc: string | null) => void }) {
  return (
    <SheetModal visible={open} onClose={onClose} fade sheetStyle={[styles.sheet, { maxHeight: '75%' }]}>
      <Text style={styles.cardTitle} accessibilityRole="header">{ui().listen.localShowsFrom}</Text>
      <Text style={styles.hint}>{ui().listen.chosenHereKeptHereThe}</Text>
      <ScrollView contentContainerStyle={{ gap: 6 }} accessibilityRole="radiogroup">
        <Pressable onPress={() => onPick(null)} style={[styles.sheetRow, current == null && styles.sheetRowOn]} accessibilityRole="radio" accessibilityState={{ checked: current == null }}>
          <Text style={[styles.sheetText, current == null && styles.sheetTextOn]}>{ui().listen.thePhoneSRegion}</Text>
        </Pressable>
        {codes.map((c) => (
          <Pressable
            key={c}
            onPress={() => onPick(c)}
            style={[styles.sheetRow, current === c && styles.sheetRowOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: current === c }}
            accessibilityLabel={countryName(c)}
          >
            <Text style={[styles.sheetText, current === c && styles.sheetTextOn]}>
              {flag(c)} {c.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SheetModal>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
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

/** "Germany" (in the app's language) for "de", for screen readers; the code itself if the phone can't say. */
function countryName(cc: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of: (c: string) => string | undefined } }).DisplayNames;
    return (DN && new DN([dateLocale()], { type: 'region' }).of(cc.toUpperCase())) || cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

/** Two letters to the regional-indicator pair the phone draws as a flag. */
function flag(cc: string | null): string {
  if (!cc || !/^[a-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const styles = StyleSheet.create({
  recording: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },
  recordingText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.cream },
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  bleed: { marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.text, flexShrink: 1 },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  headAction: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  footnote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  linkRow: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  cardText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.white, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.cream },

  sound: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.md, gap: 14 },
  soundEyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: colors.onInkMuted },
  soundTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.cream },
  soundHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.onInkMuted },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  appTile: { flex: 1, borderRadius: radius.md, padding: 14, gap: 4, minHeight: 132 },
  appTileLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6 },
  appTileValue: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, color: colors.text, flex: 1 },
  appTileChange: { fontFamily: fonts.bodySemi, fontSize: 13 },

  epCard: { borderRadius: radius.lg, padding: 14, gap: 14 },
  epTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  epShow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  epTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.text },
  epBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: -4 },
  epMeta: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  fits: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  fitsText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.mintDeep },
  play: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 16, minHeight: 48 },
  playText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },

  tile: { width: TILE, gap: 6 },
  moodTile: { width: 168, minHeight: 200, borderRadius: radius.lg, padding: 14, gap: 10 },
  moodTitle: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.text },
  moodHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  moodFoot: { gap: 2 },
  moodPlaylist: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.4 },
  moodOpen: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  tileName: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.text },
  tileBy: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -4 },
  art: { alignItems: 'center', justifyContent: 'center' },
  artText: { fontFamily: fonts.display },

  showName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  showBy: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  why: { fontFamily: fonts.displayItalic, fontSize: 16, lineHeight: 23, color: colors.text },
  sheetName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: colors.text },
  eps: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: radius.md, padding: 14, gap: 10 },
  epsLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  epsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  epsTitle: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: colors.text },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,39,51,0.2)', marginTop: -8, marginBottom: 4 },

  pill: { borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.white, minHeight: 44, justifyContent: 'center' },
  pillDark: { backgroundColor: colors.ink },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  pillTextDark: { color: colors.cream },
  kitRow: { paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  kitText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  offer: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 3 },
  paid: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.peachDeep },
  code: { alignSelf: 'flex-start', fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 1, color: colors.butterDeep, backgroundColor: colors.butter, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  sheetEyebrow: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: colors.muted },
  miniEp: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: colors.white },
  sheetLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48 },
  sheetLineRule: { paddingTop: spacing.xs },
  sheetLineText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  sheetRow: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sheetRowOn: { backgroundColor: colors.ink },
  sheetText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  sheetTextOn: { color: colors.cream },
  sheetNote: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
