// app/api/marketing/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('id');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 1: Delete campaign_posts first (Foreign Key constraint)
    const { error: postsError } = await supabase
      .from('campaign_posts')
      .delete()
      .eq('campaign_id', campaignId);

    if (postsError) {
      console.error('Error deleting posts:', postsError);
      return NextResponse.json(
        { error: 'Failed to delete campaign posts' },
        { status: 500 }
      );
    }

    // Step 2: Delete the campaign itself
    const { error: campaignError } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (campaignError) {
      console.error('Error deleting campaign:', campaignError);
      return NextResponse.json(
        { error: 'Failed to delete campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'הקמפיין נמחק בהצלחה'
    });

  } catch (error: any) {
    console.error('Error in /api/marketing/delete:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}