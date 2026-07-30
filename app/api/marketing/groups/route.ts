// app/api/marketing/groups/route.ts
// API endpoint that suggests Facebook groups using AI
// POST /api/marketing/groups

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveTenant } from '@/lib/planGuard'
import { suggestFacebookGroups } from '@/lib/ai/marketingAI'
import { loadBusinessProfile } from '@/lib/ai/loadBusinessProfile'

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

    // Step 2: Get count from request (optional)
    const body = await request.json().catch(() => ({}))
    const { count } = body

    // Step 3: Load the REAL business profile (settings + branding + service_prices)
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    const profile = await loadBusinessProfile(supabase, tenantId)

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