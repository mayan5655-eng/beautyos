// app/dashboard/marketing/[id]/page.tsx
// Server Component - loads a single campaign with its posts

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CampaignClient from './CampaignClient'

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: tenantId } = await supabase.rpc('get_user_tenant_id')

  // Load campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!campaign) {
    notFound()
  }

  // Load posts
  const { data: posts } = await supabase
    .from('campaign_posts')
    .select('*')
    .eq('campaign_id', id)
    .order('variation_number', { ascending: true })

  // Load this tenant's settings (business color, name, phone for the designed post)
  const { data: settingsRows } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)

  const settings = settingsRows && settingsRows.length > 0 ? settingsRows[0] : null

  return (
    <div dir="rtl">
      <CampaignClient campaign={campaign} posts={posts || []} settings={settings} />
    </div>
  )
}