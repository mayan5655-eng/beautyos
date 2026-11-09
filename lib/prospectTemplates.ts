// lib/prospectTemplates.ts
//
// THE OUTREACH MESSAGES. The one place to edit what the first message to a cosmetician says (/dashboard/admin/outreach).
// {name} becomes her first name; with no usable name the greeting is just "היי".
//
// Rules every template keeps (test-admin-outreach.ts checks them):
//   - signed by מעיין from ביוטי פלייס, a cosmetician writing to a colleague, not a company;
//   - mentions the free trial month with no credit card;
//   - ASKS before sending a link (no link in the first message);
//   - the line "אם לא רלוונטי, תגידי לי ולא אפנה שוב", so a no is easy and final;
//   - no em dash.
import { firstName, cleanInstagram } from './prospects.ts'
import type { Treatment } from './prospects.ts'
import { toWhatsAppNumber } from './phone.ts'

export const OPT_OUT_LINE = 'אם לא רלוונטי, תגידי לי ולא אפנה שוב 🙏'

const intro = 'היי {name}, מה שלומך? 🌸\nכאן מעיין מביוטי פלייס, קוסמטיקאית בעצמי.'
const close = `יש חודש ניסיון חינם, בלי כרטיס אשראי.\nרוצה שאשלח לך קישור להצצה?\n\n${OPT_OUT_LINE}\nמעיין`

export type TemplateKey = 'general' | 'brows' | 'lashes' | 'face' | 'nails'

export const WHATSAPP_TEMPLATES: Record<TemplateKey, string> = {
  general: `${intro}\nבניתי לעצמי מערכת בשם קלמיה שמנהלת לי את היומן, שולחת ללקוחות תזכורות ומאפשרת להן לקבוע תור לבד מקישור. היא חסכה לי המון שיחות והודעות, אז פתחתי אותה גם לקוסמטיקאיות אחרות.\n${close}`,
  brows: `${intro}\nראיתי את העבודות שלך בגבות, ממש יפות! בניתי לעצמי מערכת בשם קלמיה שמזכירה ללקוחות לחזור לעיצוב בזמן, שולחת תזכורת לפני התור ומאפשרת להן לקבוע לבד מקישור. פתחתי אותה גם לקוסמטיקאיות אחרות.\n${close}`,
  lashes: `${intro}\nראיתי את העבודות שלך בריסים, מהממות! בניתי לעצמי מערכת בשם קלמיה שמזכירה ללקוחות לקבוע מילוי בזמן, שולחת תזכורת לפני התור ומאפשרת להן לקבוע לבד מקישור. פתחתי אותה גם לקוסמטיקאיות אחרות.\n${close}`,
  face: `${intro}\nראיתי שאת מטפלת בפנים. בניתי לעצמי מערכת בשם קלמיה עם יומן, תזכורות ללקוחות, הצהרת בריאות דיגיטלית ותיק לקוחה עם מעקב טיפולים. פתחתי אותה גם לקוסמטיקאיות אחרות.\n${close}`,
  nails: `${intro}\nראיתי את העבודות שלך בציפורניים, יפהפיות! בניתי לעצמי מערכת בשם קלמיה שמזכירה ללקוחות לחזור למילוי, שולחת תזכורת לפני התור ומאפשרת להן לקבוע לבד מקישור. פתחתי אותה גם לקוסמטיקאיות אחרות.\n${close}`,
}

/** Instagram has no prefilled-message link, so this one is copied to the clipboard and pasted in the DM. Shorter, same rules. */
export const INSTAGRAM_TEMPLATE = `היי {name} 🌸 כאן מעיין מביוטי פלייס, קוסמטיקאית בעצמי.\nבניתי לעצמי מערכת בשם קלמיה ליומן, תזכורות ללקוחות וקביעת תורים מקישור, ופתחתי אותה גם לקוסמטיקאיות אחרות. יש חודש ניסיון חינם, בלי כרטיס אשראי.\nרוצה שאשלח לך קישור?\n${OPT_OUT_LINE}\nמעיין`

/** The template for her treatment type: hair removal and "other" get the general one. */
export function templateKeyFor(treatment: Treatment): TemplateKey {
  return treatment === 'brows' || treatment === 'lashes' || treatment === 'face' || treatment === 'nails' ? treatment : 'general'
}

/** Puts her first name in; with none, "היי {name}," becomes "היי," (and "היי {name} " becomes "היי "). */
export function personalize(template: string, fullName: string | null | undefined): string {
  const n = firstName(fullName)
  return n ? template.split('{name}').join(n) : template.replace(/ \{name\}/g, '').split('{name}').join('')
}

export function whatsappMessage(treatment: Treatment, fullName: string | null | undefined): string {
  return personalize(WHATSAPP_TEMPLATES[templateKeyFor(treatment)], fullName)
}

export function instagramMessage(fullName: string | null | undefined): string {
  return personalize(INSTAGRAM_TEMPLATE, fullName)
}

/** wa.me with the message typed in, opened on HER phone. Null without a usable number. Nothing is sent by this. */
export function prospectWaLink(phone: string | null | undefined, treatment: Treatment, fullName: string | null | undefined): string | null {
  const digits = toWhatsAppNumber(phone)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage(treatment, fullName))}` : null
}

/** Opens a DM thread with her on Instagram (the text is pasted from the clipboard). */
export function instagramDmLink(handle: string | null | undefined): string | null {
  const h = cleanInstagram(handle)
  return h ? `https://ig.me/m/${h}` : null
}
