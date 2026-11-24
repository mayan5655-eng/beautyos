// app/api/settings/voice-example/route.ts
//
// POST { text } -> { success, voice_examples, branding }
//
// "זה נשמע כמוני" in the post editor: a post text she edited and likes becomes one of her three voice samples
// (settings.branding.voice_examples, lib/ai/voiceExamples.ts), which every generator then writes in. Only on her
// tap, never silently - she sees and can remove every sample under Settings > "פוסטים שאת אוהבת".
//
// Same shape as /api/settings/save: tenant from HER session, never the body; the write goes through the service
// client because the browser has no write grant on settings (add_settings_write_guard.sql). Touches one key of the
// branding bag and nothing else.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { requireActiveTenant } from '@/lib/planGuard';
import { addVoiceExample } from '@/lib/ai/voiceExamples';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const guard = await requireActiveTenant(session);
  if (!guard.ok) return guard.response;
  const { data: tenantId, error: tErr } = await session.rpc('get_user_tenant_id');
  if (tErr || !tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const db = admin();
  const { data: row, error: readErr } = await db.from('settings').select('branding').eq('tenant_id', tenantId).maybeSingle();
  if (readErr || !row) {
    console.error('[voice-example] read failed:', readErr?.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
  const branding = row.branding && typeof row.branding === 'object' && !Array.isArray(row.branding) ? row.branding as Record<string, unknown> : {};
  const next = addVoiceExample(branding.voice_examples, body?.text);
  if (!next) return NextResponse.json({ success: false, error: 'הטקסט קצר מדי כדי ללמוד ממנו את הקול שלך' }, { status: 400 });

  const nextBranding = { ...branding, voice_examples: next };
  const { error } = await db.from('settings').update({ branding: nextBranding }).eq('tenant_id', tenantId);
  if (error) {
    console.error('[voice-example] write failed:', error.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
  return NextResponse.json({ success: true, voice_examples: next, branding: nextBranding });
}
