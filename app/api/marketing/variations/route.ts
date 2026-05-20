// app/api/marketing/variations/route.ts
// API endpoint that generates post variations using AI
// AND adds an Unsplash image to each post
// POST /api/marketing/variations

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generatePostVariations,
  type BusinessProfile,
  type CampaignStrategy,
} from '@/lib/ai/marketingAI'
import { searchUnsplashImage } from '@/lib/unsplash'

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

    // Step 2: Get strategy and count from request
    const body = await request.json()
    const { strategy, count } = body

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy is required' },
        { status: 400 }
      )
    }

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

    // Step 4: Generate post variations with AI
    const variations = await generatePostVariations(
      strategy as CampaignStrategy,
      profile,
      count || 5
    )

    // Step 5: Fetch Unsplash images for each variation in parallel
    // We use the imageSuggestion field from AI as the search query
    const variationsWithImages = await Promise.all(
      variations.map(async (v) => {
        const image = await searchUnsplashImage(
          v.imageSuggestion || 'beauty cosmetics'
        )
        return {
          ...v,
          image, // adds: { url, thumbUrl, photographerName, photographerUrl, description } or null
        }
      })
    )

    // Step 6: Return to client
    return NextResponse.json({ variations: variationsWithImages })
  } catch (error) {
    console.error('Error in /api/marketing/variations:', error)
    return NextResponse.json(
      { error: 'Failed to generate variations' },
      { status: 500 }
    )
  }
}