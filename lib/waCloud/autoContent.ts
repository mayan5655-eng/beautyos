// lib/waCloud/autoContent.ts
//
// What the automatic messages say: the four template parameters (lib/waCloud/autoTemplates.ts), and the plain-text
// reminder that waits in her manual send queue when the automatic one is refused (a ceiling, the client asked to stop,
// Meta's error). The queue text is the daily reminder's (lib/reminders/dailyReminders.js), links included, so the
// fallback reads exactly like the message she already sends by hand.

import { greet, lines, hebrewDate, timeRange, durationHe, mapsLink } from '../messages.js';
import { startMinute } from '../apptTime.ts';

export type ApptLike = { id: string; name?: string | null; service?: string | null; date: string; start_minute?: number | null; hour?: number | null; duration?: number | null };
export type SettingsLike = { business_name?: string | null; branding?: unknown } | null | undefined;

export function businessNameOf(s: SettingsLike): string {
  return String(s?.business_name || '').trim() || 'העסק';
}

/** [client name, business name, service and duration, day date and time] */
export function autoParams(appt: ApptLike, settings: SettingsLike): string[] {
  const durationText = durationHe(appt.duration);
  const service = String(appt.service || '').trim() || 'התור שלך';
  const sm = startMinute(appt);
  return [
    String(appt.name || '').trim() || 'יקרה',
    businessNameOf(settings),
    durationText ? `${service} · ${durationText}` : service,
    sm === null ? hebrewDate(appt.date) : `${hebrewDate(appt.date)}, ${timeRange(sm, appt.duration)}`,
  ];
}

/** The reminder as it waits in her manual queue. */
export function reminderQueueText(appt: ApptLike, settings: SettingsLike, links: { confirmUrl: string; cancelUrl: string }): string {
  const brand = settings?.branding && typeof settings.branding === 'object' ? (settings.branding as Record<string, unknown>) : {};
  const address = String(brand.public_address || brand.address || '').trim();
  const arrivalNote = String(brand.arrival_note || '').trim();
  const [, business, service, when] = autoParams(appt, settings);
  return lines(
    greet(appt.name),
    `תזכורת לתור שלך ב${business}.`,
    '',
    service,
    when,
    address ? '' : null,
    address ? `📍 ${address}` : null,
    address ? mapsLink(address) : null,
    arrivalNote ? '' : null,
    arrivalNote || null,
    '',
    `לאישור: ${links.confirmUrl}`,
    `אם צריך לבטל, אפשר כאן: ${links.cancelUrl}`,
  );
}

/** The booking confirmation as it waits in her manual queue (only when the automatic one was refused). */
export function bookingQueueText(appt: ApptLike, settings: SettingsLike, cancelUrl: string): string {
  const [name, business, service, when] = autoParams(appt, settings);
  return lines(
    `שלום ${name}! 🌸`,
    `התור שלך ב${business} נקבע.`,
    '',
    service,
    when,
    '',
    `אם משהו משתנה, אפשר לבטל כאן: ${cancelUrl}`,
    '',
    `להתראות,\n${business}`,
  );
}
