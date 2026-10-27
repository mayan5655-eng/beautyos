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
import { NextResponse } from 'next/server';
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

export const maxDuration = 30;

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
    console.warn('[grow] webhook refused: address is not on Grow\'s list', ip || '(none)');
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
  }

  const raw = await readBody(request);
  if (!raw) return NextResponse.json({ success: false, error: 'bad-body' }, { status: 400 });

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
        if (cd) {
          const first = readNotification(raw);
          const approve = tokenCreds && first ? () => approveTransaction(first, tokenCreds) : undefined;
          const tr = await onCardTokenNotification(cd, tokenCb, approve);
          if (tr.status !== 'unknown-process') return NextResponse.json({ success: tr.status !== 'failed', kind: 'card-token', status: tr.status }, { status: tr.status === 'failed' ? 503 : 200 });
        }
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
      if (!update) return NextResponse.json({ success: true, kind, status: 'ignored' });
      // Her api_key is sealed only if this update is matched and approved (applyOnboarding decides); bank_account is never read.
      const seal = () => { const k = readOnboardingApiKey(raw); return k ? encryptToken(k) : null; };
      const r = await applyOnboarding(update, supabaseOnboardingRepo(db), undefined, seal);
      return NextResponse.json({ success: true, kind, status: r.status });
    }

    // A well-formed object we do not recognise: acknowledged, not stored, not retried.
    return NextResponse.json({ success: true, kind: 'unknown', status: 'ignored' });
  } catch (e) {
    console.error('[grow] webhook storage failed:', kind, (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'try-again' }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
