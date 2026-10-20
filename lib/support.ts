// lib/support.ts
// How a cosmetician reaches a human when her plan needs attention.
//
// Kept in one place so the trial banner, the account-hold screen, the landing
// page, the legal pages and the "תקועה?" panel can never drift apart.
//
// Kalmea's support line is a WhatsApp-only number (it receives messages, NOT
// calls), so it is ONE constant here and is only ever offered as a wa.me link,
// never as a tel: link or a call button. It is a business line, not a personal
// one, and a wa.me link is public by definition. To change it, change
// KALMEA_SUPPORT_WHATSAPP below and nothing else.
//
// NEXT_PUBLIC_SUPPORT_WHATSAPP is no longer read for display. It still exists
// as the operator's own alert destination in server code (outbound alerts), a
// different thing from the number customers write to.

// 2026-10-20: moved off 050-7321978, which is being registered on Meta's WhatsApp Cloud API as the sending number. A
// number on the Cloud API no longer opens in the WhatsApp app, so support chats sent there would reach nobody. This line
// is temporary until a dedicated support SIM replaces it.
/** Kalmea support, WhatsApp only (no calls), E.164 digits without '+'. */
export const KALMEA_SUPPORT_WHATSAPP = '972542845655'
/** The same number as written locally, for showing next to a link. */
export const KALMEA_SUPPORT_WHATSAPP_DISPLAY = '054-2845655'

const RAW_NUMBER = KALMEA_SUPPORT_WHATSAPP

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
export const SUPPORT_WHATSAPP_MESSAGE = 'היי, אני רוצה להמשיך עם קלמיה'

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
