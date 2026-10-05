// lib/ai/loadBusinessProfile.ts
// Loads the REAL business profile for the marketing AI (strategy / posts / groups).
//
// The AI content used to read from the `tenants` table, but the app never writes
// those columns — the real business identity lives in:
//   - settings           -> business_name, therapist_name, primary_color
//   - settings.branding   (jsonb) -> business_description, welcome_headline,
//                            welcome_message, secondary_color, logo_url, public_address
//   - service_prices      -> the actual service menu with prices + duration
//
// This mirrors the pattern the reel route already uses successfully, so every
// marketing AI function is grounded in the salon's real services, branding and voice.

import type { createClient } from '@/lib/supabase/server'
import type { BusinessProfile } from './marketingAI.ts'
import {
  splitAdvertisable,
  usableTherapistName,
  parseClinicAddress,
} from './profileHygiene.ts'
// Relative, not '@/lib/...': that alias is TypeScript/Next.js-only
// (tsconfig `paths`), which plain `node --experimental-strip-types` cannot
// resolve — the reason this file had no test of its own before
// test-load-business-profile.ts. Relative resolves identically under both.
import { APP_URL } from '../appUrl.ts'
import { ACTIVE_OR_NULL } from '../serviceActive.js'
import { businessFieldsOf } from '../businessFields.ts'
import { isMissingColumnError } from '../pgError.ts'

// The server Supabase client (no generated DB types, so rows come back loosely typed).
type ServerSupabase = Awaited<ReturnType<typeof createClient>>

const clean = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

