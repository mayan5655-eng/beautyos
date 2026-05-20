// app/api/marketing/strategy/route.ts
// API endpoint that generates a campaign strategy using AI
// POST /api/marketing/strategy

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateCampaignStrategy,
  type BusinessProfile,
  type CampaignInput,
} from '@/lib/ai/marketingAI'

export async function POST(request: NextRequest) {
  try {
    // Step 1: Get user from Supabase auth
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

    // Step 2: Get the campaign input from the request body
    const body = await request.json()
    const { goal, serviceType, targetAudience, additionalContext } = body

    if (!goal) {
      return NextResponse.json(
        { error: 'Campaign goal is required' },
        { status: 400 }
      )
    }

    // Step 3: Load the business profile from the tenants table
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

    // Step 4: Build the input for the AI function
    const input: CampaignInput = {
      goal,
      serviceType,
      targetAudience,
      additionalContext,
    }

    // Step 5: Call the AI function to generate the strategy
    const strategy = await generateCampaignStrategy(input, profile)

    // Step 6: Return the strategy to the client
    return NextResponse.json({ strategy })
  } catch (error) {
    console.error('Error in /api/marketing/strategy:', error)
    return NextResponse.json(
      { error: 'Failed to generate strategy' },
      { status: 500 }
    )
  }
}