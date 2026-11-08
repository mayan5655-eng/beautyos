// app/api/referrals/me/route.ts
//
// GET -> the Settings card of "חברה מביאה חברה" (app/BusinessReferralCard.jsx), for HER business only:
//   { ready, code, link, share, stats: { joined, paid, earned, used, waiting, available }, holdDays }
// The tenant comes from her session, never from the request. Counts only: no other business's name or id ever leaves this route.
// Her code is made here the first time (service role; the browser cannot write referral_codes), and only while her plan is active
// (requireActiveTenant): a business on hold still sees her counts, but no new link is made for her.
//
// Behind NEXT_PUBLIC_REFERRALS (lib/referral.ts): while off it answers { success: false, hidden: true } and touches nothing. Before
// add_referrals_annual_2026-11-08.sql runs it answers { ready: false } (the card says the feature is not ready yet).
import { NextResponse } from 'next/server';
import { createClient as createSession } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { callerTenantId } from '@/lib/tenantScope';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkTenantLimit } from '@/lib/rateLimit';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { referralsEnabled, newReferralCode, referralLink, referralWhatsAppHref, referralStats, REFERRAL_HOLD_DAYS } from '@/lib/referral';

export const dynamic = 'force-dynamic';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const unique = (e: { code?: string; message?: string } | null) => !!e && (e.code === '23505' || /duplicate key|unique/i.test(e.message || ''));

export async function GET() {
  if (!referralsEnabled()) return NextResponse.json({ success: false, hidden: true });
  const session = await createSession();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
  const tenantId = await callerTenantId(session);
  if (!tenantId) return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 403 });
  const limited = checkTenantLimit(tenantId, 'referral-card');
  if (limited) return limited;
  if (isDemoTenantId(tenantId)) return NextResponse.json({ success: true, ready: true, demo: true, code: null, link: null, share: null, stats: referralStats([], [], new Date()), holdDays: REFERRAL_HOLD_DAYS });

  const db = admin();
  const own = await db.from('referral_codes').select('code').eq('tenant_id', tenantId).maybeSingle();
  if (own.error) {
    if (missing(own.error)) return NextResponse.json({ success: true, ready: false });
    console.error('[referrals] code read failed:', own.error.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לטעון את קישור ההזמנה' }, { status: 500 });
  }

  let code: string | null = (own.data?.code as string | undefined) || null;
  let blocked = false;
  if (!code) {
    const guard = await requireActiveTenant(session);
    if (!guard.ok) blocked = true;
    else {
      // A fresh random code; a clash with another business's code draws again. Two tabs at once: the second insert hits her own row
      // (tenant_id is the key) and reads the code the first one made.
      for (let i = 0; i < 5 && !code; i++) {
        const fresh = newReferralCode();
        const ins = await db.from('referral_codes').insert({ tenant_id: tenantId, code: fresh });
        if (!ins.error) { code = fresh; break; }
        if (!unique(ins.error)) { console.error('[referrals] code insert failed:', ins.error.message); break; }
        const again = await db.from('referral_codes').select('code').eq('tenant_id', tenantId).maybeSingle();
        if (again.data?.code) code = again.data.code as string;
      }
    }
  }

  const [refs, rewards] = await Promise.all([
    db.from('referrals').select('status').eq('referrer_tenant_id', tenantId).limit(1000),
    db.from('referral_rewards').select('available_at, consumed_at, voided_at').eq('tenant_id', tenantId).limit(1000),
  ]);
  const stats = referralStats((refs.data || []) as { status: 'joined' }[], (rewards.data || []) as { available_at: string; consumed_at: string | null; voided_at: string | null }[], new Date());
  const link = code ? referralLink(APP_URL, code) : null;
  return NextResponse.json({ success: true, ready: true, blocked, code, link, share: link ? referralWhatsAppHref(link) : null, stats, holdDays: REFERRAL_HOLD_DAYS });
}
