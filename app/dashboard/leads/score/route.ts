// app/api/leads/score/route.ts
// Manual AI scoring endpoint - useful for testing and re-scoring existing leads
// Usage: GET /api/leads/score?id=<lead_id>

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { scoreLead } from '../../../../lib/ai/scoreLeads';

export async function GET(request: NextRequest) {
  try {
    // Get lead ID from query string
    const searchParams = request.nextUrl.searchParams;
    const leadId = searchParams.get('id');

    if (!leadId) {
      return NextResponse.json(
        { error: 'Missing lead id. Use ?id=<lead_id>' },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch the lead from DB
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Run AI scoring
    const aiScore = await scoreLead({
      fullName: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      customFields: lead.raw_data || {},
      source: lead.source || 'manual',
      campaignName: lead.facebook_ad_id || undefined,
    });

    // Save the results back to the lead
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        ai_score: aiScore.score,
        ai_category: aiScore.category,
        ai_reasoning: aiScore.reasoning,
        ai_tags: aiScore.tags,
        ai_suggested_action: aiScore.suggestedAction,
      })
      .eq('id', leadId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save AI results: ' + updateError.message },
        { status: 500 }
      );
    }

    // Return the result so you can see it in the browser
    return NextResponse.json({
      success: true,
      lead_id: leadId,
      ai_result: aiScore,
    });
  } catch (error) {
    console.error('Manual scoring error:', error);
    return NextResponse.json(
      { error: 'Server error: ' + String(error) },
      { status: 500 }
    );
  }
}