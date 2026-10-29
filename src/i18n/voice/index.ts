// The voice for the language the app is speaking now.

import { finish, lang, type Lang } from '../lang';
import { TIPS, tipsByTopic, type Tip, type TipTopic } from '../../tips';
import { en } from './en';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { tr } from './tr';
import type { VoicePack } from './types';

export const PACKS: Partial<Record<Lang, VoicePack>> = { en, de, es, fr, tr };

export function voice(): VoicePack {
  return PACKS[lang()] ?? en;
}

export type { VoicePack } from './types';

/** The tips in the app's language, same ids as English. A tip a language leaves out is not shown. */
export function localTips(): Tip[] {
  const v = voice().tips;
  return TIPS.filter((t) => v.text[t.id]).map((t) => ({ ...t, text: finish(v.text[t.id]) }));
}

export function localTipsByTopic(): Array<{ key: TipTopic; title: string; tips: Tip[] }> {
  const v = voice().tips;
  return tipsByTopic(localTips()).map((g) => ({ ...g, title: finish(v.topics[g.key]) }));
}
