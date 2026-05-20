// app/api/marketing/save/route.ts
// API endpoint that saves a complete campaign to the database
// Saves to 2 tables: campaigns + campaign_posts
// POST /api/marketing/save

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SaveRequest = {
  campaignData: {
    name: string
    goal: string
    target_audience: string
    service_type: string
  }
  strategy: {
    strategy: string
    tone: string
    keyPoints: string[]
    audienceInsights: string
  }
  variations: Array<{
    variationNumber: number
    variationType: string
    title: string
    body: string
    callToAction: string
    hashtags: string[]
    imageSuggestion: string
    image?: {
      url: string
      photographerName: string
    } | null
  }>
}

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

    // Step 2: Get tenant ID
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')

    if (!tenantId) {
      return NextResponse.json(
        { error: 'No tenant found for user' },
        { status: 400 }
      )
    }

    // Step 3: Parse request body
    const body = (await request.json()) as SaveRequest
    const { campaignData, strategy, variations } = body

    if (!campaignData?.goal) {
      return NextResponse.json(
        { error: 'Campaign goal is required' },
        { status: 400 }
      )
    }

    // Step 4: Save the campaign (parent record)
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: tenantId,
        name: campaignData.name || 'קמפיין ללא שם',
        goal: campaignData.goal,
        target_audience: campaignData.target_audience || null,
        service_type: campaignData.service_type || null,
        status: 'draft',
        ai_strategy: strategy?.strategy || null,
        ai_tone: strategy?.tone || null,
        ai_key_points: strategy?.keyPoints || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (campaignError || !campaign) {
      console.error('Error saving campaign:', campaignError)
      return NextResponse.json(
        { error: 'Failed to save campaign', details: campaignError?.message },
        { status: 500 }
      )
    }

    // Step 5: Save the post variations (children records)
    if (variations && variations.length > 0) {
      const postsToInsert = variations.map((v) => ({
        campaign_id: campaign.id,
        tenant_id: tenantId,
        title: v.title,
        body: v.body,
        call_to_action: v.callToAction,
        hashtags: v.hashtags,
        image_suggestion: v.imageSuggestion,
        variation_number: v.variationNumber,
        variation_type: v.variationType,
        is_winner: false,
        total_copies: 0,
        total_leads: 0,
      }))

      const { error: postsError } = await supabase
        .from('campaign_posts')
        .insert(postsToInsert)

      if (postsError) {
        console.error('Error saving posts:', postsError)
        // Note: Campaign saved but posts failed - that's ok, can retry later
      }
    }

    // Step 6: Return the saved campaign ID
    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      message: 'הקמפיין נשמר בהצלחה!',
    })
  } catch (error) {
    console.error('Error in /api/marketing/save:', error)
    return NextResponse.json(
      { error: 'Failed to save campaign' },
      { status: 500 }
    )
  }
}