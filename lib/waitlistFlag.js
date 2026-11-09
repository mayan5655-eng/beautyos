// lib/waitlistFlag.js
//
// Is the smart waitlist (lib/waitlistOffers.js) on for this business? Tiny and import-free so the browser bundle can use it
// (the app's own cancel, Settings) without pulling the server code in.
//
// ON BY DEFAULT since 2026-11-09 (owner rule: new automations default on, behind a platform flag and her own switch):
//   automations.feature_flags.waitlist_offers === false   (or the settings.feature_flags column)  the platform switch, set by SQL;
//                                                          the settings save never takes feature_flags from the browser.
//   automations.waitlist_offers === false                  HER switch, Settings > הודעות > "הצעה אוטומטית לרשימת ההמתנה".
// Anything else, including nothing stored at all, is on.

export const WAITLIST_FLAG = 'waitlist_offers';
/** Offers per business per 24 hours unless she chose another cap (Settings). */
export const DEFAULT_DAILY_CAP = 6;

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function flagsOf(settings) {
  const a = asObj(settings?.automations);
  return { ...asObj(a.screens), ...asObj(a.feature_flags), ...asObj(settings?.feature_flags) };
}

/** The platform has not switched the feature off for this business (the switch is shown). */
export function waitlistOffersVisible(settings) {
  return flagsOf(settings)[WAITLIST_FLAG] !== false;
}

const joinNames = (names) => {
  const n = (names || []).filter(Boolean);
  if (n.length <= 1) return n[0] || '';
  return `${n.slice(0, -1).join(', ')} ול${n[n.length - 1]}`;
};

/**
 * One line for her after she cancels, from what /api/waitlist/offer answered (lib/waitlistOffers.js offerFreedSlot). Never says
 * "sent" for a queued offer. null when there is nothing worth saying (nobody fits, the switch is off, the slot is taken again).
 * @returns {{ text: string, kind: 'success'|'info' } | null}
 */
export function waitlistOfferToast(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.status === 'offered') {
    const sent = Number(r.counts?.sent) || 0;
    const queued = Number(r.counts?.queued) || 0;
    const who = joinNames(r.names);
    if (sent && !queued) return { text: `הצענו את התור שהתפנה ל${who || (sent === 1 ? 'אחת מרשימת ההמתנה' : `-${sent} מרשימת ההמתנה`)}. הראשונה שתלחץ מקבלת אותו.`, kind: 'success' };
    if (queued && !sent) return { text: `ההצעה לתור שהתפנה${who ? ` (ל${who})` : ''} מחכה ב"הודעות מוכנות לשליחה". כדאי לשלוח עכשיו.`, kind: 'info' };
    return { text: `הצענו את התור שהתפנה ל${who || 'רשימת ההמתנה'}. חלק מההצעות מחכות ב"הודעות מוכנות לשליחה".`, kind: 'info' };
  }
  if (r.status === 'quiet_hours') return { text: 'יש מרשימת ההמתנה מי שמתאימה לתור שהתפנה. בלילה ובשבת לא שולחים, אפשר להציע לה בבוקר מהיומן.', kind: 'info' };
  if (r.status === 'daily_cap') return { text: 'יש מרשימת ההמתנה מי שמתאימה, אבל הגעת לתקרת ההצעות היומית. אפשר להציע ידנית מהיומן.', kind: 'info' };
  return null;
}

/** The feature is on: the platform flag not off and her own switch not off. */
export function waitlistOffersOn(settings) {
  return waitlistOffersVisible(settings) && asObj(settings?.automations).waitlist_offers !== false;
}
