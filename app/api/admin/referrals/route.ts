// app/api/admin/referrals/route.ts
//
// POST { referralId, action: 'void', reason? } -> the platform owner voids a referral (a refund she gave in Grow, a business that was
// really the same person, abuse). The referral becomes 'voided' and every month it earned that was NOT used yet is voided; the billing
// run also refuses a month whose referral is voided (lib/billing/service.ts useFreeMonth). A month already used stays used: nothing is
// clawed back from a business. Nothing is deleted.
//
// requirePlatformAdmin() runs FIRST; a non-admin gets 404. The referral id comes from the body, which is correct here only: an admin acts
// on other businesses. Service-role writes.
import { NextResponse } from 'next/server';
import { requirePlatformAdmin, createAdminClient } from '@/lib/adminGuard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const adminCheck = await requirePlatformAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.referralId === 'string' ? body.referralId : '';
  if (!UUID_RE.test(id) || body?.action !== 'void') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const reason = (typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'בוטל בפאנל הניהול').slice(0, 200);
  const now = new Date().toISOString();
  const db = createAdminClient();
  const ref = await db.from('referrals').update({ status: 'voided', voided_at: now, void_reason: reason }).eq('id', id).neq('status', 'voided').select('id');
  if (ref.error) return NextResponse.json({ error: 'לא נשמר' }, { status: 500 });
  const rw = await db.from('referral_rewards').update({ voided_at: now, void_reason: reason }).eq('referral_id', id).is('consumed_at', null).is('voided_at', null).select('id');
  if (rw.error) return NextResponse.json({ error: 'ההפניה בוטלה, אבל החודשים לא. נסי שוב' }, { status: 500 });
  console.log('[referrals] voided by admin', adminCheck.userId, 'referral', id, 'months voided', rw.data?.length || 0);
  return NextResponse.json({ success: true, voidedMonths: rw.data?.length || 0 });
}
