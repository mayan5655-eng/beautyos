// app/api/billing/mock-card/route.ts
//
// The stand-in for a provider's hosted card page while BILLING_MODE=mock. It shows "TEST, no real card" and three buttons; pressing one ends
// in the same saveCard() a real provider's return would call (lib/billing/service.ts). 404 unless mock mode is allowed on this deployment
// (never on Vercel production). The page is public but carries a signed token (lib/billing/session.ts), so it can only save a card for the
// business that asked.
//   GET  ?s=<token>                 the page
//   GET  ?doc=<paymentId>&n=<no>    a sample invoice page (the link the mock invoice points at)
//   POST s, result = ok | decline | fail
//        ok       saves a card that charges successfully
//        decline  saves a card that is refused when charged (to see the failure and retry path)
//        fail     the card page failed: nothing is saved
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { newMockToken } from '@/lib/billing/adapter';
import { saveCard } from '@/lib/billing/service';
import { supabaseBillingRepo } from '@/lib/billing/repo';
import { verifyCardSession } from '@/lib/billing/session';
import { admin, billing } from '../_shared';

const STYLE = `body{margin:0;background:#FBF8F1;color:#1F3A30;font-family:Assistant,Heebo,system-ui,sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{max-width:420px;width:100%;background:#fff;border:1px solid #E8E1D1;border-radius:16px;padding:22px}
.test{background:#FBEDE9;border-radius:10px;padding:10px 12px;font-weight:700;margin-bottom:14px}
button,a.b{display:block;box-sizing:border-box;text-align:center;text-decoration:none;width:100%;min-height:48px;line-height:48px;border-radius:12px;border:0;font:inherit;font-weight:700;margin-top:10px;cursor:pointer;padding:0}
.ok{background:#1F3A30;color:#FBF8F1}.no{background:#fff;color:#1F3A30;border:1px solid #1F3A30}`;

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>כרטיס אשראי (בדיקה)</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const gone = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET(request: Request) {
  const b = billing();
  if (b.mode !== 'mock' || !b.configured) return gone();
  const u = new URL(request.url);
  const doc = u.searchParams.get('doc');
  if (doc) {
    return page(`<div class="test">חשבונית לדוגמה, מצב בדיקה</div><h1>חשבונית ${esc(u.searchParams.get('n') || '')}</h1><p>זה מסמך דמה. חשבונית אמיתית תופק על ידי ספק החשבוניות.</p>`);
  }
  const s = u.searchParams.get('s') || '';
  if (!verifyCardSession(s)) return page('<div class="test">מצב בדיקה</div><h1>הקישור פג תוקף</h1><p>חזרי למערכת ופתחי את הדף מחדש.</p>', 410);
  return page(`<div class="test">מצב בדיקה: אין כאן כרטיס אשראי אמיתי ולא יחויב כסף</div><h1>שמירת כרטיס אשראי</h1><p>בדף אמיתי כאן מקלידים את פרטי הכרטיס אצל ספק התשלומים, ולא אצלנו.</p>
<form method="post"><input type="hidden" name="s" value="${esc(s)}">
<button class="ok" name="result" value="ok">דמה כרטיס תקין</button>
<button class="no" name="result" value="decline">דמה כרטיס שיסורב בחיוב</button>
<button class="no" name="result" value="fail">דמה כישלון בדף הכרטיס</button></form>`);
}

export async function POST(request: Request) {
  const b = billing();
  if (b.mode !== 'mock' || !b.configured || !b.payments || !b.invoicing) return gone();
  const form = await request.formData().catch(() => null);
  const tenantId = verifyCardSession(String(form?.get('s') || ''));
  if (!tenantId) return page('<div class="test">מצב בדיקה</div><h1>הקישור פג תוקף</h1><p>חזרי למערכת ופתחי את הדף מחדש.</p>', 410);
  const result = String(form?.get('result') || 'fail');
  const back = `<a class="b ok" href="${esc(APP_URL)}/dashboard">חזרה ליומן</a>`;

  if (result !== 'ok' && result !== 'decline') {
    return page(`<div class="test">מצב בדיקה</div><h1>הכרטיס לא נשמר</h1><p>לא נשמר כלום ולא נגבה כסף. אפשר לנסות שוב.</p>${back}`);
  }
  try {
    const r = await saveCard(
      { repo: supabaseBillingRepo(admin()), payments: b.payments, invoicing: b.invoicing },
      tenantId,
      { tokenRef: newMockToken(result === 'ok' ? 'ok' : 'decline'), last4: result === 'ok' ? '4242' : '0002', brand: 'Visa' },
    );
    console.log('[billing] mock card saved for tenant', tenantId, 'charged:', r.charged);
    const note = r.charged === 'charged' ? '<p>החיוב הראשון עבר והחשבון פעיל.</p>' : r.charged === 'failed' ? '<p>הכרטיס נשמר אבל החיוב נכשל.</p>' : '';
    return page(`<div class="test">מצב בדיקה</div><h1>הכרטיס נשמר ✓</h1>${note}${back}`);
  } catch (e) {
    console.error('[billing] saving the card failed:', (e as Error)?.message);
    return page('<div class="test">מצב בדיקה</div><h1>משהו נתקע</h1><p>הכרטיס לא נשמר. אפשר לנסות שוב.</p>', 500);
  }
}
