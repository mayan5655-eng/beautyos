// app/api/ad-spend/route.ts
//
// Her advertising spend, for the "Revenue by source" report.
//   GET    ?from=YYYY-MM-DD&to=YYYY-MM-DD -> { available, rows }   (available:false while the migration is not run)
//   POST   { day, source, amount }         -> a manual entry (origin 'manual'), replacing that day+source
//   DELETE ?id=<uuid>                      -> removes one MANUAL entry of hers; Facebook rows are never deleted here
//
// The tenant comes from her session. Writes use the service role because the table grants the browser SELECT only.

import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { callerTenantId } from '@/lib/tenantScope';
import { isDemoTenantId } from '@/lib/demoTenants';
import { parseManualSpend } from '@/lib/adSpend';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message || ''));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEMO_NOTE = 'זו תצוגה - במערכת שלך זה נשמר באמת';

async function who() {
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 }) };
  const tenantId = await callerTenantId(session);
  if (!tenantId) return { error: NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 403 }) };
  return { session, tenantId };
}

export async function GET(request: Request) {
  const w = await who();
  if ('error' in w) return w.error;
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  // The service role for her own tenant, the same client the writes use: a session read could come back empty under RLS while the write succeeded.
  let q = admin().from('ad_spend').select('id, day, source, amount, origin').eq('tenant_id', w.tenantId).order('day', { ascending: false }).limit(2000);
  if (DAY.test(from)) q = q.gte('day', from);
  if (DAY.test(to)) q = q.lte('day', to);
  const { data, error } = await q;
  if (error) {
    if (missing(error)) return NextResponse.json({ success: true, available: false, rows: [] });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את ההוצאות' }, { status: 500 });
  }
  return NextResponse.json({ success: true, available: true, rows: data || [] });
}

export async function POST(request: Request) {
  const w = await who();
  if ('error' in w) return w.error;
  if (isDemoTenantId(w.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const parsed = parseManualSpend(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  const { error } = await admin().from('ad_spend').upsert(
    { tenant_id: w.tenantId, day: parsed.value.day, source: parsed.value.source, amount: parsed.value.amount, origin: 'manual', campaign_id: '', updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,day,origin,source,campaign_id' },
  );
  if (error) {
    if (missing(error)) return NextResponse.json({ success: false, error: 'הוצאות פרסום עוד לא הופעלו בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
    console.error('[ad-spend] manual write failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const w = await who();
  if ('error' in w) return w.error;
  if (isDemoTenantId(w.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: 'מזהה לא תקין' }, { status: 400 });
  const { error } = await admin().from('ad_spend').delete().eq('id', id).eq('tenant_id', w.tenantId).eq('origin', 'manual');
  if (error) return NextResponse.json({ success: false, error: 'המחיקה נכשלה' }, { status: 500 });
  return NextResponse.json({ success: true });
}
