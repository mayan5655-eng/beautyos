// app/api/grow/invoice/route.ts
//
// Grow's invoice webhook (invoiceNotifyUrl): Grow issues the legal document, this stores its link on the
// payment and on the Kalmea receipt so she sees it inside Kalmea. Authorised by the same per-payment secret.
// The payload shape is not documented publicly, so the link is read wherever Grow put it (first https URL).
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { applyInvoice } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { randomBytes } from 'node:crypto';
import { admin } from '../_shared';
import { clientIp, ipAllowed, ipCheckEnforced } from '@/lib/grow/webhook';

export const maxDuration = 30;

export async function POST(request: Request) {
  // Only Grow's published addresses, as on /api/grow/webhook. The ?t= secret alone is not enough: the same token is in the /pay/<token>
  // link the client receives, so without this a client could post a forged invoice link or payment update (2026-11-02 audit).
  const ip = clientIp(request.headers);
  if (ipCheckEnforced() && !ipAllowed(ip)) {
    console.warn('[grow] invoice refused: address is not on Grow\'s list', ip || '(none)');
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
  }
  const token = new URL(request.url).searchParams.get('t') || '';
  let raw: unknown = {};
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) raw = await request.json();
    else { const f = await request.formData(); const o: Record<string, string> = {}; f.forEach((v, k) => { if (typeof v === 'string') o[k] = v; }); raw = o; }
  } catch { raw = {}; }
  try {
    const r = await applyInvoice(raw, token, { repo: supabaseGrowRepo(admin()), creds: { apiKey: '', pageCode: '', apiBase: '' }, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') });
    if (r.status === 'unknown-token') return NextResponse.json({ success: false }, { status: 404 });
    return NextResponse.json({ success: true, status: r.status });
  } catch (e) {
    console.error('[grow] invoice failed:', (e as Error)?.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
