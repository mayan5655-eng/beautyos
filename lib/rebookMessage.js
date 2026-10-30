// lib/rebookMessage.js
//
// The WhatsApp message that goes with "קבעי לה שוב": she has just booked the next visit FOR the client, and this is
// the line that tells the client. Written in the cosmetician's own voice (first person, warm, feminine), with the same
// cancel link every booking confirmation carries. Pure: the route mints the links and reads the settings.
//
// It is only ever OFFERED to her (opened in her own WhatsApp, or kept in "הודעות מוכנות לשליחה"); nothing here sends.

import { lines, hebrewDate, timeRange, durationHe, mapsLink } from './messages.js';

/**
 * @param {object} p
 * @param {string} p.name
 * @param {string} p.businessName
 * @param {string} p.service
 * @param {string} p.date          YYYY-MM-DD
 * @param {number} p.startMinute
 * @param {number} p.duration
 * @param {string} [p.address]
 * @param {string} [p.arrivalNote]
 * @param {string} p.confirmUrl
 * @param {string} p.cancelUrl
 * @returns {string}
 */
export function rebookMessageText({ name, businessName, service, date, startMinute, duration, address, arrivalNote, confirmUrl, cancelUrl }) {
  const n = String(name || '').trim();
  const biz = String(businessName || '').trim();
  const addr = String(address || '').trim();
  const note = String(arrivalNote || '').trim();
  const dur = durationHe(duration);
  return lines(
    n ? `שלום ${n}! 🌸` : 'שלום! 🌸',
    biz ? `קבעתי לך את התור הבא ב${biz}:` : 'קבעתי לך את התור הבא:',
    '',
    dur ? `${service} · ${dur}` : service,
    `${hebrewDate(date)}, ${timeRange(startMinute, duration)}`,
    addr ? '' : null,
    addr ? `📍 ${addr}` : null,
    addr ? mapsLink(addr) : null,
    note ? '' : null,
    note || null,
    '',
    confirmUrl ? `אם זה מתאים לך, אפשר לאשר כאן: ${confirmUrl}` : null,
    cancelUrl ? `ואם משהו משתנה, אפשר לבטל או להזיז: ${cancelUrl}` : null,
    '',
    biz ? `מתרגשת לראות אותך,\n${biz}` : 'מתרגשת לראות אותך'
  );
}
