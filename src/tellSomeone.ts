// Tell someone: before a run, a short message for a person you choose, sent
// from your own messaging app through the share sheet. "Out for a run near X,
// back by HH:MM", and a map link to where you start if you want. After Save
// run, one tap sends "I'm back". Off until switched on. No server, no account,
// no live tracking: Runtrovert never knows who you told.

import { ui } from './i18n/ui';
import { dateLocale } from './i18n/lang';
import type { LatLon } from './types';

export type Tell = {
  on: boolean;
  minutes: number;
  withPlace: boolean;
  /** The last "out for a run" message: when it was sent and the time it promised. */
  told: { at: number; backBy: number } | null;
  /** The run whose "I'm back" was sent or put aside, so the card doesn't come back. */
  backFor: number | null;
};

export const BACK_IN = [30, 45, 60, 90, 120];

export const NO_TELL: Tell = { on: false, minutes: 45, withPlace: false, told: null, backFor: null };

export function cleanTell(t: Partial<Tell> | null | undefined): Tell {
  return {
    on: t?.on === true,
    minutes: typeof t?.minutes === 'number' && t.minutes > 0 ? t.minutes : NO_TELL.minutes,
    withPlace: t?.withPlace === true,
    told: t?.told && typeof t.told.at === 'number' && typeof t.told.backBy === 'number' ? t.told : null,
    backFor: typeof t?.backFor === 'number' ? t.backFor : null,
  };
}

/** Rounded up to the next 5 minutes, so "back by" is a time people say. */
export function backBy(now: number, minutes: number): number {
  const t = now + minutes * 60_000;
  const step = 5 * 60_000;
  return Math.ceil(t / step) * step;
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

/** OpenStreetMap, no tracking parameters: just the point, to five decimals (about a metre). */
export function mapLink(p: LatLon): string {
  const lat = p.latitude.toFixed(5);
  const lon = p.longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

export function outMessage(near: string | null, back: number, start: LatLon | null): string {
  const lines = [ui().tellSomeone.msgOut(near?.trim() || null, clockTime(back))];
  if (start) lines.push(ui().tellSomeone.msgStart(mapLink(start)));
  return lines.join('\n');
}

/** "I'm back" belongs to the first run kept after the message, within twelve hours of it. */
export function wantsBack(t: Tell, run: { id: number; startedAt: number }): boolean {
  if (!t.told || t.backFor === run.id) return false;
  if (t.backFor != null && t.backFor > run.id) return false;
  return run.startedAt >= t.told.at - 15 * 60_000 && run.startedAt - t.told.at < 12 * 60 * 60_000;
}
