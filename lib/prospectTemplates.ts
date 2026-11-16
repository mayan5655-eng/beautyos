// lib/prospectTemplates.ts
//
// THE OUTREACH MESSAGES. The one place to edit what the first message to a cosmetician says (/dashboard/admin/outreach).
// {name} becomes her first name; with no usable name the greeting is just "היי 🌸".
//
// 2026-11-12, the owner's decision after a long first DM got little response: the first message is SHORT, has NO link to the
// site and asks ONE question about her day (the tailored line, by the system she uses today and her treatment). It invites her
// to follow @kal.mea. The link and the free month come only after she answers, by hand. outreachLink() stays for that reply.
//
// Rules every message keeps (test-admin-outreach.ts checks them):
//   - signed by מעיין, a person writing to a colleague, not a company;
//   - exactly one question line, tailored; no site link; the Instagram invite;
//   - the very last line is OPT_OUT_LINE, so a no is easy and final (חוק התקשורת, סעיף 30א);
//   - nothing that is not live: no automatic WhatsApp reminders, never the word "קבלה";
//   - no em dash.
// Nothing here sends anything: the WhatsApp text opens in wa.me on her phone, the Instagram text is copied and pasted by her.
import { firstName, cleanInstagram, isOtherBookingSystem, CURRENT_SYSTEM_HE } from './prospects.ts'
import type { Treatment, CurrentSystem } from './prospects.ts'
import { toWhatsAppNumber } from './phone.ts'

export const SITE_URL = 'https://kalmea.app/'
export const PHONE_DISPLAY = '054-2845655'
/** The question asked when nothing is known about her system or treatment. */
export const BASE_TAILORED_LINE = 'שאלה קצרה: איך את מנהלת היום את התורים והתשלומים? בוואטסאפ ובמחברת, או שיש לך מערכת?'
export const INSTAGRAM_URL = 'https://instagram.com/kal.mea'

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

/** The one tailored line: a single question about her day, by the system she uses and her treatment. */
export function tailoredLine(treatment: Treatment, system: CurrentSystem): string {
  const t = TREATMENT_BOOKINGS[treatment]
  if (system === 'whatsapp_manual') return 'שאלה קצרה: גם אצלך הלקוחות שולחות "יש לך מחר משהו?" ב-11 בלילה? 😅'
  if (system === 'excel_or_notebook') return `שאלה קצרה: את יודעת בסוף החודש כמה בדיוק הכניסו לך ${t}? או שזה יותר בהרגשה?`
  if (isOtherBookingSystem(system)) {
    const name = system === 'other_system' ? 'המערכת' : CURRENT_SYSTEM_HE[system]
    return `שאלה קצרה: איך את מרגישה עם ${name} שאת עובדת איתה היום? יש משהו שחסר לך?`
  }
  return treatment === 'other' ? BASE_TAILORED_LINE : `שאלה קצרה: איך את מנהלת היום את ${t} והתשלומים? בוואטסאפ ובמחברת, או שיש לך מערכת?`
}

/** The first DM: short, one question, no site link; {line} and {follow} filled per channel. */
const BASE = [
  'היי {name} 🌸',
  'אני מעיין מ-Kalmea, מערכת לקוסמטיקאיות ומניקוריסטיות.',
  '',
  '{line}',
  '',
  '{follow}',
  '',
  OPT_OUT_LINE,
].join('\n')

const FOLLOW: Record<MessageChannel, string> = {
  instagram: 'אני מעלה כאן ב-@kal.mea טיפים לניהול העסק, אשמח אם תעקבי 💛',
  whatsapp: `אני מעלה באינסטגרם טיפים לניהול העסק, אשמח אם תעקבי: ${INSTAGRAM_URL} 💛`,
}

/** The message for one channel, before her name goes in ({name} stays). */
export function messageTemplate(channel: MessageChannel, treatment: Treatment, system: CurrentSystem = 'unknown'): string {
  return BASE.split('{line}').join(tailoredLine(treatment, system)).split('{follow}').join(FOLLOW[channel])
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
