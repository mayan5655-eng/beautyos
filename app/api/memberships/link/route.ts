// app/api/memberships/link/route.ts
//
// The client's side of a membership, from the link her cosmetician sent her (/pay/membership/<link id>). Public, no login: the 192-bit
// link id is the authorisation and opens that ONE membership only. It shows nothing else of the business or of other clients.
//   GET  ?t=<link id>                                    -> the terms she is asked to agree to (or agreed to), the status, her credits
//   POST { t, action: 'start', agree: true, consentText } -> freezes the consent words and opens Grow's save-only card page { url }
//   POST { t, action: 'cancel' }                          -> cancels per the plan's terms (after the minimum months)
// NEXT_PUBLIC_CLIENT_MEMBERSHIPS off -> 404. Rate limited per device and per business. Sends no message to anyone but an in-app
// notice to the business owner when the client cancels.
import { NextResponse } from 'next/server';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';
import { consentTextHe, startCardPage, clientCancel, creditsOf, clientCancelFrom, israelDay, planLineHe, dayHe } from '@/lib/memberships';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { admin } from '../../grow/_shared';
import { membershipDeps, readyFor, membershipLinkUrl } from '../_deps';

const notFound = () => NextResponse.json({ success: false, error: 'הקישור לא נמצא' }, { status: 404 });
const LINK_RE = /^[0-9a-f]{48}$/;

export async function GET(request: Request) {
  if (!clientMembershipsEnabled()) return notFound();
  const limited = checkIpLimit(request, 'membership-link');
  if (limited) return limited;
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!LINK_RE.test(t)) return notFound();
  const d = membershipDeps();
  if (!d) return notFound();
  try {
    const m = await d.repo.findMembershipByLink(t);
    if (!m) return notFound();
    const tl = checkTenantLimit(m.tenant_id, 'membership-link');
    if (tl) return tl;
    const ready = await readyFor(d, m.tenant_id);
    const { data: st } = await admin().from('settings').select('business_name, primary_color').eq('tenant_id', m.tenant_id).maybeSingle();
    const businessName = String((st as { business_name?: unknown } | null)?.business_name || '').trim();
    const periods = await d.repo.listPeriods(m.tenant_id, [m.id]);
    const reds = await d.repo.listRedemptions(m.tenant_id, [m.id]);
    const today = israelDay(new Date());
    const waiting = m.status === 'awaiting_consent' || m.status === 'awaiting_card';
    const from = clientCancelFrom(m, periods);
    return NextResponse.json({
      success: true,
      businessName,
      accent: String((st as { primary_color?: unknown } | null)?.primary_color || ''),
      clientFirstName: String(m.client_name || '').trim().split(/\s+/)[0] || '',
      plan: { name: m.plan.name, line: planLineHe(m.plan), price: m.plan.price, credits: m.plan.credits, rollover: m.plan.rollover, minMonths: m.plan.min_months, services: m.plan.services },
      status: m.status,
      // The words to tick: the frozen ones once she agreed, otherwise the ones computed from the plan as it was when she was enrolled.
      consentText: m.consent_text || consentTextHe(m.plan, businessName),
      consentedAt: m.consented_at,
      // A link whose business can no longer take a card (Grow disconnected) does not offer the step.
      canStart: waiting && ready.ready,
      nextChargeOn: m.next_charge_on ? dayHe(m.next_charge_on) : null,
      // Right after the card is saved the first month is still being charged: say so, rather than "nothing available".
      credits: waiting ? null : m.status === 'active' && !periods.some((p) => p.status === 'paid') ? 'החודש הראשון מחויב עכשיו, הטיפולים יופיעו כאן מיד אחרי' : creditsOf(m, periods, reds, today).labelHe,
      canCancel: m.status !== 'cancelled' && !waiting && !(from && from > today),
      cancelFrom: from && from > today ? dayHe(from) : null,
    });
  } catch (e) {
    console.error('[memberships] link read failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע, נסי שוב בעוד רגע' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!clientMembershipsEnabled()) return notFound();
  const limited = checkIpLimit(request, 'membership-link');
  if (limited) return limited;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const t = String(b.t || '');
  if (!LINK_RE.test(t)) return notFound();
  const d = membershipDeps();
  if (!d) return notFound();
  try {
    const m = await d.repo.findMembershipByLink(t);
    if (!m) return notFound();
    const tl = checkTenantLimit(m.tenant_id, 'membership-link');
    if (tl) return tl;
    if (b.action === 'start') {
      const ready = await readyFor(d, m.tenant_id);
      if (!ready.ready) return NextResponse.json({ success: false, error: 'ההצטרפות לא זמינה כרגע. אפשר לפנות לבעלת העסק.' }, { status: 409 });
      const r = await startCardPage(d, { linkId: t, agree: b.agree === true, consentText: String(b.consentText || ''), returnUrl: membershipLinkUrl(t) });
      return r.ok ? NextResponse.json({ success: true, url: r.url }) : NextResponse.json({ success: false, code: r.code, error: r.error }, { status: r.code === 'gone' ? 410 : 409 });
    }
    if (b.action === 'cancel') {
      const r = await clientCancel(d, { linkId: t });
      return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ success: false, code: r.code, error: r.error }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'בקשה לא מוכרת' }, { status: 400 });
  } catch (e) {
    console.error('[memberships] link action failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'משהו נתקע, נסי שוב בעוד רגע' }, { status: 500 });
  }
}
