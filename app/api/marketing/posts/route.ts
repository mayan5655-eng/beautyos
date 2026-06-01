// app/api/marketing/posts/route.ts
// One-shot endpoint: takes a goal, runs strategy + post variations in
// sequence, and returns 5 ready-to-publish post variations.
// POST /api/marketing/posts
//
// Multi-tenant: business profile is loaded for the logged-in tenant only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateCampaignStrategy,
  generatePostVariations,
  type BusinessProfile,
  type CampaignInput,
} from '@/lib/ai/marketingAI'

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Input
    const body = await request.json()
    const { goal, serviceType, targetAudience, additionalContext } = body
    if (!goal) {
      return NextResponse.json({ error: 'נא לכתוב מה תרצי לפרסם' }, { status: 400 })
    }

    // 3. Load this tenant's business profile
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    let profile: BusinessProfile = {}
    if (tenantId) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select(
          'business_name, business_description, services, target_audience, region, brand_tone, unique_selling_points, price_range'
        )
        .eq('id', tenantId)
        .single()
      if (tenant) profile = tenant as BusinessProfile
    }

    // 4. Step 1 - strategy
    const input: CampaignInput = { goal, serviceType, targetAudience, additionalContext }
    const strategy = await generateCampaignStrategy(input, profile)

    // 5. Step 2 - post variations based on that strategy
    const variations = await generatePostVariations(strategy, profile, 5)

    // 6. Return everything
    return NextResponse.json({ strategy, variations })
  } catch (error) {
    console.error('Error in /api/marketing/posts:', error)
    return NextResponse.json({ error: 'יצירת הפוסטים נכשלה. נסי שוב.' }, { status: 500 })
  }
}
