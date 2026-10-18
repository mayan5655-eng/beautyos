// app/api/grow/policy/route.ts
//
// The cosmetician's cancellation policy (Settings > connections > Grow). Visible and editable only while she is connected to Grow.
//   GET   -> { connected, policy }   the stored policy, or the default (mode off)
//   POST  { policy } -> saves it, after clamping every field (lib/cancellationPolicy.sanitizePolicy)
// It lives in its own table (grow_cancel_policies), not in settings.branding, so the dashboard's whole-settings save can never overwrite it.
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { DEFAULT_POLICY, sanitizePolicy, defaultPolicyText } from '@/lib/cancellationPolicy';
import { admin, caller, tableMissing, DEMO_NOTE } from '../_shared';

export async function GET() {
  const c = await caller();
  if ('error' in c) return c.error;
  const db = admin();
  const acc = await db.from('grow_accounts').select('enabled').eq('tenant_id', c.tenantId).maybeSingle();
  const connected = !!acc.data && acc.data.enabled === true;
  const row = await db.from('grow_cancel_policies').select('policy').eq('tenant_id', c.tenantId).maybeSingle();
  if (row.error) {
    if (tableMissing(row.error)) return NextResponse.json({ success: true, connected, tableReady: false, policy: { ...DEFAULT_POLICY, text: defaultPolicyText(DEFAULT_POLICY) } });
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את מדיניות הביטולים' }, { status: 500 });
  }
  return NextResponse.json({ success: true, connected, tableReady: true, policy: row.data ? sanitizePolicy(row.data.policy) : { ...DEFAULT_POLICY, text: defaultPolicyText(DEFAULT_POLICY) } });
}

export async function POST(request: Request) {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: DEMO_NOTE }, { status: 403 });
  const db = admin();
  const acc = await db.from('grow_accounts').select('enabled').eq('tenant_id', c.tenantId).maybeSingle();
  if (!acc.data || acc.data.enabled !== true) return NextResponse.json({ success: false, error: 'כדי להגדיר מדיניות ביטולים צריך לחבר ולהפעיל את Grow' }, { status: 409 });

  const body = (await request.json().catch(() => ({}))) as { policy?: unknown };
  const policy = sanitizePolicy(body.policy);
  if (policy.mode === 'deposit' && !(policy.deposit.value > 0)) return NextResponse.json({ success: false, error: 'במצב מקדמה צריך לקבוע סכום מקדמה' }, { status: 400 });
  if (policy.mode === 'saved_card' && !(policy.lateFee.value > 0) && !(policy.noShowFee.value > 0)) return NextResponse.json({ success: false, error: 'צריך לקבוע לפחות דמי ביטול אחד' }, { status: 400 });

  const { error } = await db.from('grow_cancel_policies').upsert({ tenant_id: c.tenantId, policy, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'מדיניות ביטולים עוד לא הופעלה בחשבון (חסרה הרצת מיגרציה)' }, { status: 409 });
    console.error('[grow] policy save failed:', error.message);
    return NextResponse.json({ success: false, error: 'השמירה נכשלה, נסי שוב' }, { status: 500 });
  }
  return NextResponse.json({ success: true, policy });
}
