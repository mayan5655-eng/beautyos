// lib/winback.ts
//
// Small pure helpers for the "לקוחות שמזמן לא הגיעו" screen (app/LapsedClientsModal.jsx). The list itself, the 90-day
// rule, the consent / opt-out rule and the future-appointment rule live on the server (app/api/clients/lapsed/route.js,
// lib/marketingConsent.js, lib/reminders/smartReminders.js computeLastVisits) and are unchanged; this file only decides how
// a row is greeted and which rows are shown. Nothing here sends anything: the message leaves from her own WhatsApp via a
// wa.me link she taps.

/** The first name as one would say it: first word of the stored name, without punctuation or emoji. '' when there is none. */
export function firstNameOf(name: unknown): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] || ''
  return first.replace(/[^\p{L}\p{N}'׳״"-]/gu, '').replace(/^["'-]+|["'-]+$/g, '')
}

/**
 * The message for one client. A message that opens with "שלום!" becomes "שלום <first name>!"; a message she rewrote to
 * open some other way is left exactly as she wrote it. No name on file keeps the plain greeting.
 */
export function personaliseWinback(message: string, name: unknown): string {
  const first = firstNameOf(name)
  if (!first) return message
  return message.replace(/^שלום!/, `שלום ${first}!`)
}

export type LapsedRow = { id: string; phone?: string | null; hasPhone?: boolean }

/** Clients she can actually reach, and how many were left out for having no phone number. */
export function splitByPhone<T extends LapsedRow>(rows: readonly T[]): { reachable: T[]; noPhone: number } {
  const reachable = rows.filter((r) => r.hasPhone !== false && !!String(r.phone ?? '').trim())
  return { reachable, noPhone: rows.length - reachable.length }
}