// unique_selling_points is a string[] on BusinessProfile, but she types it as
// free text — one advantage per line, or comma-separated if she runs them
// together. Accept either, and accept an actual array in case it is ever
// stored that way.
const toList = (v: unknown): string[] | undefined => {
  if (Array.isArray(v)) {
    const items = v.map((x) => clean(x)).filter((x): x is string => !!x)
    return items.length > 0 ? items : undefined
  }
  const s = clean(v)
  if (!s) return undefined
  const items = s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

export async function loadBusinessProfile(
  supabase: ServerSupabase,
  tenantId: string | null | undefined
): Promise<BusinessProfile> {
  if (!tenantId) return {}

  // Read both real sources in parallel, strictly tenant-scoped (RLS enforced).
  const [settingsRes, servicesRes] = await Promise.all([
    supabase
      .from('settings')
      .select('business_name, therapist_name, primary_color, branding, business_fields')
      .eq('tenant_id', tenantId)
      .limit(1),
    supabase
      .from('service_prices')
      .select('name, price, duration, description')
      .eq('tenant_id', tenantId)
      .or(ACTIVE_OR_NULL),
  ])

  // service_prices.description arrives with add_service_description.sql, run by
  // hand. Naming an absent column fails the whole read, so degrade to the plain
  // list rather than lose the services altogether.
  const servicesData = servicesRes.error && isMissingColumnError(servicesRes.error)
    ? (await supabase.from('service_prices').select('name, price, duration').eq('tenant_id', tenantId).or(ACTIVE_OR_NULL)).data
    : servicesRes.data

  // business_fields is added by supabase/migrations/add_business_fields.sql,
  // applied by hand and possibly not yet run. Naming an unknown column in an
  // explicit select fails the WHOLE row, not just that field — degrade by
  // dropping it and retrying, rather than losing business_name, branding and
  // every other real profile field over one missing column.
  const settingsData = settingsRes.error && isMissingColumnError(settingsRes.error)
    ? (await supabase.from('settings').select('business_name, therapist_name, primary_color, branding').eq('tenant_id', tenantId).limit(1)).data
    : settingsRes.data

  const row: Record<string, any> =
    settingsData && settingsData[0] ? settingsData[0] : {}
  const brand: Record<string, any> =
    row.branding && typeof row.branding === 'object' ? row.branding : {}
  const services: Array<Record<string, any>> = servicesData || []

  // Performed is not the same as advertisable. Injectables and blood-derived
  // procedures are medical acts in Israel; they can legitimately sit on her
  // price list and still must never appear in a post written in her name. They
  // are removed HERE, before the profile exists, so no prompt can reach them by
  // accident - see lib/ai/profileHygiene.ts for the reasoning and the list.
  const named = services.filter((s) => s && s.name)
  const { advertisable, restricted } = splitAdvertisable(named, (s) => String(s.name))

  // Real service menu, formatted with price + duration so the AI can name actual
  // treatments at their actual prices instead of inventing generic ones.
  const serviceLines = advertisable.map((s) => {
    const price = s.price != null && s.price !== '' ? `₪${s.price}` : ''
    const dur = s.duration ? `${s.duration} דק׳` : ''
    const extra = [price, dur].filter(Boolean).join(', ')
    return extra ? `${s.name} (${extra})` : String(s.name)
  })

  // What she wrote about each advertisable treatment: the only place a claim about
  // how it feels, how strong it is, downtime, who it suits or what it contains may
  // come from (lib/ai/claimsGuard.ts).
  const serviceDetails = advertisable
    .filter((s) => String(s.description || '').trim())
    .map((s) => `${s.name}: ${String(s.description).trim().slice(0, 300)}`)

  // Price range spans the ADVERTISABLE menu only. Including botox at ₪800 would
  // put a number in front of her that no post is allowed to explain.
  const prices = advertisable
    .map((s) => Number(s.price))
    .filter((n) => Number.isFinite(n) && n > 0)
  let priceRange: string | undefined
  if (prices.length > 0) {
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    priceRange = min === max ? `₪${min}` : `₪${min}–₪${max}`
  }

  // Brand identity: her chosen colors + whether she has a designed logo.
  const primary = clean(row.primary_color)
  const secondary = clean(brand.secondary_color)
  const brandColors =
    [primary && `ראשי ${primary}`, secondary && `משני ${secondary}`]
      .filter(Boolean)
      .join(', ') || undefined

  // Full address or none. A city of two characters ("רג") is an abbreviation
  // nobody can search for, and it published as "באחד העם 6, רג" in four posts.
  const address = parseClinicAddress(brand.public_address)

  return {
    business_name: clean(row.business_name),
    // Dropped when it is a login handle rather than a name: "mayan5655" made
    // the model invent "מיין" and address her by it in public copy.
    therapist_name: usableTherapistName(row.therapist_name),
    business_description: clean(brand.business_description),
    services: serviceLines.length > 0 ? serviceLines : undefined,
    service_details: serviceDetails.length > 0 ? serviceDetails : undefined,
    restricted_service_count: restricted.length || undefined,
    price_range: priceRange,
    region: address?.full,
    city: address?.city,
    // The one link that turns a post into a booking. Every generated CTA used
    // to be "write to me", which routes a customer into her DMs and leaves the
    // calendar to be filled by hand.
    booking_url: tenantId ? `${APP_URL}/book?t=${tenantId}` : undefined,
    booking_cta_label: clean(brand.booking_cta_label),
    // Brand-voice hints she wrote for her own customers.
    welcome_headline: clean(brand.welcome_headline),
    welcome_message: clean(brand.welcome_message),
    brand_colors: brandColors,
    has_logo: !!clean(brand.logo_url),

    // These three were declared on BusinessProfile and rendered by
    // buildBusinessContext from the start, but nothing ever set them, so
    // `קהל יעד`, `סגנון מותג` and `יתרונות תחרותיים` never once appeared in a
    // prompt — while the strategy prompt went on asking "מי קהל היעד באמת".
    // It was answering that from nothing.
    //
    // There was no column to read: no table in the app stores them. They now
    // come from the branding jsonb, alongside the other free-text brand
    // fields, and the settings screen collects them (the "מידע לתוכן השיווקי"
    // block). Unset for an existing tenant until she fills it in — the same
    // undefined as before, but now with a way out.
    target_audience: clean(brand.target_audience),
    brand_tone: clean(brand.brand_tone),
    unique_selling_points: toList(brand.unique_selling_points),
    fields: businessFieldsOf(row),
  }
}
