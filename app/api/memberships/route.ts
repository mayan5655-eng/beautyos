// app/api/memberships/route.ts
//
// Her side of client memberships (lib/memberships.ts). Signed in; the tenant comes from the SESSION only, never from the body.
//   GET  ?view=status                -> { available }
//   GET  ?view=dashboard             -> plans, members (status, next charge, credits), and the numbers: active, MRR, failed charges
//   GET  ?view=client&clientId=      -> the client card: her membership (if any), its credits and link, and the plans she can join
//   GET  ?view=till&clientId=        -> the till: an active membership with credits ("יש לה מנוי: נשארו 1 מתוך 2")
//   POST { action: 'save-plan', plan, planId? } | { action: 'plan-active', planId, active }
//   POST { action: 'enroll', clientId, planId }   -> an enrollment waiting for the client's tick, and its link (she sends it herself)
//   POST { action: 'pause' | 'resume' | 'cancel' | 'retry', membershipId }
//   POST { action: 'redeem', membershipId, clientId, receiptId, service }   -> the till used one credit on this receipt
//
// NEXT_PUBLIC_CLIENT_MEMBERSHIPS off -> 404: the route does not exist. Grow off for her, no saved-card credentials, Grow not connected,
// or the migration not run -> { available: false } and nothing else. Sends NOTHING to any client: the link is handed to her to send.
import { NextResponse } from 'next/server';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';
import {
  sanitizePlan, createEnrollment, ownerAction, redeemCredit, creditsOf, dashboardOf, israelDay, planLineHe, consentTextHe, clientCancelFrom,
  STATUS_HE, LIVE_STATUSES,
} from '@/lib/memberships';
import type { Membership, MembershipDeps, Period, Redemption } from '@/lib/memberships';
import { requestWaLink } from '@/lib/grow/paymentRequest';
import { checkTenantLimit } from '@/lib/rateLimit';
import { admin, caller } from '../grow/_shared';
import { membershipDeps, readyFor, membershipLinkUrl } from './_deps';

const notFound = () => NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const unavailable = (migration = true) => NextResponse.json({ success: true, available: false, ...(migration ? {} : { needsMigration: true }) });

function memberView(m: Membership, periods: Period[], reds: Redemption[], today: string) {
  const mine = periods.filter((p) => p.membership_id === m.id);
  const credits = creditsOf(m, mine, reds, today);
  const lastFailed = [...mine].reverse().find((p) => p.status === 'failed' || p.status === 'unknown') || null;
  return {
    id: m.id, clientId: m.client_id, clientName: m.client_name, plan: m.plan, planLine: planLineHe(m.plan), status: m.status, statusHe: STATUS_HE[m.status],
    pauseReason: m.pause_reason, nextChargeOn: m.next_charge_on, nextRetryOn: m.next_retry_on, failedAttempts: m.failed_attempts, startedOn: m.started_on,
    consentedAt: m.consented_at, consentText: m.consent_text, cancelledAt: m.cancelled_at, cancelledBy: m.cancelled_by,
    paidMonths: mine.filter((p) => p.status === 'paid').length, credits: { available: credits.available, label: credits.labelHe },
    lastFailed: lastFailed && m.status !== 'active' ? { on: lastFailed.first_failed_on || lastFailed.period_start, attempts: lastFailed.attempts, status: lastFailed.status } : null,
    clientCancelFrom: clientCancelFrom(m, mine),
  };
}

async function load(d: MembershipDeps, tenantId: string, clientId?: string) {
  const ms = await d.repo.listMemberships(tenantId, clientId ? { clientId } : {});
  const ids = ms.map((m) => m.id);
  const [periods, reds] = await Promise.all([d.repo.listPeriods(tenantId, ids), d.repo.listRedemptions(tenantId, ids)]);
  return { ms, periods, reds };
}

