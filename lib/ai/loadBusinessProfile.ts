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
import type { BusinessProfile } from './marketingAI'

// The server Supabase client (no generated DB types, so rows come back loosely typed).
type ServerSupabase = Awaited<ReturnType<typeof createClient>>

const clean = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

export async function loadBusinessProfile(
  supabase: ServerSupabase,
  tenantId: string | null | undefined
): Promise<BusinessProfile> {
  if (!tenantId) return {}

  // Read both real sources in parallel, strictly tenant-scoped (RLS enforced).
  const [settingsRes, servicesRes] = await Promise.all([
    supabase
      .from('settings')
      .select('business_name, therapist_name, primary_color, branding')
      .eq('tenant_id', tenantId)
      .limit(1),
    supabase
      .from('service_prices')
      .select('name, price, duration')
      .eq('tenant_id', tenantId)
      .eq('active', true),
  ])

  const row: Record<string, any> =
    settingsRes.data && settingsRes.data[0] ? settingsRes.data[0] : {}
  const brand: Record<string, any> =
    row.branding && typeof row.branding === 'object' ? row.branding : {}
  const services: Array<Record<string, any>> = servicesRes.data || []

  // Real service menu, formatted with price + duration so the AI can name actual
  // treatments at their actual prices instead of inventing generic ones.
  const serviceLines = services
    .filter((s) => s && s.name)
    .map((s) => {
      const price = s.price != null && s.price !== '' ? `₪${s.price}` : ''
      const dur = s.duration ? `${s.duration} דק׳` : ''
      const extra = [price, dur].filter(Boolean).join(', ')
      return extra ? `${s.name} (${extra})` : String(s.name)
    })

  // Derive a real price range from the actual service prices.
  const prices = services
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

  return {
    business_name: clean(row.business_name),
    therapist_name: clean(row.therapist_name),
    business_description: clean(brand.business_description),
    services: serviceLines.length > 0 ? serviceLines : undefined,
    price_range: priceRange,
    // No dedicated region column — the clinic address ("street, city") is the
    // best available local-targeting signal.
    region: clean(brand.public_address),
    // Brand-voice hints she wrote for her own customers.
    welcome_headline: clean(brand.welcome_headline),
    welcome_message: clean(brand.welcome_message),
    brand_colors: brandColors,
    has_logo: !!clean(brand.logo_url),
  }
}
