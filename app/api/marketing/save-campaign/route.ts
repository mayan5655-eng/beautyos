// app/api/marketing/save-campaign/route.ts
// Saves a generated campaign + its post variations.
// POST /api/marketing/save-campaign
//
// Multi-tenant: writes are scoped to the logged-in user's tenant.
// Creates one row in `campaigns`, then its posts in `campaign_posts`.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) {
      return NextResponse.json({ error: 'לא זוהה עסק' }, { status: 400 })
    }

    const body = await request.json()
    const { name, goal, strategy, variations } = body
    if (!goal || !variations || variations.length === 0) {
      return NextResponse.json({ error: 'חסרים פרטי קמפיין' }, { status: 400 })
    }

    // 1. Insert the campaign row (tenant_id + created_by are set explicitly)
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: tenantId,
        created_by: user.id,
        name: name || goal.slice(0, 40),
        goal,
        status: 'draft',
        ai_strategy: strategy?.strategy || null,
        ai_tone: strategy?.tone || null,
        ai_key_points: strategy?.keyPoints || null,
      })
      .select()
      .single()

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }

    // 2. Insert the post variations, linked to the campaign
    const postsToInsert = variations.map((v: any, i: number) => ({
      campaign_id: campaign.id,
      tenant_id: tenantId,
      title: v.title || '',
      body: v.body || '',
      call_to_action: v.callToAction || '',
      hashtags: v.hashtags || [],
      image_suggestion: v.imageSuggestion || '',
      variation_number: v.variationNumber || i + 1,
      variation_type: v.variationType || '',
    }))

    const { error: pErr } = await supabase.from('campaign_posts').insert(postsToInsert)
    if (pErr) {
      // campaign saved but posts failed - report it
      return NextResponse.json({ error: pErr.message, campaignId: campaign.id }, { status: 500 })
    }

    return NextResponse.json({ success: true, campaignId: campaign.id })
  } catch (error) {
    console.error('Error in /api/marketing/save-campaign:', error)
    return NextResponse.json({ error: 'שמירת הקמפיין נכשלה' }, { status: 500 })
  }
}
