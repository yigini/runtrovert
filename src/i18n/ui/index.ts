// Interface text. ui() returns the strings for the current language; English is the
// source and the fallback, and every other language is typed against it.
import { lang, type Lang } from '../lang';
import { en, type Strings } from './en';

const UI: Partial<Record<Lang, Strings>> = { en };

export function ui(): Strings {
  return UI[lang()] ?? en;
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
