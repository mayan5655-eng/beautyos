// lib/prospectTemplates.ts
//
// THE OUTREACH MESSAGES. The one place to edit what the first message to a cosmetician says (/dashboard/admin/outreach).
// {name} becomes her first name; with no usable name the greeting is just "היי,".
//
// The base is the DM text the owner approved (2026-11). ONE line in it is tailored: the "הכל בתוכנה אחת" line, by the system
// she uses today (WhatsApp by hand: the evenings in WhatsApp; a notebook or Excel; another booking system: moving over is easy,
// and the base already says the first month is on us) and by her treatment. The link carries utm_source (instagram / whatsapp),
// utm_medium=dm and utm_campaign=<treatment>.
//
// Rules every message keeps (test-admin-outreach.ts checks them):
//   - signed by מעיין, a person writing to a colleague, not a company;
//   - "חודש ראשון עליי": the free first month;
//   - the very last line is OPT_OUT_LINE, so a no is easy and final (חוק התקשורת, סעיף 30א);
//   - nothing that is not live: no automatic WhatsApp reminders, never the word "קבלה";
//   - no em dash.
// Nothing here sends anything: the WhatsApp text opens in wa.me on her phone, the Instagram text is copied and pasted by her.
import { firstName, cleanInstagram, isOtherBookingSystem, CURRENT_SYSTEM_HE } from './prospects.ts'
import type { Treatment, CurrentSystem } from './prospects.ts'
import { toWhatsAppNumber } from './phone.ts'

export const SITE_URL = 'https://kalmea.app/'
export const PHONE_DISPLAY = '054-2845655'
/** The line that is swapped for the tailored one. Kept as is when nothing is known about her. */
export const BASE_TAILORED_LINE = 'הכל בתוכנה אחת, במקום שלוש אפליקציות ומחברת ✨'

/** Israeli law (חוק התקשורת, סעיף 30א): a one-time offer to a business must let her refuse. The very last line of every message. */
export const OPT_OUT_LINE = 'ואם זה לא רלוונטי לך, רק תכתבי לי ולא אפנה שוב 🙏'

export type MessageChannel = 'instagram' | 'whatsapp'

/** The landing link with the campaign tags: which channel, a DM, and her treatment. */
export function outreachLink(channel: MessageChannel, treatment: Treatment): string {
  return `${SITE_URL}?utm_source=${channel}&utm_medium=dm&utm_campaign=${treatment}`
}

/** Her treatment as the appointments she books all evening. */
const TREATMENT_BOOKINGS: Record<Treatment, string> = {
  brows: 'תורי גבות', lashes: 'תורי ריסים', face: 'טיפולי פנים', nails: 'תורי ציפורניים', hair_removal: 'תורי הסרת שיער', other: 'תורים',
}

/** The one tailored line: by the system she uses, with her treatment in it. */
export function tailoredLine(treatment: Treatment, system: CurrentSystem): string {
  const t = TREATMENT_BOOKINGS[treatment]
  if (system === 'whatsapp_manual') return `אם גם אצלך הערבים הולכים על התכתבויות בוואטסאפ על ${t}, כאן הלקוחות קובעות לבד והכל בתוכנה אחת ✨`
  if (system === 'excel_or_notebook') return `במקום מחברת, אקסל וערבים בוואטסאפ על ${t}, הכל בתוכנה אחת ✨`
  if (isOtherBookingSystem(system)) {
    const name = system === 'other_system' ? 'מערכת אחרת' : CURRENT_SYSTEM_HE[system]
    return `עובדת היום עם ${name}? המעבר קל ואני עושה אותו יחד איתך, בלי לעצור את העבודה ✨`
  }
  return treatment === 'other' ? BASE_TAILORED_LINE : `הכל בתוכנה אחת, מ${t} ועד הקופה, במקום שלוש אפליקציות ומחברת ✨`
}

/** The approved DM, with {line} (the tailored line), {link} and {contact} filled per channel. */
const BASE = [
  'היי {name}, נעים מאוד, אני מעיין 🌸',
  '',
  'הקמתי את Kalmea, מערכת לקוסמטיקאיות ומניקוריסטיות שמנהלת לך את כל העסק במקום אחד, כדי שתוכלי להתמקד בטיפולים ולגדול:',
  '',
  '📅 יומן וניהול: אתר אישי משלך שבו הלקוחות קובעות ומזיזות תור לבד, עם מקדמה בכרטיס או בביט. פחות וואטסאפ, פחות לקוחות שלא מגיעות.',
  '📣 שיווק: פוסטים ורילסים לאינסטגרם עם AI, בעיצוב של העסק שלך, תוך דקות.',
  '💰 מכירות: קופה וסליקה, כרטיסיית ניקובים, שוברי מתנה ודוח חודשי שמראה כמה הרווחת ומאיפה.',
  '',
  '{line}',
  '',
  'אם תרצי, אני מקימה לך את הכל בעצמי תוך 10 דקות, וחודש ראשון עליי 💛',
  'להצצה: {link}',
  '',
  'מוזמנת לעקוב אחרינו ב-@kal.mea לטיפים ועדכונים 🌸',
  '{contact}',
  '',
  OPT_OUT_LINE,
].join('\n')

const CONTACT: Record<MessageChannel, string> = {
  instagram: `לכל שאלה אני זמינה לך באופן אישי, כאן או בוואטסאפ: ${PHONE_DISPLAY}`,
  whatsapp: 'לכל שאלה אני זמינה לך באופן אישי, כאן בוואטסאפ',
}

/** The message for one channel, before her name goes in ({name} stays). */
export function messageTemplate(channel: MessageChannel, treatment: Treatment, system: CurrentSystem = 'unknown'): string {
  return BASE.split('{line}').join(tailoredLine(treatment, system))
    .split('{link}').join(outreachLink(channel, treatment))
    .split('{contact}').join(CONTACT[channel])
}

/** Puts her first name in; with none, "היי {name}," becomes "היי,". */
export function personalize(template: string, fullName: string | null | undefined): string {
  const n = firstName(fullName)
  return n ? template.split('{name}').join(n) : template.replace(/ \{name\}/g, '').split('{name}').join('')
}

export function whatsappMessage(treatment: Treatment, fullName: string | null | undefined, system: CurrentSystem = 'unknown'): string {
  return personalize(messageTemplate('whatsapp', treatment, system), fullName)
}

/** Instagram has no prefilled-message link, so this one is copied to the clipboard and pasted in the DM. */
export function instagramMessage(fullName: string | null | undefined, treatment: Treatment = 'other', system: CurrentSystem = 'unknown'): string {
  return personalize(messageTemplate('instagram', treatment, system), fullName)
}

/** wa.me with the message typed in, opened on HER phone. Null without a usable number. Nothing is sent by this. */
export function prospectWaLink(phone: string | null | undefined, treatment: Treatment, fullName: string | null | undefined, system: CurrentSystem = 'unknown'): string | null {
  const digits = toWhatsAppNumber(phone)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage(treatment, fullName, system))}` : null
}

/** Opens a DM thread with her on Instagram (the text is pasted from the clipboard). */
export function instagramDmLink(handle: string | null | undefined): string | null {
  const h = cleanInstagram(handle)
  return h ? `https://ig.me/m/${h}` : null
}
