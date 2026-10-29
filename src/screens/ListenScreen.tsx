import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MusicStrip } from '../components/MusicStrip';
import { listRuns } from '../db';
import { appByKey, canControl, installedApps, installedPackages, type MusicApp } from '../music';
import { useSettings } from '../settings';
import { coverFor, phoneLocale, refreshShelf, storedShelf } from '../shelf';
import {
  GROUPS,
  OFFER_TOPICS,
  PODCAST_APPS,
  filterOffers,
  fitsRun,
  freshEpisodes,
  inGroup,
  localShows,
  offersFor,
  parseLocale,
  pickCountry,
  showLink,
  usualRunMin,
  whenLabel,
  type Fresh,
  type Group,
  type Offer,
  type Shelf,
  type Show,
} from '../shelfLogic';
import { colors, fonts, radius, spacing } from '../theme';
import type { PodcastApp } from '../types';

/**
 * Everything you hear on a run, in one place: which app plays your music, which
 * one plays podcasts, what the run screen's music strip does, and shows worth
 * taking along. Runtrovert never plays audio itself: a show opens in the runner's
 * own podcast app, so the podcast hosts never meet a Runtrovert user.
 * Kit & offers lives at the very bottom, only when a sponsor exists.
 */

type Tint = { bg: string; fg: string };

const GROUP_TINT: Record<Group, Tint> = {
  quiet: { bg: colors.mint, fg: colors.mintDeep },
  stories: { bg: colors.lilac, fg: colors.lilacDeep },
  learn: { bg: colors.sky, fg: colors.skyDeep },
  start: { bg: colors.butter, fg: colors.butterDeep },
};
const LOCAL_TINT: Tint = { bg: colors.peach, fg: colors.peachDeep };

type Picking = { kind: 'music' } | { kind: 'podcast'; then: Show | null };

