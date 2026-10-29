// Interface text. ui() returns the strings for the current language; English is the
// source and the fallback, and every other language is typed against it.
import { lang, type Lang } from '../lang';
import { en, type Strings } from './en';

const UI: Partial<Record<Lang, Strings>> = { en };

export function ui(): Strings {
  return UI[lang()] ?? en;
}

export type { Strings };
