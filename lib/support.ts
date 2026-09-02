// lib/support.ts
// How a cosmetician reaches a human when her plan needs attention.
//
// Kept in one place so the trial banner, the account-hold screen and the
// "תקועה?" panel can never drift apart.
//
// Nothing personal is hardcoded. The number and the name are read from the
// environment, so whoever is running the product answers the phone, and a
// forked or handed-over install does not quietly keep routing its customers to
// whoever set it up first. Both are NEXT_PUBLIC_ because every caller is a
// client component; neither is a secret — a wa.me link is public by definition.
//
// If no number is configured there is simply no WhatsApp route, and callers
// fall back to the in-app support form (/api/support), which needs no config.
// That is why supportWhatsAppUrl returns null rather than a broken link: an
// <a href="undefined"> looks like a working button and is not one.

const RAW_NUMBER = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, '')

/**
 * Support WhatsApp in E.164, digits only, or null when unconfigured. wa.me
 * rejects '+', spaces and dashes, so this must stay bare digits. The length
 * bounds are E.164's own: 8 is the shortest real international number, 15 the
 * maximum. A stray value like "0" or a copied label therefore reads as
 * unconfigured instead of producing a link to nowhere.
 */
export const SUPPORT_WHATSAPP_E164: string | null =
  RAW_NUMBER.length >= 8 && RAW_NUMBER.length <= 15 ? RAW_NUMBER : null

/** Is there a WhatsApp route at all? Callers use this to decide what to render. */
export const SUPPORT_WHATSAPP_AVAILABLE = SUPPORT_WHATSAPP_E164 !== null

/**
 * Who she is writing to, in Hebrew, for use inside a sentence. Deliberately a
 * role and not a person: the copy said "מעיין תחזור אלייך", which is wrong for
 * every install that is not hers and wrong for this one the day someone else
 * answers.
 */
export const SUPPORT_TEAM_HE = process.env.NEXT_PUBLIC_SUPPORT_NAME || 'צוות התמיכה'

/**
 * Prefilled Hebrew opener, so she never has to work out how to explain herself.
 */
export const SUPPORT_WHATSAPP_MESSAGE = 'היי, אני רוצה להמשיך עם BloomOS'

/**
 * A wa.me link that opens the chat with the message already typed, or null when
 * no support number is configured.
 */
export function supportWhatsAppUrl(
  message: string = SUPPORT_WHATSAPP_MESSAGE
): string | null {
  if (!SUPPORT_WHATSAPP_E164) return null
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(message)}`
}
