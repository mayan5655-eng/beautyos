// app/dashboard/owner/signups/contacts.ts
//
// SERVER ONLY, and only ever called from loadSignupsPage() in ../loader.ts, which has passed requirePlatformAdmin() (a non-admin gets
// the plain 404 before any of this runs). It is the one place in the owner screens that reads a business phone or an account email, for
// at most the 20 newest signups.
//
// What leaves this file: per business, the phone (local format), the account email and a wa.me or mailto link, rendered into the page
// for a platform admin so she can read and copy them. Not stored, not logged (errors log only a message). Nothing is sent: the link
// opens HER WhatsApp or mail app.
//
// Skipped entirely, with no read at all: demo businesses, test-looking names (a 13-digit number) and the owner's own business.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSignupContact, contactEligible } from '@/lib/ownerContact'
import type { SignupContact } from '@/lib/ownerContact'
import type { NewestSignup } from '@/lib/ownerControl'

export async function loadSignupContacts(db: SupabaseClient, rows: NewestSignup[], ownTenantId: string | null): Promise<Record<string, SignupContact>> {
  const eligible = rows.filter((r) => contactEligible({ id: r.id, name: r.name }, ownTenantId))
  if (eligible.length === 0) return {}
  const ids = eligible.map((r) => r.id)

  const [own, set] = await Promise.all([
    db.from('tenants').select('id, owner_id').in('id', ids),
    db.from('settings').select('tenant_id, business_phone').in('tenant_id', ids),
  ])
  if (own.error) console.error('[owner/contacts] tenants read failed:', own.error.message)
  if (set.error) console.error('[owner/contacts] settings read failed:', set.error.message)
  const ownerOf = new Map<string, string>()
  for (const t of (own.data || []) as Array<{ id: string; owner_id: string | null }>) if (t.owner_id) ownerOf.set(t.id, t.owner_id)
  const phoneOf = new Map<string, string | null>()
  for (const s of (set.data || []) as Array<{ tenant_id: string; business_phone: string | null }>) phoneOf.set(s.tenant_id, s.business_phone)

  const out: Record<string, SignupContact> = {}
  await Promise.all(eligible.map(async (r) => {
    // Both are shown, so the account email is always looked up (at most 20 calls). The link still prefers a valid mobile.
    let email: string | null = null
    const uid = ownerOf.get(r.id)
    if (uid) {
      try {
        const { data, error } = await db.auth.admin.getUserById(uid)
        if (error) console.error('[owner/contacts] account lookup failed:', error.message)
        else email = data?.user?.email ?? null
      } catch (e) {
        console.error('[owner/contacts] account lookup threw:', e instanceof Error ? e.message : 'unknown')
      }
    }
    const c = buildSignupContact({ businessName: r.name, phone: phoneOf.get(r.id), email })
    if (c.phone || c.email || c.link) out[r.id] = c
  }))
  return out
}
