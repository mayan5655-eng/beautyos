// app/api/marketing/variations/route.ts
// API endpoint that generates post variations using AI
// AND adds an Unsplash image to each post
// POST /api/marketing/variations

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveTenant } from '@/lib/planGuard'
import {
  generatePostVariations,
  type CampaignStrategy,
} from '@/lib/ai/marketingAI'
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile'
import { searchUnsplashImagesForVariations } from '@/lib/unsplash'

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

    // Plan gate: a tenant whose trial has lapsed or whose account is paused
    // cannot spend or mutate. Placed before any AI call so a blocked tenant
    // never costs money. Fails open, so it cannot lock out a paying user.
    const guard = await requireActiveTenant(supabase)
    if (!guard.ok) return guard.response

    // Step 2: Get strategy and count from request
    const body = await request.json()
    const { strategy, count } = body

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy is required' },
        { status: 400 }
      )
    }

    // Step 3: Load the REAL business profile (settings + branding + service_prices)
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    const profile = await loadBusinessProfile(supabase, tenantId)

    // Step 4: Generate post variations with AI
    const variations = await generatePostVariations(
      strategy as CampaignStrategy,
      profile,
      count || 5,
      tenantId
    )

    // Step 5: Fetch images for the whole batch in ONE Unsplash call, then give
    // each variation a different photo by index. Previously this called once
    // per variation with per_page=1, so every post got the same top result.
    const images = await searchUnsplashImagesForVariations(
      variations.map((v) => v.imageSuggestion || 'beauty cosmetics')
    )
    const variationsWithImages = variations.map((v, i) => ({
      ...v,
      image: images[i] ?? null, // { url, thumbUrl, photographerName, photographerUrl, description } or null
    }))

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