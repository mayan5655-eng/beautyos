// lib/marketingConsent.js
//
// Marketing consent and opt-out for CLIENTS (Israeli communications law, section 30A: promotional messages need prior consent and every
// message must say how to be removed). Marketing here is sent by hand through wa.me links, so the app cannot read a "הסר" reply - she records
// the opt-out herself on the client card ("ביקשה הסרה מדיוור").
//
// The columns (supabase/migrations/add_marketing_consent.sql):
//   marketing_consent         boolean  true only after an explicit yes (booking-page checkbox, or she marked it by hand)
//   marketing_consent_at      timestamptz  when
//   marketing_consent_source  text    'booking_page' | 'manual'
//   marketing_opted_out_at    timestamptz  when she was asked to stop; wins over consent until a NEW explicit yes arrives
//
// FAILS CLOSED: a client row without these fields (the migration has not run, or an old row) is NOT marketable. Nothing here ever turns a
// missing value into "yes".
//
// What is NOT marketing and must never be filtered with this: reminders, booking confirmations, payment confirmations / receipts, the skin
// report she asked for, and a slot offer to someone who asked to be on the waitlist.

export const MARKETING_FOOTER = "להסרה מרשימת התפוצה השיבי הסר";

/** May this client receive a promotional message? Consent given, and not opted out since. */
export function canMarket(client) {
  if (!client) return false;
  if (client.marketing_consent !== true) return false;
  if (client.marketing_opted_out_at) return false;
  return true;
}

/** "consent" | "opted_out" | "none" - for the client card. Opt-out wins. */
export function marketingStatus(client) {
  if (client?.marketing_opted_out_at) return "opted_out";
  if (client?.marketing_consent === true) return "consent";
  return "none";
}

/** Adds the removal line once. Safe to call on text that already has it. */
export function withMarketingFooter(text) {
  const t = String(text ?? "").replace(/\s+$/, "");
  if (t.includes(MARKETING_FOOTER)) return t;
  return `${t}\n\n${MARKETING_FOOTER}`;
}

/** The fields to write for an explicit yes. `source` is 'booking_page' or 'manual'. A new yes clears an earlier opt-out. */
export function consentFields(source, nowIso = new Date().toISOString()) {
  return { marketing_consent: true, marketing_consent_at: nowIso, marketing_consent_source: source, marketing_opted_out_at: null };
}

/** The fields to write when she is asked to stop. Consent history is kept; the opt-out date is what blocks sending. */
export function optOutFields(nowIso = new Date().toISOString()) {
  return { marketing_opted_out_at: nowIso };
}
