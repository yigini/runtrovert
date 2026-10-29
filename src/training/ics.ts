// A plan as an iCalendar file: one all-day event per session, so any calendar
// app can show the week. No calendar permission needed; the file is shared.

import type { Plan, Session } from './types';

function ymd(day: number): string {
  const d = new Date(day);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 folds lines at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = utf8Len(ch);
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function utf8Len(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

function event(plan: Plan, s: Session, now: number): string[] {
  const next = new Date(s.date);
  next.setDate(next.getDate() + 1);
  const title = s.kind === 'strength' ? `Runtrovert: ${s.title} (optional)` : `Runtrovert: ${s.title}`;
  const desc = `${s.summary}\n\n${s.why}\n\n${plan.name}, week ${s.id.match(/^w(\d+)/)?.[1] ?? ''}.`;
  return [
    'BEGIN:VEVENT',
    `UID:runtrovert-plan${plan.id}-${s.id}@local`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(s.date)}`,
    `DTEND;VALUE=DATE:${ymd(next.getTime())}`,
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(desc)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function planToIcs(plan: Plan, now = Date.now()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Runtrovert//Training plan//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(`Runtrovert · ${plan.name}`)}`];
  for (const w of plan.weeks) for (const s of w.sessions) if (!s.skipped) lines.push(...event(plan, s, now));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
