// app/api/marketing/groups/route.ts
// API endpoint that suggests Facebook groups using AI
// POST /api/marketing/groups

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  suggestFacebookGroups,
  type BusinessProfile,
} from '@/lib/ai/marketingAI'

export async function POST(request: NextRequest) {
  try {
    // Step 1: Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Step 2: Get count from request (optional)
    const body = await request.json().catch(() => ({}))
    const { count } = body

    // Step 3: Load business profile
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

      if (tenant) {
        profile = tenant as BusinessProfile
      }
    }

    // Step 4: Call AI to suggest groups (default 10)
    const groups = await suggestFacebookGroups(profile, count || 10)

    // Step 5: Return to client
    return NextResponse.json({ groups })
  } catch (error) {
    console.error('Error in /api/marketing/groups:', error)
    return NextResponse.json(
      { error: 'Failed to suggest groups' },
      { status: 500 }
    )
  }
}