export async function GET(request: Request) {
  if (!clientMembershipsEnabled()) return notFound();
  const c = await caller();
  if ('error' in c) return c.error;
  const d = membershipDeps();
  try {
    const r = await readyFor(d, c.tenantId);
    if (!r.ready || !d) return unavailable(r.migration);
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'status';
    const clientId = url.searchParams.get('clientId') || '';
    const today = israelDay(new Date());
    if (view === 'status') return NextResponse.json({ success: true, available: true });

    if (view === 'dashboard') {
      const [plans, all] = await Promise.all([d.repo.listPlans(c.tenantId), load(d, c.tenantId)]);
      const members = all.ms.map((m) => memberView(m, all.periods, all.reds, today));
      return NextResponse.json({ success: true, available: true, plans: plans.map((p) => ({ ...p, line: planLineHe(p) })), members, stats: dashboardOf(all.ms, all.periods, today) });
    }

    if (!clientId) return bad('חסרה לקוחה');
    const mine = await load(d, c.tenantId, clientId);
    const live = mine.ms.find((m) => LIVE_STATUSES.includes(m.status)) || null;

    if (view === 'till') {
      if (!live || !['active', 'past_due', 'paused', 'attention'].includes(live.status)) {
        // A cancelled membership whose paid month has credits left still counts at the till.
        const ended = mine.ms.find((m) => m.status === 'cancelled' && creditsOf(m, mine.periods, mine.reds, today).available > 0);
        if (!ended) return NextResponse.json({ success: true, available: true, membership: null });
        const credits = creditsOf(ended, mine.periods, mine.reds, today);
        return NextResponse.json({ success: true, available: true, membership: { id: ended.id, planName: ended.plan.name, services: ended.plan.services, available: credits.available, label: credits.labelHe } });
      }
      const credits = creditsOf(live, mine.periods, mine.reds, today);
      return NextResponse.json({ success: true, available: true, membership: { id: live.id, planName: live.plan.name, services: live.plan.services, available: credits.available, label: credits.labelHe, status: live.status } });
    }

    if (view === 'client') {
      const plans = (await d.repo.listPlans(c.tenantId)).filter((p) => p.active);
      const shown = live || mine.ms[0] || null;
      const waiting = shown && (shown.status === 'awaiting_consent' || shown.status === 'awaiting_card');
      const biz = waiting ? await d.repo.businessName(c.tenantId) : '';
      return NextResponse.json({
        success: true, available: true,
        plans: plans.map((p) => ({ id: p.id, name: p.name, price: p.price, credits: p.credits, rollover: p.rollover, min_months: p.min_months, services: p.services, line: planLineHe(p) })),
        membership: shown ? { ...memberView(shown, mine.periods, mine.reds, today), link: waiting ? membershipLinkUrl(shown.link_id) : null, consentPreview: waiting ? consentTextHe(shown.plan, biz) : null } : null,
      });
    }
    return bad('בקשה לא מוכרת');
  } catch (e) {
    console.error('[memberships] read failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'lookup_failed' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!clientMembershipsEnabled()) return notFound();
  const c = await caller();
  if ('error' in c) return c.error;
  const limited = checkTenantLimit(c.tenantId, 'memberships');
  if (limited) return limited;
  const d = membershipDeps();
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const str = (k: string) => String(b[k] ?? '').trim();
  try {
    const r = await readyFor(d, c.tenantId);
    if (!r.ready || !d) return unavailable(r.migration);

    if (action === 'save-plan') {
      const s = sanitizePlan(b.plan);
      if (!s.ok) return bad(s.error);
      const planId = str('planId');
      if (planId) {
        // Editing a plan changes it for NEW enrollments only: every membership keeps the snapshot its client agreed to.
        const p = await d.repo.updatePlan(c.tenantId, planId, s.plan);
        return p ? NextResponse.json({ success: true, plan: p }) : bad('המנוי לא נמצא', 404);
      }
      const p = await d.repo.insertPlan({ tenant_id: c.tenantId, ...s.plan, active: true });
      return NextResponse.json({ success: true, plan: p });
    }
    if (action === 'plan-active') {
      // Never deleted: a plan is switched off (no new enrollments), and turned back on the same way.
      const p = await d.repo.updatePlan(c.tenantId, str('planId'), { active: b.active === true });
      return p ? NextResponse.json({ success: true, plan: p }) : bad('המנוי לא נמצא', 404);
    }
    if (action === 'enroll') {
      const e = await createEnrollment(d, { tenantId: c.tenantId, clientId: str('clientId'), planId: str('planId') });
      if (!e.ok) return bad(e.error, e.code === 'exists' ? 409 : 400);
      const link = membershipLinkUrl(e.membership.link_id);
      const biz = await d.repo.businessName(c.tenantId);
      const first = String(e.membership.client_name || '').trim().split(/\s+/)[0] || '';
      const message = `היי${first ? ` ${first}` : ''} 🌸 זה הקישור להצטרפות למנוי "${e.membership.plan.name}"${biz ? ` אצל ${biz}` : ''}. אפשר לקרוא את התנאים ולשמור כרטיס בדף המאובטח: ${link}`;
      // The link goes to HER. She sends it from her own WhatsApp, or opens it on her device with the client next to her.
      return NextResponse.json({ success: true, membership: { id: e.membership.id, status: e.membership.status }, link, message, waLink: requestWaLink(e.membership.client_phone, message) });
    }
    if (action === 'pause' || action === 'resume' || action === 'cancel' || action === 'retry') {
      const x = await ownerAction(d, { tenantId: c.tenantId, membershipId: str('membershipId'), action });
      if (!x.ok) return bad(x.error, x.code === 'gone' ? 404 : 409);
      const charge = x.charge?.outcome;
      return NextResponse.json({ success: true, status: x.membership.status, statusHe: STATUS_HE[x.membership.status], charge: charge || null });
    }
    if (action === 'redeem') {
      const receiptId = str('receiptId');
      if (!receiptId) return bad('חסר אישור תשלום');
      // The receipt must be one of HER receipts, for THIS client: a receipt id from the body is never trusted on its own.
      const { data: rc, error } = await admin().from('receipts').select('id, client_id').eq('id', receiptId).eq('tenant_id', c.tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!rc || String((rc as { client_id: unknown }).client_id) !== str('clientId')) return bad('אישור התשלום לא נמצא ללקוחה הזו', 404);
      const x = await redeemCredit(d, { tenantId: c.tenantId, membershipId: str('membershipId'), clientId: str('clientId'), receiptId, service: str('service') });
      if (!x.ok) return bad(x.error, x.code === 'gone' ? 404 : 409);
      return NextResponse.json({ success: true, already: x.already, label: x.credits.labelHe, available: x.credits.available });
    }
    return bad('פעולה לא מוכרת');
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (/client_memberships_one_live_uniq|duplicate key/i.test(msg) && action === 'enroll') return bad('ללקוחה כבר יש מנוי פעיל או ממתין', 409);
    console.error('[memberships] action failed:', action, msg);
    return NextResponse.json({ success: false, error: 'משהו נתקע, נסי שוב בעוד רגע' }, { status: 500 });
  }
}
