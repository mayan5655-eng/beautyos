// app/api/grow/webhook/route.ts
//
// The one URL given to Grow: https://kalmea.app/api/grow/webhook. Grow sends three kinds of update here and signs none
// of them, so the first thing this route does is check the caller's address against Grow's published list
// (lib/grow/webhook.ts). Then it dispatches by the shape of the body:
//   payment     -> the existing payment logic (applyNotification / applyNotificationByProcess)
//   invoice     -> the existing invoice logic (applyInvoice / applyInvoiceByProcess)
//   onboarding  -> applyOnboarding: stored, and attached to a tenant only on an exact tracking-code match
//
// Answers: 403 for an address that is not Grow's, 400 for a body that is not an object, 405 for GET. For a request that
// came from Grow and looks valid it answers 200 with what happened, even when nothing matched, so Grow is not asked to
// retry something we will never accept. The one exception is a genuine storage failure (503, logged without the
// payload): Grow retrying then is what keeps the update from being lost.
//
// Nothing here logs a request body, a user_id or an api_key.
import { NextResponse, after } from 'next/server';
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { applyNotification, applyNotificationByProcess, applyInvoice, applyInvoiceByProcess, approveTransaction } from '@/lib/grow/service';
import type { GrowPayment } from '@/lib/grow/service';
import { approveCredsFor } from '@/lib/grow/wallet';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { supabaseOnboardingRepo } from '@/lib/grow/onboardingRepo';
import { applyOnboarding, classifyWebhook, clientIp, ipAllowed, ipCheckEnforced, parseWebhookBody, readOnboarding, readOnboardingApiKey } from '@/lib/grow/webhook';
import { encryptToken } from '@/lib/facebook/encryption';
import { admin } from '../_shared';
import { afterPaidHook, cancelDeps } from '../_cancel';
import { onCardTokenNotification } from '@/lib/grow/cancelFees';
import { readCardTokenNotification } from '@/lib/grow/tokenFlow';
import { readNotification } from '@/lib/grow/payload';
import { onMembershipCardToken, chargeMembership, isMembershipRef } from '@/lib/memberships';
import { membershipDeps } from '../../memberships/_deps';
import { moneyAlert } from '@/lib/moneyAlert.js';

export const maxDuration = 30;

