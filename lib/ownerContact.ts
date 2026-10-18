// lib/ownerContact.ts
//
// Contact links for the owner's signups screen (/dashboard/owner/signups). Pure: it only turns what the server has already read
// (behind requirePlatformAdmin) into a link. It sends nothing and stores nothing: a wa.me link opens her own WhatsApp with a message
// typed for her to edit, a mailto link opens her own mail app. The numbers and addresses never leave the server except inside the
// links rendered for a platform admin.

import { isDemoTenantId } from './demoTenants.ts'
import { normalizeIsraeliMobile } from './phone.ts'

/** The test runs create businesses named "... 1791063027140": a 13-digit number. Such names are never contacted or alerted about. */
export function looksLikeTestName(name: unknown): boolean {
  return /\d{13}/.test(String(name ?? ''))
}

/** Whether a business may get a contact button at all: not a demo, not a test-looking name, not the owner's own business. */
export function contactEligible(t: { id: string; name: unknown }, ownTenantId: string | null): boolean {
  if (!t.id) return false
  if (isDemoTenantId(t.id)) return false
  if (ownTenantId && t.id === ownTenantId) return false
  if (looksLikeTestName(t.name)) return false
  return true
}

const cleanName = (n: unknown) => String(n ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

/** The prefilled opening, short and warm. She reads and edits it before sending. */
export function contactMessageHe(businessName: unknown): string {
  const name = cleanName(businessName)
  return `היי 🌸 כאן מעיין מקלמיה. ראיתי שפתחת חשבון${name ? ` עבור ${name}` : ''}. אשמח לעזור אם יש שאלה או משהו שתקוע.`
}

export const CONTACT_MAIL_SUBJECT_HE = 'ברוכה הבאה לקלמיה'

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

export type ContactLink = { kind: 'whatsapp' | 'email'; href: string }

/**
 * A wa.me link when there is a valid Israeli mobile number for the business, otherwise a mailto link to the account email, otherwise
 * nothing. A landline or an unusable number falls through to the email.
 */
export function buildContactLink(o: { businessName: unknown; phone?: string | null; email?: string | null }): ContactLink | null {
  const message = contactMessageHe(o.businessName)
  const p = normalizeIsraeliMobile(o.phone)
  if (p.ok) return { kind: 'whatsapp', href: `https://wa.me/${p.e164}?text=${encodeURIComponent(message)}` }
  const email = String(o.email ?? '').trim()
  if (EMAIL_RE.test(email)) {
    return { kind: 'email', href: `mailto:${email}?subject=${encodeURIComponent(CONTACT_MAIL_SUBJECT_HE)}&body=${encodeURIComponent(message)}` }
  }
  return null
}
