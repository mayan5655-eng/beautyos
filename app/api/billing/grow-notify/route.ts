// app/api/billing/grow-notify/route.ts
//
// Grow's server-to-server callback for KALMEA'S OWN billing account (lib/billing/growBilling.ts): she saved a card for her subscription on
// Grow's hosted page, and Grow posts the token here (first transaction of a token -> approveTransaction is required, per Grow's "Work with
// Token"). Separate from the platform webhook (/api/grow/webhook), which belongs to the cosmeticians' clearing.
//
// Order of checks, nothing trusted from the body alone:
//   1. live billing is configured (in mock mode the mock card page calls saveCard itself; this route answers 404)
//   2. the caller is on Grow's published address list (lib/grow/webhook.ts, the same list and the same rule as the platform webhook)
//   3. ?s= is a valid, unexpired session signed for ONE business (lib/billing/session.ts)
//   4. the body carries a card token, and its cField2 (when present) is that same business
// Then saveCard() (lib/billing/service.ts) and approveTransaction with the billing account's own key and page code. Grow wants HTTP 200.
import { NextResponse } from 'next/server';
import { clientIp, ipAllowed, ipCheckEnforced, parseWebhookBody } from '@/lib/grow/webhook';
import { readCardTokenNotification } from '@/lib/grow/tokenFlow';
import { tenantRefOf } from '@/lib/grow/payload';
import { verifyCardSession } from '@/lib/billing/session';
import { growBillingCreds } from '@/lib/billing/growBilling';
import { saveCard } from '@/lib/billing/service';
import { encryptToken } from '@/lib/facebook/encryption';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { admin, billing } from '../_shared';

const done = (status = 200) => NextResponse.json({ ok: status === 200 }, { status });

export async function POST(request: Request) {
  const b = billing();
  if (b.mode !== 'live' || !b.configured || !b.payments || !b.invoicing) return done(404);
  const env = process.env as Record<string, string | undefined>;
  const ip = clientIp(request.headers);
  if (ipCheckEnforced({ ...env, GROW_ENV: env.GROW_BILLING_ENV }) && !ipAllowed(ip)) {
    console.warn('[billing] grow-notify refused, address not on Grow\'s list:', ip || '(none)');
    return done(403);
  }
  const tenantId = verifyCardSession(new URL(request.url).searchParams.get('s') || '');
  if (!tenantId) return done(403);

  const type = request.headers.get('content-type') || '';
  let raw: Record<string, unknown> | null = null;
  if (/multipart\/form-data/i.test(type)) {
    const f = await request.formData().catch(() => null);
    if (f) { raw = {}; f.forEach((v, k) => { raw![k] = typeof v === 'string' ? v : ''; }); }
  } else {
    raw = parseWebhookBody(await request.text().catch(() => ''), type);
  }
  const n = raw ? readCardTokenNotification(raw) : null;
  if (!n) return done(200); // not a token notification: nothing to do, and Grow must not retry it forever
  if (n.tenantRef && n.tenantRef !== tenantRefOf(tenantId)) {
    console.warn('[billing] grow-notify: business mismatch, ignored');
    return done(200);
  }

  try {
    // Stored sealed (AES-256-GCM, TOKEN_ENCRYPTION_KEY), like the clients' card tokens; lib/billing/growBilling.ts opens it for each call.
    const r = await saveCard({ repo: supabaseBillingRepo(admin()), payments: b.payments, invoicing: b.invoicing }, tenantId, { tokenRef: encryptToken(n.cardToken), last4: n.last4, brand: n.brand });
    console.log('[billing] card saved through Grow for tenant', tenantId, 'charged:', r.charged);
  } catch (e) {
    console.error('[billing] saveCard after Grow token failed:', (e as Error)?.message);
  }

  // approveTransaction for the first token transaction, with the BILLING account's key and page code (never the platform's).
  const { creds } = growBillingCreds(env);
  if (creds) {
    try {
      const form = new FormData();
      form.append('apiKey', creds.apiKey);
      form.append('pageCode', creds.pageCode);
      for (const [k, v] of Object.entries(n.echo)) form.append(k, v);
      await fetch(`${creds.apiBase}/approveTransaction`, { method: 'POST', body: form });
    } catch (e) {
      console.error('[billing] approveTransaction failed:', (e as Error)?.message);
    }
  }
  return done(200);
}
