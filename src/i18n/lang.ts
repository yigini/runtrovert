// Which language the app speaks, and the small bits of grammar every language
// needs: plural forms, decimal commas, capitals. Everything is on the phone; no
// translation service, no download. Pure, so it runs under plain Node.

export type Lang = 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'tr' | 'ja';

/** In the order Settings lists them, each named in its own language. */
export const LANGS: Array<{ code: Lang; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português (Brasil)' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ja', name: '日本語' },
];

/** The phone's locale, e.g. "de-AT". Hermes and Node both answer this without a native module. */
export function phoneLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

/** The language for a locale, English when we don't speak it. Portugal gets Brazilian Portuguese. */
export function langFor(locale: string): Lang {
  const code = locale.replace('_', '-').split('-')[0].toLowerCase();
  return (LANGS.some((l) => l.code === code) ? code : 'en') as Lang;
}

/** Swiss German writes ss, never ß. */
export function isSwiss(locale: string): boolean {
  return /^de[-_]CH/i.test(locale) || /^de[-_]LI/i.test(locale);
}

let current: Lang = langFor(phoneLocale());
let swiss = isSwiss(phoneLocale());
const listeners = new Set<(l: Lang) => void>();

export function lang(): Lang {
  return current;
}

/** null follows the phone. */
export function setLang(choice: Lang | null): void {
  const next = choice ?? langFor(phoneLocale());
  swiss = next === 'de' && isSwiss(phoneLocale());
  if (next === current) return;
  current = next;
  for (const l of listeners) l(next);
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Last touch on any text shown: Swiss German swaps ß for ss; French puts a
 * thin no-break space before ? ! : ; and %, and inside « ».
 */
export function finish(s: string, l: Lang = current): string {
  if (swiss && l === 'de') return s.replace(/ß/g, 'ss');
  if (l === 'fr') return s.replace(/ ([?!:;%»])/g, '\u202f$1').replace(/« /g, '«\u202f');
  return s;
}

export type PluralForm = 'one' | 'other';

/**
 * Plural form for a count. All eight languages only need two forms: French and
 * Brazilian Portuguese count 0 and 1 as singular, Turkish and Japanese keep
 * the noun singular after any number, so callers just use the same word twice.
 */
export function plural(n: number, l: Lang = current): PluralForm {
  const i = Math.abs(Math.trunc(n));
  if (l === 'fr' || l === 'pt') return i <= 1 && Number.isInteger(n) ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

/** "1 minute", "2 minutes"; `many` defaults to `one` for languages without plurals. */
export function count(n: number, one: string, many = one, l: Lang = current): string {
  return `${n} ${plural(n, l) === 'one' ? one : many}`;
}

/** Decimal point or comma, as the language writes it. Japanese and English use a point. */
export function decimal(s: string, l: Lang = current): string {
  return l === 'en' || l === 'ja' ? s : s.replace('.', ',');
}

/** Upper-case the first letter, with Turkish dotted İ. */
export function upperFirst(s: string, l: Lang = current): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase(l === 'tr' ? 'tr' : undefined) + s.slice(1);
}

/** For tests and previews: run `fn` as if the app spoke `l`. */
export function withLang<T>(l: Lang, fn: () => T): T {
  const was = current;
  const wasSwiss = swiss;
  current = l;
  swiss = false;
  try {
    return fn();
  } finally {
    current = was;
    swiss = wasSwiss;
  }
}

/** "Tuesday" / "Dienstag" / "Salı", from the phone's own calendar data. */
export function weekdayName(ms: number, l: Lang = current): string {
  try {
    return new Date(ms).toLocaleDateString(l === 'pt' ? 'pt-BR' : l, { weekday: 'long' });
  } catch {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(ms).getDay()];
  }
}

/** "October" / "Oktober" / "Ekim". */
export function monthName(ms: number, l: Lang = current): string {
  try {
    return new Date(ms).toLocaleDateString(l === 'pt' ? 'pt-BR' : l, { month: 'long' });
  } catch {
    return String(new Date(ms).getMonth() + 1);
  }
}
