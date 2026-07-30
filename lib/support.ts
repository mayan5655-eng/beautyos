// lib/support.ts
// How a cosmetician reaches a human when her plan needs attention.
//
// Kept in one place so the trial banner (Phase 2) and the account-hold screen
// (Phase 3) can never drift apart: if this number ever changes, it changes in
// exactly one file.

/**
 * Maayan's WhatsApp in E.164, digits only. wa.me rejects '+', spaces and
 * dashes, so this must stay bare digits.
 */
export const SUPPORT_WHATSAPP_E164 = '972542845655'

/**
 * Prefilled Hebrew opener, so she never has to work out how to explain herself.
 */
export const SUPPORT_WHATSAPP_MESSAGE = 'היי מעיין, אני רוצה להמשיך עם BloomOS'

/** A wa.me link that opens the chat with the message already typed. */
export function supportWhatsAppUrl(message: string = SUPPORT_WHATSAPP_MESSAGE): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(message)}`
}
