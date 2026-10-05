// lib/ai/capMessages.ts
//
// What a cosmetician reads when her AI allowance is nearly used, used, or
// cannot be checked. One place, so the wording is the same on every screen and
// can be reviewed as a set.
//
// The rule, from the person who pays the bill and the person who reads these:
// she must never meet a limit by surprise, and a limit must never read as a
// scolding. So: she is told BEFORE she is stopped ("נשארו 3 ... הן מתחדשות
// בראשון לחודש"), and when she is stopped the sentence says when it comes back,
// in the form she can plan around - "הן מתחדשות בראשון לחודש" - and that
// everything else keeps working. Never "הגעת לתקרה", never a bare used/limit
// pair. Feminine forms throughout; the nouns are all feminine plural so the
// "הן" agrees.
//
// An allowance that could not be READ is a different sentence on purpose: it
// must not claim she used anything. Nothing is wrong with her month; our
// counter is, and we say we paused rather than guess.

import type { Allowance } from './callCaps.ts';

/** Feminine plural nouns, each "the ___ of the month", keyed by call site. */
const NOUN: Record<string, string> = {
  'advisor': 'השאלות לעוזרת החכמה',
  'voice-intent': 'הפקודות הקוליות',
  'marketing/groups': 'ההצעות לקבוצות',
  'marketing/reel': 'יצירות הוידאו',
  'marketing/shooting-list': 'רשימות הצילום',
  'creatives/direct': 'ההשלמות של ה-AI',
  'creatives/image': 'תמונות ה-AI',
  'creatives/test-image': 'תמונות הבדיקה',
  'designs/generate': 'היצירות החכמות',
  'designs/generate-image': 'תמונות ה-AI',
  'leads/map-headers': 'התאמות העמודות',
  'score-lead': 'הערכות הלידים',
  'whatsapp-webhook': 'תשובות הבוט',
  'skin-scan': 'סריקות העור',
};

export const RENEWS_HE = 'בראשון לחודש';

/** The heads-up trackedCreate left on a message (see lib/ai/usage.ts), as a spreadable response fragment. */
export function capNoticeOf(message: unknown): { capNotice?: string } {
  const n = (message as { capNotice?: unknown } | null)?.capNotice;
  return typeof n === 'string' && n ? { capNotice: n } : {};
}

export function nounFor(callSite: string): string {
  return NOUN[callSite] || 'בקשות ה-AI';
}

export type RefusalReason = 'calls' | 'dollars' | 'unreadable';

export function capRefusalHe(reason: RefusalReason, callSite: string): string {
  if (reason === 'unreadable') {
    return 'לא הצלחנו לבדוק כרגע כמה נשאר לך מה-AI של החודש, אז עצרנו לרגע כדי לא להפתיע אותך 🌸 נסי שוב בעוד כמה דקות.';
  }
  if (reason === 'dollars') {
    return `השימוש ב-AI החודש היה גדול במיוחד, אז אנחנו עוצרות כאן עד סוף החודש 🌸 הכול מתחדש ${RENEWS_HE}, וכל השאר במערכת ממשיך לעבוד כרגיל. אם חשוב לך להמשיך עכשיו, כתבי לנו.`;
  }
  return `ניצלנו כבר את ${nounFor(callSite)} של החודש 🌸 הן מתחדשות ${RENEWS_HE}, ועד אז כל השאר במערכת ממשיך לעבוד כרגיל.`;
}

/** A warm heads-up when she is close, or null when she is not. */
export function capNoticeHe(a: Allowance): string | null {
  if (!a.near) return null;
  if (a.nearWhat === 'calls' && a.callsCap !== null) {
    const left = Math.max(0, a.callsCap - a.callsUsed);
    return `נשארו ${left} ${nounFor(a.callSite)} החודש 🌸 הן מתחדשות ${RENEWS_HE}.`;
  }
  return `השתמשנו כבר ברוב ה-AI שכלול החודש 🌸 הוא מתחדש ${RENEWS_HE} - כדאי לשמור אותו למה שהכי חשוב לך.`;
}
