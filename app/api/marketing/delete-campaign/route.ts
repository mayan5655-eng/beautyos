// app/api/marketing/delete-campaign/route.ts
// Deletes a campaign (and its posts) for the logged-in tenant.
// POST /api/marketing/delete-campaign  { campaignId }

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
    const { campaignId } = await request.json()
    if (!campaignId) {
      return NextResponse.json({ error: 'חסר מזהה קמפיין' }, { status: 400 })
    }

    // Delete posts first (scoped to tenant), then the campaign (scoped to tenant)
    await supabase
      .from('campaign_posts')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('tenant_id', tenantId)

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in /api/marketing/delete-campaign:', error)
    return NextResponse.json({ error: 'מחיקה נכשלה' }, { status: 500 })
  }
}
