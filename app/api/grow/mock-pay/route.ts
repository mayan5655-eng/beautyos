// app/api/grow/mock-pay/route.ts
//
// The stand-in for Grow's hosted payment page while GROW_MODE=mock. It exists only so the whole flow can be walked end to end without
// Grow: it shows the amount, a "TEST, nobody is charged" banner and two buttons, and pressing one feeds the SAME callback logic a real
// Grow notification reaches (lib/grow/service.ts), including the invoice. 404 unless mock mode is allowed on this deployment (never on
// Vercel production), so it cannot exist next to real payments.
//   GET  ?p=<processId>   the page
//   GET  ?doc=<paymentId> a sample receipt page (the link the mock "invoice" points at)
//   POST p, result=success|fail
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow, mockNotification, mockInvoice } from '@/lib/grow/adapter';
import { applyNotificationByProcess, applyInvoiceByProcess, approveTransaction } from '@/lib/grow/service';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { admin } from '../_shared';

const STYLE = `body{margin:0;background:#FBF8F1;color:#1F3A30;font-family:Assistant,Heebo,system-ui,sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{max-width:420px;width:100%;background:#fff;border:1px solid #E8E1D1;border-radius:16px;padding:22px}
.test{background:#FBEDE9;border-radius:10px;padding:10px 12px;font-weight:700;margin-bottom:14px}
button{width:100%;min-height:48px;border-radius:12px;border:0;font:inherit;font-weight:700;margin-top:10px;cursor:pointer}
.ok{background:#1F3A30;color:#FBF8F1}.no{background:#fff;color:#1F3A30;border:1px solid #1F3A30}`;

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>תשלום (בדיקה)</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const gone = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured) return gone();
  const u = new URL(request.url);
  const db = admin();
  const doc = u.searchParams.get('doc');
  if (doc) {
    const { data } = await db.from('grow_payments').select('amount, client_name').eq('id', doc).maybeSingle();
    if (!data) return gone();
    return page(`<div class="test">קבלה לדוגמה, מצב בדיקה</div><h1>קבלה</h1><p>${esc(data.client_name || 'לקוחה')} · ₪${esc(data.amount)}</p><p>זה מסמך דמה. קבלה אמיתית מופקת על ידי Grow.</p>`);
  }
  const p = u.searchParams.get('p') || '';
  const { data } = await db.from('grow_payments').select('id, amount, status, client_name').eq('process_id', p).maybeSingle();
  if (!data) return gone();
  if (data.status !== 'created') return page(`<div class="test">מצב בדיקה</div><h1>התשלום כבר טופל</h1><p>הסטטוס: ${esc(data.status)}</p>`);
  return page(`<div class="test">מצב בדיקה: לא נגבה כסף ואין כאן כרטיס אשראי</div><h1>₪${esc(data.amount)}</h1><p>${esc(data.client_name || '')}</p>
<form method="post"><input type="hidden" name="p" value="${esc(p)}"><button class="ok" name="result" value="success">דמה תשלום מוצלח</button><button class="no" name="result" value="fail">דמה כישלון</button></form>`);
}

export async function POST(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured || !grow.creds) return gone();
  const form = await request.formData().catch(() => null);
  const p = String(form?.get('p') || '');
  const result = form?.get('result') === 'success' ? 'success' : 'fail';
  const db = admin();
  const repo = supabaseGrowRepo(db);
  const { data } = await db.from('grow_payments').select('id, tenant_id, amount, process_id, status').eq('process_id', p).maybeSingle();
  if (!data || data.status !== 'created') return gone();

  if (result === 'fail') {
    await repo.updatePayment(data.id, { status: 'failed', error: 'mock: declined', updated_at: new Date().toISOString() });
    console.log('[grow] mock payment declined', data.id);
    return page('<div class="test">מצב בדיקה</div><h1>התשלום נכשל</h1><p>לא נגבה כסף. אפשר לחזור ולנסות שוב מהקופה.</p>');
  }
  const creds = grow.creds;
  const deps = { repo, creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') };
  const r = await applyNotificationByProcess(mockNotification(data, 'success'), deps, (n) => approveTransaction(n, creds, grow.fetchImpl));
  await applyInvoiceByProcess(mockInvoice(data, APP_URL), deps);
  console.log('[grow] mock payment recorded', data.id, r.status);
  return page('<div class="test">מצב בדיקה</div><h1>התשלום התקבל ✓</h1><p>הקבלה נרשמה בקופה. אפשר לסגור את הדף.</p>');
}
