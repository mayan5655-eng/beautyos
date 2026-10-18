// app/api/grow/mock-token/route.ts
//
// The stand-in for Grow's hosted "save a card" page while GROW_MODE=mock: no card, no charge. It shows three buttons and ends in the same
// saveToken() a real Grow return would call. 404 unless mock mode is allowed on this deployment (never on Vercel production). The page is public
// but carries a signed token (lib/grow/mockSession.ts), so it can only save a card for the booking it was opened for.
//   GET  ?s=<token>
//   POST s, result = ok | decline | fail
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { newMockCardToken } from '@/lib/grow/ops';
import { verifyGrowSession } from '@/lib/grow/mockSession';
import { saveToken } from '@/lib/grow/cancelFees';
import { cancelDeps } from '../_cancel';

const STYLE = `body{margin:0;background:#FBF8F1;color:#1F3A30;font-family:Assistant,Heebo,system-ui,sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{max-width:420px;width:100%;background:#fff;border:1px solid #E8E1D1;border-radius:16px;padding:22px}
.test{background:#FBEDE9;border-radius:10px;padding:10px 12px;font-weight:700;margin-bottom:14px}
button,a.b{display:block;box-sizing:border-box;text-align:center;text-decoration:none;width:100%;min-height:48px;line-height:48px;border-radius:12px;border:0;font:inherit;font-weight:700;margin-top:10px;cursor:pointer;padding:0}
.ok{background:#1F3A30;color:#FBF8F1}.no{background:#fff;color:#1F3A30;border:1px solid #1F3A30}`;

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>שמירת כרטיס (בדיקה)</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const gone = () => NextResponse.json({ error: 'not found' }, { status: 404 });
const expired = () => page('<div class="test">מצב בדיקה</div><h1>הקישור פג תוקף</h1><p>חזרי לדף קביעת התור ופתחי את הדף מחדש.</p>', 410);

export async function GET(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured) return gone();
  const s = new URL(request.url).searchParams.get('s') || '';
  if (!verifyGrowSession(s)) return expired();
  return page(`<div class="test">מצב בדיקה: אין כאן כרטיס אשראי אמיתי ולא יחויב כסף</div><h1>שמירת כרטיס לביטולים</h1><p>בדף אמיתי כאן מקלידים את פרטי הכרטיס אצל Grow, ולא אצלנו. הכרטיס נשמר ולא מחויב כסף עכשיו.</p>
<form method="post"><input type="hidden" name="s" value="${esc(s)}">
<button class="ok" name="result" value="ok">דמה כרטיס תקין</button>
<button class="no" name="result" value="decline">דמה כרטיס שיסורב בחיוב</button>
<button class="no" name="result" value="fail">דמה כישלון בדף הכרטיס</button></form>`);
}

export async function POST(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured) return gone();
  const form = await request.formData().catch(() => null);
  const session = verifyGrowSession(String(form?.get('s') || ''));
  if (!session) return expired();
  const result = String(form?.get('result') || 'fail');
  const back = `<a class="b ok" href="${esc(APP_URL)}/book?t=${esc(session.tenantId)}">חזרה לדף קביעת התור</a>`;

  if (result !== 'ok' && result !== 'decline') return page(`<div class="test">מצב בדיקה</div><h1>הכרטיס לא נשמר</h1><p>לא נשמר כלום ולא נגבה כסף. אפשר לנסות שוב.</p>${back}`);
  const deps = cancelDeps();
  if (!deps) return gone();
  try {
    const r = await saveToken(deps, { tenantId: session.tenantId, appointmentId: session.appointmentId, tokenRef: newMockCardToken(result === 'ok' ? 'ok' : 'decline'), last4: result === 'ok' ? '4242' : '0002', brand: 'Visa' });
    console.log('[grow] mock card token saved for tenant', session.tenantId, 'ok:', r.ok);
    return page(`<div class="test">מצב בדיקה</div><h1>הכרטיס נשמר ✓</h1><p>לא נגבה כסף. התור נקבע.</p>${back}`);
  } catch (e) {
    console.error('[grow] saving the card token failed:', (e as Error)?.message);
    return page('<div class="test">מצב בדיקה</div><h1>משהו נתקע</h1><p>הכרטיס לא נשמר. אפשר לנסות שוב.</p>', 500);
  }
}
