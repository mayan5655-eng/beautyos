// app/api/marketing/strategy/route.ts
// API endpoint that generates a campaign strategy using AI
// POST /api/marketing/strategy

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateCampaignStrategy,
  type CampaignInput,
} from '@/lib/ai/marketingAI'
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile'

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

    // Step 3: Load the REAL business profile (settings + branding + service_prices)
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    const profile = await loadBusinessProfile(supabase, tenantId)

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