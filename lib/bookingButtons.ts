// lib/bookingButtons.ts
//
// "כפתור קביעת תור באינסטגרם ובגוגל": the guided setup in Settings > הדף שלי (app/BookingButtonsCard.jsx) that gets her booking
// link into the four places clients look for her. These are LINKS she pastes herself, not API connections: Kalmea changes
// nothing in her Instagram, Google, Facebook or WhatsApp accounts, and the copy says so.
//
// Each link carries ?src=<channel> (lib/bookingSource.ts), so a booking that came through it is counted under that channel in
// the source report. The "סימנתי שעשיתי" ticks live in settings.automations.booking_buttons ({ instagram: '<iso date>', ... }),
// written through /api/settings/save like every other automations key (no migration).
//
// Menu names were checked against the platforms' own help and partner guides on 2026-11-05. They differ between app versions
// and countries, so the steps name the menu where it is stable and describe it ("under the profile's edit screen") where it is
// not, and every platform has a fallback for when the option is missing. Copy rules: feminine, no dashes (a test checks).

import { withSource, SOURCE_CHANNELS, type SourceChannel } from './bookingSource.ts';

export type BookingPlatform = {
  key: 'instagram' | 'google' | 'facebook' | 'whatsapp';
  src: SourceChannel;
  name: string;
  where: string;      // one line under the name: where the link ends up
  steps: string[];    // 3 to 5
  note?: string;      // the honest caveat
};

export const BOOKING_PLATFORMS: BookingPlatform[] = [
  {
    key: 'instagram', src: 'instagram', name: 'אינסטגרם', where: 'קישור בביו, מתחת לשם שלך בפרופיל',
    steps: [
      'פותחים את אינסטגרם ונכנסים לפרופיל שלך.',
      'לוחצים על "עריכת פרופיל", ואז על "קישורים" ועל "הוספת קישור חיצוני".',
      'מדביקים את הקישור שהעתקת כאן, ובשם הקישור כותבים למשל "קביעת תור".',
      'שומרים, ולוחצים על הקישור בפרופיל פעם אחת כדי לבדוק שהוא נפתח.',
    ],
    note: 'כפתור "הזמנה" שבכפתורי הפעולה של אינסטגרם עובד רק עם חברות שותפות של אינסטגרם, ולכן הדרך שעובדת עם הקישור שלך היא הקישור בביו. שמות התפריטים יכולים להשתנות קצת בין גרסאות של האפליקציה.',
  },
  {
    key: 'google', src: 'google', name: 'הפרופיל העסקי בגוגל', where: 'קישור לקביעת תור בכרטיס העסק בחיפוש ובמפות',
    steps: [
      'נכנסים לפרופיל העסק שלך בגוגל: מחפשים בגוגל את שם העסק כשאת מחוברת לחשבון שלך, או נכנסים לכתובת business.google.com.',
      'לוחצים על "עריכת הפרופיל" ומחפשים את האפשרות של הזמנות או קישור לקביעת תור. השם משתנה לפי סוג העסק.',
      'מדביקים את הקישור שהעתקת כאן בשדה הקישור לקביעת תורים, ושומרים.',
      'אם האפשרות לא מופיעה אצלך, מדביקים את הקישור בשדה האתר של הפרופיל.',
    ],
    note: 'צריך פרופיל עסקי מאומת. לפעמים עובר זמן עד שגוגל מציגה את השינוי ללקוחות.',
  },
  {
    key: 'facebook', src: 'facebook', name: 'הדף העסקי בפייסבוק', where: 'הכפתור הגדול שמתחת לתמונת הנושא',
    steps: [
      'נכנסים לדף העסקי שלך בפייסבוק, כמנהלת הדף.',
      'לוחצים על הכפתור שמתחת לתמונת הנושא: "הוספת כפתור", או עריכה של הכפתור שכבר יש.',
      'בוחרים "הזמנה" ואז קישור לאתר. אם האפשרות לא מופיעה, בוחרים כפתור אחר שמאפשר קישור לאתר, כמו "מידע נוסף".',
      'מדביקים את הקישור שהעתקת כאן ושומרים.',
      'לוחצים על הכפתור בדף פעם אחת כדי לבדוק שהוא נפתח.',
    ],
    note: 'פייסבוק משנה מדי פעם את סוגי הכפתורים, אז ייתכן שהשמות אצלך יהיו קצת אחרים.',
  },
  {
    key: 'whatsapp', src: 'whatsapp', name: 'וואטסאפ ביזנס', where: 'בפרופיל העסק ובהודעת ההיעדרות',
    steps: [
      'פותחים את וואטסאפ ביזנס ונכנסים להגדרות, ואז ל"כלים לעסקים".',
      'ב"פרופיל העסק" מדביקים את הקישור בשדה האתר, כך הוא מופיע לכל מי שפותחת את הפרופיל שלך.',
      'ב"הודעת היעדרות" אפשר לכתוב למשל: "תודה שפנית! אפשר לקבוע תור כאן:" ולהדביק את הקישור.',
      'אם יש לך קטלוג, אפשר להוסיף את הקישור גם לכל טיפול בקטלוג.',
    ],
    note: 'הודעת ההיעדרות נשלחת מהטלפון שלך על ידי וואטסאפ עצמה, לא מקלמיה.',
  },
];

export const BOOKING_BUTTONS_KEY = 'booking_buttons';

/** Her booking link tagged for one platform. */
export function platformLink(bookingUrl: string, p: Pick<BookingPlatform, 'src'>): string {
  return withSource(bookingUrl, p.src);
}

/** The ticks she saved, by platform key. Anything unreadable is "not done". */
export function doneMap(automations: unknown): Record<string, string> {
  const a = automations && typeof automations === 'object' ? (automations as Record<string, unknown>)[BOOKING_BUTTONS_KEY] : null;
  const out: Record<string, string> = {};
  if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
  for (const p of BOOKING_PLATFORMS) {
    const v = (a as Record<string, unknown>)[p.key];
    if (typeof v === 'string' && v) out[p.key] = v;
    else if (v === true) out[p.key] = 'yes';
  }
  return out;
}

/** The new booking_buttons value after ticking or unticking one platform. */
export function withDone(automations: unknown, key: BookingPlatform['key'], done: boolean, now = new Date()): Record<string, string> {
  const next = { ...doneMap(automations) };
  if (done) next[key] = now.toISOString().slice(0, 10);
  else delete next[key];
  return next;
}

/** Sanity for the test: every platform tags with a channel lib/bookingSource.ts accepts. */
export const platformSourcesValid = () => BOOKING_PLATFORMS.every((p) => (SOURCE_CHANNELS as readonly string[]).includes(p.src));
