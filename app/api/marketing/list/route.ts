// app/api/marketing/list/route.ts
// Returns the logged-in tenant's saved campaigns + their posts.
// GET /api/marketing/list
//
// Multi-tenant: RLS + explicit tenant scoping ensure each business
// sees only her own campaigns.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
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
      return NextResponse.json({ campaigns: [] })
    }

    // Load campaigns (newest first)
    const { data: campaigns, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }

    // Load all posts for these campaigns in one query
    const campaignIds = (campaigns || []).map((c) => c.id)
    let postsByCampaign: Record<string, any[]> = {}
    if (campaignIds.length > 0) {
      const { data: posts } = await supabase
        .from('campaign_posts')
        .select('*')
        .in('campaign_id', campaignIds)
        .order('variation_number', { ascending: true })
      ;(posts || []).forEach((p) => {
        if (!postsByCampaign[p.campaign_id]) postsByCampaign[p.campaign_id] = []
        postsByCampaign[p.campaign_id].push(p)
      })
    }

    const result = (campaigns || []).map((c) => ({
      ...c,
      posts: postsByCampaign[c.id] || [],
    }))

    return NextResponse.json({ campaigns: result })
  } catch (error) {
    console.error('Error in /api/marketing/list:', error)
    return NextResponse.json({ error: 'טעינת הקמפיינים נכשלה' }, { status: 500 })
  }
}
