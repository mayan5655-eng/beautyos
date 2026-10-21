// lib/publicBookingGate.ts
//
// Is her public booking page taking new bookings? Owner decision 2026-10-21: when her trial ends without
// payment (or the account is paused) the system closes, and her public page stops taking NEW bookings until
// she renews. Reminders for appointments already booked keep going (the senders do not look at this).
//
// Server-only: it reads the tenants row with the service-role key, because the anon RPCs the public page
// uses deliberately never expose plan state. Only the plan columns are read, and only a boolean leaves here.
// FAILS OPEN like every billing check (lib/tenantActive): no key, an unreadable row or any error = open.
// /api/book-appointment and /api/waitlist/join already refuse a blocked business; this lets the page say so
// up front instead of after her client filled in the whole form.

import { createClient } from '@supabase/supabase-js'
import { tenantIsBlocked } from './tenantActive.ts'

export async function publicBookingClosed(tenantId: string | null | undefined): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !tenantId) return false
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    return await tenantIsBlocked(admin, tenantId)
  } catch {
    return false
  }
}
