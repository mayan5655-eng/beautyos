// app/api/grow/notify/route.ts
//
// Grow's server-to-server callback (form POST, no signature). Authorised by the per-payment secret in the URL
// (?t=...) and then by the content: the process id and the amount must match the payment we created
// (lib/grow/service.applyNotification). A forged or replayed call can therefore neither mark an unrelated
// payment paid nor change an amount. Always answers 200 for a well-formed call so Grow does not retry forever;
// the body says what happened, for the logs.
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { applyNotification, approveTransaction } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { approveCredsFor } from '@/lib/grow/wallet';
import { randomBytes } from 'node:crypto';
import { admin } from '../_shared';
import { afterPaidHook } from '../_cancel';

export const maxDuration = 30;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) return (await request.json()) as Record<string, unknown>;
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    form.forEach((v, k) => { out[k] = typeof v === 'string' ? v : ''; });
    return out;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const raw = await readBody(request);
  const grow = resolveGrow(process.env, APP_URL);
  const creds = grow.creds;
  try {
    const result = await applyNotification(
      raw,
      token,
      { repo: supabaseGrowRepo(admin()), creds: creds || { apiKey: '', pageCode: '', apiBase: '' }, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex'), afterPaid: afterPaidHook() },
      // Approved with the page code of the page the client paid on (wallet or card page), decided by the payment (lib/grow/wallet.ts).
      (n, p) => { const c = approveCredsFor(p, grow); return c ? approveTransaction(n, c, grow.fetchImpl) : Promise.resolve(); },
    );
    if (result.status === 'unknown-token') return NextResponse.json({ success: false }, { status: 404 });
    return NextResponse.json({ success: true, status: result.status });
  } catch (e) {
    console.error('[grow] notify failed:', (e as Error)?.message);
    // 500 so Grow retries: nothing was recorded.
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
