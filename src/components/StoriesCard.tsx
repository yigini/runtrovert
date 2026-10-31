import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { listRuns } from '../db';
import { useSettings } from '../settings';
import { storiesFor, type RouteStories } from '../storySource';
import type { StoryPt } from '../stories';
import { colors, fonts, radius, spacing } from '../theme';
import type { Mood } from '../types';
import { ui } from '../i18n/ui';

const OFFER_FROM_RUN = 3;
const WELCOME_BACK_MS = 10 * 24 * 3600 * 1000;

/**
 * Things you passed, for the finish screen: asked for once the run is over,
 * never during it, and only with the switch on. Nothing shows until there is
 * something to show; a run past nothing of note simply has no card.
 */
export function useRouteStories(points: StoryPt[]): RouteStories | null {
  const { settings } = useSettings();
  const [found, setFound] = useState<RouteStories | null>(null);
  const enough = points.length >= 2;
  useEffect(() => {
    setFound(null);
    if (!settings.stories || !enough) return;
    let alive = true;
    storiesFor(points, { dark: settings.storiesDark })
      .then((s) => alive && setFound(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settings.stories, settings.storiesDark, enough, points.length ? points[points.length - 1] : null]);
  return found;
}

/** Where to put the small dots on the finish map. */
export function storyPins(s: RouteStories | null): StoryPt[] {
  return s ? [...s.places.map((p) => p.at), ...s.streets.map((p) => p.at)] : [];
}

export function StoriesCard({ stories, moodBefore }: { stories: RouteStories | null; moodBefore: Mood | null }) {
  const { settings } = useSettings();
  if (!settings.stories) return <StoriesOffer moodBefore={moodBefore} />;
  if (!stories) return null;
  return <Found stories={stories} />;
}

function Found({ stories }: { stories: RouteStories }) {
  const [open, setOpen] = useState(false);
  const n = stories.places.length + stories.streets.length;
  if (!n) return null;
  const t = ui().stories;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint={t.opensWhatWasAlong} style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}>
        <Text style={styles.title}>{t.thingsYouPassed(n)}</Text>
        <Text style={styles.chev} importantForAccessibility="no">{open ? '−' : '+'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: spacing.md }}>
          {stories.places.map((p) => (
            <View key={p.pageid} style={styles.item}>
              <Text style={styles.name}>{p.title}</Text>
              <Text style={styles.text}>{p.text}</Text>
              <Text style={styles.link} onPress={() => void Linking.openURL(p.url)} accessibilityRole="link">
                {t.readOnWikipedia}
              </Text>
            </View>
          ))}
          {stories.streets.map((s) => (
            <View key={s.qid + s.name} style={styles.item}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.text}>{t.namedAfter(s.who, s.about ?? '')}</Text>
              <Text style={styles.link} onPress={() => void Linking.openURL(s.url)} accessibilityRole="link">
                {t.moreOnWikidata}
              </Text>
            </View>
          ))}
          {stories.places.length > 0 && stories.wiki === 'en' && <Text style={styles.credit}>{t.fromEnglishWikipedia}</Text>}
          <Text style={styles.credit}>{t.credits}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * One quiet offer, ever: on the third finish screen or later, not after a
 * drained start or a long break. Spent only once the runner answers it, so
 * an offer scrolled past unseen comes back on a later finish screen.
 */
function StoriesOffer({ moodBefore }: { moodBefore: Mood | null }) {
  const { settings, update } = useSettings();
  const [show, setShow] = useState(false);
  const tired = moodBefore != null && moodBefore <= 2;
  useEffect(() => {
    if (settings.storiesOffered || tired) return;
    let alive = true;
    listRuns()
      .then((runs) => {
        // The run on screen is not saved yet, so it counts as one more.
        const last = Math.max(0, ...runs.map((r) => r.startedAt));
        const back = runs.length > 0 && Date.now() - last > WELCOME_BACK_MS;
        if (!alive || runs.length + 1 < OFFER_FROM_RUN || back) return;
        setShow(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const t = ui().stories;
  if (!show) return null;
  return (
    <View style={styles.offer}>
      <Text style={styles.text}>{t.curiousWhatYouRanPast}</Text>
      <View style={styles.offerRow}>
        <Pressable onPress={() => update({ stories: true, storiesOffered: true })} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.yes, pressed && { opacity: 0.85 }]}>
          <Text style={styles.yesText}>{t.showMe}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setShow(false);
            update({ storiesOffered: true });
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.notNow}>{t.notNow}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: colors.butter, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.butterDeep },
  chev: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.butterDeep, paddingHorizontal: spacing.xs },
  item: { gap: 2 },
  name: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  link: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 19, color: colors.butterDeep, textDecorationLine: 'underline' },
  credit: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.inkMuted },
  offer: { borderTopWidth: 1, borderTopColor: '#e4dccf', paddingTop: 12, gap: 8 },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  yes: { backgroundColor: colors.butter, borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center' },
  yesText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.butterDeep },
  notNow: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.inkSoft, textDecorationLine: 'underline' },
});