export function ListenScreen() {
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

  const online = settings.listenDownload === 'on';
  const locale = phoneLocale();
  const cc = shelf ? pickCountry(shelf, locale, settings.podcastCountry) : null;
  const local = shelf ? localShows(shelf, cc) : [];
  const today = new Date().toISOString().slice(0, 10);
  const offers = shelf && !settings.offersHidden ? offersFor(shelf.offers, cc, today) : [];
  const localFirst = local.length > 0 && parseLocale(locale).lang !== 'en';
  const fresh = useMemo(() => (shelf ? freshEpisodes([...local, ...shelf.curated], today, usual) : []), [shelf, cc, usual, today]);
  const podcastApp = PODCAST_APPS.find((a) => a.key === settings.podcastApp) ?? null;
  // "Open in Spotify" on the buttons; the share option just says "Open".
  const podcastLabel = podcastApp && podcastApp.key !== 'share' ? short(podcastApp.label) : null;
  const tintOf = (show: Show): Tint => {
    const g = shelf?.curated.find((c) => c.id === show.id)?.groups?.[0];
    return g ? GROUP_TINT[g] : LOCAL_TINT;
  };

  async function open(show: Show, app: PodcastApp | null) {
    if (!app) {
      setPicking({ kind: 'podcast', then: show });
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

  const localRail = local.length ? (
    <Rail
      title={`Near you ${flag(cc)}`}
      hint="Running podcasts people listen to where you are, still publishing this season."
      action={{ label: 'Change country', onPress: () => setCountries(true) }}
      shows={local}
      tint={LOCAL_TINT}
      online={online}
      onOpen={(s) => setDetail({ show: s, tint: LOCAL_TINT })}
    />
  ) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.h1}>Listen</Text>
        <Text style={styles.lede}>Voices to take with you. Nobody here will ask you anything.</Text>
      </View>

      <View style={styles.sound}>
        <Text style={styles.soundEyebrow}>Your sound</Text>
        <View style={styles.rowGap}>
          <AppTile
            kind="music"
            label="Music"
            value={appByKey(settings.musicApp)?.name ?? "Phone's default"}
            onPress={() => setPicking({ kind: 'music' })}
          />
          <AppTile kind="podcast" label="Podcasts" value={podcastApp ? short(podcastApp.label) : 'Ask each time'} onPress={() => setPicking({ kind: 'podcast', then: null })} />
        </View>
        <View style={styles.stripHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.soundTitle}>On the run screen</Text>
            <Text style={styles.soundHint}>
              {canControl
                ? 'Previous, play and next reach whatever is playing, like headphone buttons. Try it here.'
                : 'A button that opens your music app. The lock screen and Control Center do the rest.'}
            </Text>
          </View>
          <Switch
            value={settings.musicStrip}
            onValueChange={(v) => update({ musicStrip: v })}
            trackColor={{ true: colors.lilac, false: 'rgba(246,241,234,0.2)' }}
            thumbColor={settings.musicStrip ? colors.cream : colors.onInkMuted}
            accessibilityLabel="Music strip on the run screen"
          />
        </View>
        {settings.musicStrip ? <MusicStrip appKey={settings.musicApp} /> : null}
        <Text style={styles.soundHint}>Voice cues lower your music for a moment instead of talking over it. No logins, nothing read from your apps.</Text>
      </View>

      {settings.listenDownload === 'ask' ? (
        <View style={[styles.card, { backgroundColor: colors.butter }]}>
          <Text style={styles.cardTitle}>Get today's episodes and covers?</Text>
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

      {fresh.length ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHead
            title="New for your run"
            hint={usual ? `Out this week. The ones close to your usual ${usual} minutes come first.` : 'Out this week, newest first.'}
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
                appLabel={podcastLabel}
                onOpen={() => open(f.show, settings.podcastApp)}
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
        <Pressable onPress={() => setCountries(true)} accessibilityRole="button">
          <Text style={styles.link}>Pick a country for local shows ›</Text>
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

      <ShowSheet
        item={detail}
        usual={usual}
        today={today}
        online={online}
        appLabel={podcastLabel}
        onClose={() => setDetail(null)}
        onOpen={(app) => {
          const show = detail?.show;
          setDetail(null);
          if (show) open(show, app);
        }}
      />
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
          update({ podcastApp: app });
          setPicking(null);
          if (show && app) open(show, app);
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

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.headRow}>
        <Text style={styles.h2}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
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
            accessibilityLabel={`${s.name}, by ${s.by}`}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
          >
            <Cover show={s} size={TILE} tint={tint} online={online} />
            <Text style={styles.tileName} numberOfLines={2}>
              {s.name}
            </Text>
            <Text style={styles.tileBy} numberOfLines={1}>
              {s.latest[0]?.min ? `${s.latest[0].min} min · ` : ''}
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
  appLabel,
  onOpen,
  onMore,
}: {
  item: Fresh;
  width: number;
  today: string;
  tint: Tint;
  online: boolean;
  appLabel: string | null;
  onOpen: () => void;
  onMore: () => void;
}) {
  const { show, ep, fits } = item;
  return (
    <Pressable onPress={onMore} accessibilityRole="button" style={[styles.epCard, { width, backgroundColor: tint.bg }]}>
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
        <Text style={[styles.epMeta, { color: tint.fg }]}>
          {ep.min ? `${ep.min} min · ` : ''}
          {whenLabel(ep.date, today)}
        </Text>
        {fits ? (
          <View style={styles.fits}>
            <Text style={styles.fitsText}>Fits your run</Text>
          </View>
        ) : null}
      </View>
      <PlayButton label={appLabel ? `Open in ${appLabel}` : 'Open'} onPress={onOpen} wide />
    </Pressable>
  );
}

function ShowSheet({
  item,
  usual,
  today,
  online,
  appLabel,
  onClose,
  onOpen,
}: {
  item: { show: Show; tint: Tint } | null;
  usual: number | null;
  today: string;
  online: boolean;
  appLabel: string | null;
  onClose: () => void;
  onOpen: (app: PodcastApp | null) => void;
}) {
  const { settings } = useSettings();
  const show = item?.show;
  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {show && item ? (
          <Pressable style={[styles.sheet, { backgroundColor: item.tint.bg }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <View style={styles.epTop}>
              <Cover show={show} size={112} tint={item.tint} online={online} onTint />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sheetName}>{show.name}</Text>
                <Text style={[styles.showBy, { color: item.tint.fg }]}>
                  {show.by}
                  {show.since ? ` · since ${show.since}` : show.episodes ? ` · ${show.episodes} episodes` : ''}
                </Text>
              </View>
            </View>
            {show.why ? <Text style={styles.why}>{show.why}</Text> : null}
            {show.latest.length ? (
              <View style={styles.eps}>
                <Text style={[styles.epsLabel, { color: item.tint.fg }]}>Latest</Text>
                {show.latest.map((e) => (
                  <View key={e.title + e.date} style={{ gap: 2 }}>
                    <Text style={styles.epsTitle} numberOfLines={2}>
                      {e.title}
                    </Text>
                    <Text style={styles.showBy}>
                      {e.min ? `${e.min} min · ` : ''}
                      {whenLabel(e.date, today)}
                      {fitsRun(e.min, usual) ? ' · fits your usual run' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={[styles.rowGap, { alignItems: 'center' }]}>
              <PlayButton label={appLabel ? `Open in ${appLabel}` : 'Open'} onPress={() => onOpen(settings.podcastApp)} />
              {settings.podcastApp ? <Pill label="Another app" onPress={() => onOpen(null)} /> : null}
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
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
    <Modal visible={!!picking} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { maxHeight: '80%' }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.cardTitle}>{music ? 'Music from' : 'Podcasts in'}</Text>
          <Text style={styles.hint}>
            {music
              ? 'Opened from the run screen. Only the apps on this phone are listed.'
              : forShow
                ? 'Where should shows open? Remembered on this phone.'
                : 'Shows open there. Remembered on this phone.'}
          </Text>
          <ScrollView contentContainerStyle={{ gap: 6 }}>
            {music
              ? [{ key: null, name: "Phone's default" } as { key: string | null; name: string }, ...musicApps].map((a) => (
                  <SheetRow key={a.key ?? 'default'} label={a.name} on={musicApp === a.key} onPress={() => onMusic(a.key)} />
                ))
              : [
                  ...(forShow ? [] : [<SheetRow key="ask" label="Ask each time" on={podcastApp == null} onPress={() => onPodcast(null)} />]),
                  ...podcastApps.map((a) => (
                    <SheetRow key={a.key} label={a.label} note={a.here ? 'On this phone' : undefined} on={podcastApp === a.key} onPress={() => onPodcast(a.key)} />
                  )),
                ]}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetRow({ label, note, on, onPress }: { label: string; note?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.sheetRow, on && styles.sheetRowOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.sheetText, on && styles.sheetTextOn]}>{label}</Text>
      {note ? <Text style={[styles.sheetNote, on && { color: colors.onInkMuted }]}>{note}</Text> : null}
    </Pressable>
  );
}

function AppTile({ kind, label, value, onPress }: { kind: 'music' | 'podcast'; label: string; value: string; onPress: () => void }) {
  const tint = kind === 'music' ? { bg: colors.lilac, fg: colors.lilacDeep } : { bg: colors.butter, fg: colors.butterDeep };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      style={({ pressed }) => [styles.appTile, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]}
    >
      {kind === 'music' ? <NoteGlyph color={tint.fg} /> : <MicGlyph color={tint.fg} />}
      <Text style={[styles.appTileLabel, { color: tint.fg }]}>{label}</Text>
      <Text style={styles.appTileValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={[styles.appTileChange, { color: tint.fg }]}>Change ›</Text>
    </Pressable>
  );
}

const TILE = 132;

/** The show's cover, or its initials on the section's pastel when there's no cover. */
function Cover({ show, size, tint, online, onTint }: { show: Show; size: number; tint: Tint; online: boolean; onTint?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src: ImageSourcePropType | null = failed ? null : coverFor(show, online);
  const r = Math.round(size * 0.16);
  if (src) {
    return <Image source={src} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.white }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.art, { width: size, height: size, borderRadius: r, backgroundColor: onTint ? colors.white : tint.bg }]}>
      <Text style={[styles.artText, { color: tint.fg, fontSize: size * 0.32 }]}>{initials(show.name)}</Text>
    </View>
  );
}

function PlayButton({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.link}>‹ Listen</Text>
      </Pressable>
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
  bleed: { marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.text, flexShrink: 1 },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  headAction: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  footnote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  cardText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.white },
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
  play: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 16 },
  playText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },

  tile: { width: TILE, gap: 6 },
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
  epsTitle: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: colors.text },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,39,51,0.2)', marginTop: -8, marginBottom: 4 },

  pill: { borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.white },
  pillDark: { backgroundColor: colors.ink },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  pillTextDark: { color: colors.cream },
  kitRow: { paddingVertical: spacing.sm, alignItems: 'center' },
  kitText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  offer: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 3 },
  paid: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.peachDeep },
  code: { alignSelf: 'flex-start', fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 1, color: colors.butterDeep, backgroundColor: colors.butter, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(43,39,51,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  sheetRow: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sheetRowOn: { backgroundColor: colors.ink },
  sheetText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  sheetTextOn: { color: colors.cream },
  sheetNote: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
