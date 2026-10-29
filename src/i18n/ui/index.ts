// Interface text. ui() returns the strings for the current language; English is the
// source and the fallback, and every other language is typed against it.
import { finish, lang, type Lang } from '../lang';
import { de } from './de';
import { fr } from './fr';
import { en, type Strings } from './en';
import { es } from './es';
import { it } from './it';
import { pt } from './pt';

/** Every interface language. A language listed in SHIPPED (lang.ts) must be here. */
export const UI: Partial<Record<Lang, Strings>> = { en, de, fr, es, pt, it };

export function ui(): Strings {
  const l = lang();
  const s = UI[l] ?? en;
  // French spacing before ?!:; and Swiss German ss go through finish(), as the voice does.
  if (l !== 'fr' && l !== 'de') return s;
  const key = `${l}:${finish('ß', l)}`;
  if (polished?.key !== key) polished = { key, value: polish(s, l) };
  return polished.value;
}

let polished: { key: string; value: Strings } | null = null;

function polish<T>(x: T, l: Lang): T {
  if (typeof x === 'string') return finish(x, l) as T;
  if (typeof x === 'function') return ((...args: unknown[]) => polish((x as (...a: unknown[]) => unknown)(...args), l)) as T;
  if (Array.isArray(x)) return x.map((v) => polish(v, l)) as T;
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, polish(v, l)])) as T;
  return x;
}

/**
 * For tables built once at module level (labels, options, the plan catalogue):
 * the constant keeps its name and shape, but reads through to a copy made in the
 * current language, rebuilt only when the language changes. Every language must
 * give the table the same keys and length.
 */
export function live<T extends object>(make: () => T): T {
  let made: { lang: Lang; value: T } | null = null;
  const current = (): T => {
    const l = lang();
    if (!made || made.lang !== l) made = { lang: l, value: make() };
    return made.value;
  };
  const target = current();
  return new Proxy(target, {
    get: (_t, k) => {
      const v = current();
      const out = Reflect.get(v, k, v);
      return typeof out === 'function' && Array.isArray(v) ? out.bind(v) : out;
    },
    has: (_t, k) => Reflect.has(current(), k),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, k) => Reflect.getOwnPropertyDescriptor(current(), k),
  });
}

export type { Strings };