// Keys carry the time so the hourly throttle never hides one: only Grow's addresses reach these lines (the IP gate above), so there
// is no flood to guard against, and each one is the evidence of what Grow sent.
/** Top-level field names only (no values): enough to see a payload shape we do not read, without logging anyone's data. */
function fieldNames(raw: Record<string, unknown>): string {
  const keys = Object.keys(raw);
  const data = raw.data && typeof raw.data === 'object' ? Object.keys(raw.data as Record<string, unknown>).map((k) => `data.${k}`) : [];
  return [...keys, ...data].slice(0, 40).join(',').slice(0, 600);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const ct = request.headers.get('content-type') || '';
  try {
    if (/multipart\/form-data/i.test(ct)) {
      const form = await request.formData();
      const out: Record<string, unknown> = {};
      form.forEach((v, k) => { if (typeof v === 'string') out[k] = v; });
      return Object.keys(out).length ? out : null;
    }
    return parseWebhookBody(await request.text(), ct);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (ipCheckEnforced() && !ipAllowed(ip)) {
    console.warn('[grow] webhook refused: address is not on Grow\'s list', ip || '(none)'); await moneyAlert('grow:ip-refused', 'Grow webhook refused: sender IP not on the allow list (add it to GROW_WEBHOOK_IPS if it is Grow)', { ip: ip || null, route: 'webhook' }, { key: ip || 'none' });
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
  }

  const raw = await readBody(request);
  if (!raw) {
    // Seen nowhere before 2026-11-09: a Grow update that did not parse left no trace at all. Field names and types only, never values.
    await moneyAlert('grow:webhook-unreadable', 'Grow webhook body could not be read', { ip: ip || null, contentType: (request.headers.get('content-type') || '').slice(0, 80) }, { severity: 'warning', key: `bad-body-${Date.now()}` });
    return NextResponse.json({ success: false, error: 'bad-body' }, { status: 400 });
  }

  const kind = classifyWebhook(raw);
  const token = new URL(request.url).searchParams.get('t') || '';
  try {
    const db = admin();
    const deps = () => ({
      repo: supabaseGrowRepo(db),
      creds: resolveGrow(process.env, APP_URL).creds || { apiKey: '', pageCode: '', apiBase: '' },
      appUrl: APP_URL,
      newToken: () => randomBytes(24).toString('hex'),
      afterPaid: afterPaidHook(),
    });

    if (kind === 'payment') {
      // The first transaction of a saved card (the client typed the card on the hosted page): store the sealed token for the business and client
      // that opened that page, then approveTransaction. Later charges of a token send no callback at all. A payment that is not a card page of ours
      // (a regular charge or a deposit) is not recognised here and goes on to the normal payment logic below.
      const tokenCb = readCardTokenNotification(raw);
      if (tokenCb) {
        const cd = cancelDeps();
        const tokenCreds = resolveGrow(process.env, APP_URL).tokenCreds;
        const first = readNotification(raw);
        const approve = tokenCreds && first ? () => approveTransaction(first, tokenCreds) : undefined;
        // A client membership's card page (lib/memberships.ts): its ref is "mbr" + the membership id. Tried first for that ref, and as a
        // fallback when no booking opened this process. Its first month is charged right after the answer (and by the daily run).
        const membership = async () => {
          const md = membershipDeps();
          if (!md) return null;
          const mr = await onMembershipCardToken(md, tokenCb, approve);
          if (mr.status === 'unknown-process') return null;
          const saved = mr.status === 'saved' ? mr.membership : undefined;
          if (saved) after(async () => { try { await chargeMembership(md, saved); } catch (e) { console.error('[memberships] first charge failed:', (e as Error)?.message); } });
          return NextResponse.json({ success: mr.status !== 'failed', kind: 'card-token', status: mr.status }, { status: mr.status === 'failed' ? 503 : 200 });
        };
        if (isMembershipRef(tokenCb.appointmentRef)) { const res = await membership(); if (res) return res; }
        if (cd) {
          const tr = await onCardTokenNotification(cd, tokenCb, approve);
          if (tr.status !== 'unknown-process') return NextResponse.json({ success: tr.status !== 'failed', kind: 'card-token', status: tr.status }, { status: tr.status === 'failed' ? 503 : 200 });
        }
        // The fallback never stands in the way of the payment logic below (a missing table, a read error: on to the payment as before).
        if (!isMembershipRef(tokenCb.appointmentRef)) { const res = await membership().catch(() => null); if (res) return res; }
      }
      const grow = resolveGrow(process.env, APP_URL);
      // The page code of the page the client paid on (wallet or card page), decided by the payment, not by which URL Grow reached first.
      const approve = (n: Parameters<typeof approveTransaction>[0], p: GrowPayment) => { const c = approveCredsFor(p, grow); return c ? approveTransaction(n, c, grow.fetchImpl) : Promise.resolve(); };
      const r = token ? await applyNotification(raw, token, deps(), approve) : await applyNotificationByProcess(raw, deps(), approve);
      return NextResponse.json({ success: true, kind, status: r.status === 'unknown-token' ? 'ignored' : r.status });
    }

    if (kind === 'invoice') {
      const r = token ? await applyInvoice(raw, token, deps()) : await applyInvoiceByProcess(raw, deps());
      return NextResponse.json({ success: true, kind, status: r.status === 'unknown-token' ? 'ignored' : r.status });
    }

    if (kind === 'onboarding') {
      const update = readOnboarding(raw);
      if (!update) {
        await moneyAlert('grow:onboarding-ignored', 'Grow onboarding update arrived but was not readable', { fields: fieldNames(raw) }, { severity: 'warning', key: `onboarding-unreadable-${Date.now()}` });
        return NextResponse.json({ success: true, kind, status: 'ignored' });
      }
      // Her api_key is sealed only if this update is matched and approved (applyOnboarding decides); bank_account is never read.
      const seal = () => { const k = readOnboardingApiKey(raw); return k ? encryptToken(k) : null; };
      const r = await applyOnboarding(update, supabaseOnboardingRepo(db), undefined, seal);
      // Every onboarding update leaves a line in ops_events, so "did Grow's update arrive?" is one query, whatever it matched.
      await moneyAlert('grow:onboarding-received', `Grow onboarding update received: ${String(r.status)}`, { status: String(r.status), updateId: r.updateId, trackingCode: update.trackingCode ? 'yes' : 'no' }, { severity: 'warning', key: `onboarding-${String(r.status)}-${Date.now()}` });
      return NextResponse.json({ success: true, kind, status: r.status });
    }

    // A well-formed object we do not recognise: acknowledged, not stored, not retried. Its field names are logged so a new Grow format is visible.
    await moneyAlert('grow:webhook-unknown', 'Grow webhook of an unknown kind was ignored', { fields: fieldNames(raw) }, { severity: 'warning', key: `unknown-kind-${Date.now()}` });
    return NextResponse.json({ success: true, kind: 'unknown', status: 'ignored' });
  } catch (e) {
    console.error('[grow] webhook storage failed:', kind, (e as Error)?.message); await moneyAlert('grow:webhook', 'Grow webhook storage failed; answered 503 so Grow retries', { kind }, { key: String(kind) });
    return NextResponse.json({ success: false, error: 'try-again' }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
