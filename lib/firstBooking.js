// lib/firstBooking.js
//
// "3 צעדים לתור הראשון": the focused card a new business sees on the Today
// screen until her first booking is possible. Pure logic only; the card is
// app/FirstBookingCard.jsx and the wiring is in app/beautyos.jsx.
//
// Why it exists (2026-11 activation pass): the one real signup added her
// treatments and then stopped before adding a single client. The Today screen
// offered her a welcome card, an 8-step "הגדרת המערכת" checklist with no
// client step at all, a day-1 trial nudge and the tour, all at once. This
// card is the one thing to do first; the 8-step checklist comes back on Today
// once these three are done (see the "not two checklists" rule in
// firstBookingView below).
//
// What "done" means, and nothing more than that:
//   services  at least one ACTIVE treatment (active !== false, the same test
//             as activeServices in app/beautyos.jsx and the booking page)
//   clients   at least one client row
//   link      she copied or shared the booking link (the same three signals
//             the 8-step checklist's "link" step already reads: this device's
//             kl_link_shared_<tenant>, automations.link_shared_at on her
//             account, or any appointment at all)
//
// Hidden for good: once all three are done and she has seen the short
// completion line, automations.first_booking_steps.done_at is written to her
// settings (and a copy to localStorage, so a write that did not land, e.g. on
// the demo tenant, still hides it on this phone).

/** The card is on unless her account switches it off: automations.feature_flags.first_booking_card === false. */
export function firstBookingCardEnabled(automations) {
  const flags = automations && typeof automations === 'object' ? automations.feature_flags : null;
  return !(flags && typeof flags === 'object' && flags.first_booking_card === false);
}

export const FIRST_BOOKING_KEY = 'first_booking_steps';
export const firstBookingStorageKey = (tenantId) => `kl_first3_${tenantId || 'x'}`;

/** The three steps, in order, each with its done state. */
export function firstBookingSteps({ services = [], clients = [], appointments = [], linkShared = false, linkSharedAt = null } = {}) {
  const activeCount = (services || []).filter((s) => s && s.active !== false).length;
  const clientCount = (clients || []).length;
  const apptCount = (appointments || []).length;
  return [
    { key: 'services', done: activeCount > 0, count: activeCount },
    { key: 'clients', done: clientCount > 0, count: clientCount },
    { key: 'link', done: !!linkShared || !!linkSharedAt || apptCount > 0 },
  ];
}

/** Merge what her account says with what this phone remembers. Either one having done_at is enough. */
export function firstBookingRecord(automations, local) {
  const acct = automations && typeof automations === 'object' && automations[FIRST_BOOKING_KEY] && typeof automations[FIRST_BOOKING_KEY] === 'object'
    ? automations[FIRST_BOOKING_KEY] : {};
  const here = local && typeof local === 'object' ? local : {};
  return { shown_at: acct.shown_at || here.shown_at || null, done_at: acct.done_at || here.done_at || null };
}

/**
 * What the Today screen shows:
 *   'off'        the flag is off: the old welcome card and 8-step checklist, exactly as before
 *   'hidden'     nothing from this card (finished earlier, or a business that never needed it)
 *   'active'     the card, with its progress line
 *   'celebrate'  all three just became done while she was using the card: the completion line, once
 *
 * The 8-step checklist is shown on Today only when this is 'off' or 'hidden' (showSetupOnToday),
 * so the two never compete on one screen.
 */
export function firstBookingView({ enabled = true, steps, record, appointments = [] }) {
  if (!enabled) return 'off';
  const rec = record || {};
  if (rec.done_at) return 'hidden';
  const all = steps.every((s) => s.done);
  if (all) return rec.shown_at ? 'celebrate' : 'hidden';
  // A business that already has bookings and never saw this card is past "the first booking": do not start it now.
  if (!rec.shown_at && (appointments || []).length > 0) return 'hidden';
  return 'active';
}

/** "2 מתוך 3" */
export function firstBookingProgress(steps) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, line: `${done} מתוך ${steps.length}` };
}

/** Whether the 8-step "הגדרת המערכת" card may show on Today. Never next to the 3-step card. */
export function showSetupOnToday(view, setupDone, setupTotal) {
  if (view === 'active' || view === 'celebrate') return false;
  return setupDone < setupTotal;
}

/** The message her WhatsApp opens with, written as her to her client. The link is glued to the end of its own line. */
export function firstLinkMessage(url, businessName) {
  const name = String(businessName || '').trim();
  return `היי! 🌸 אפשר לקבוע אצלי תור${name && name !== 'העסק שלי' ? ` ב${name}` : ''} כאן, בכמה לחיצות:\n${url}`;
}
