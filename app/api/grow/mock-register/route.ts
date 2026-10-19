// app/api/grow/mock-register/route.ts
//
// The stand-in for Grow's registration form while GROW_MODE=mock (lib/grow/registration.ts). It shows a "TEST" banner and two
// buttons; pressing one builds the onboarding update a real Grow would post and runs it through the SAME handler the platform
// webhook uses (lib/grow/webhook.ts applyOnboarding). 404 unless mock mode is allowed on this deployment (never on production).
//   GET  ?c=<tracking code>   the page
//   POST c, result=approve|reject
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { applyOnboarding, readOnboarding } from '@/lib/grow/webhook';
import { supabaseOnboardingRepo } from '@/lib/grow/onboardingRepo';
import { admin } from '../_shared';

const STYLE = `body{margin:0;background:#FBF8F1;color:#1F3A30;font-family:Assistant,Heebo,system-ui,sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{max-width:420px;width:100%;background:#fff;border:1px solid #E8E1D1;border-radius:16px;padding:22px}
.test{background:#FBEDE9;border-radius:10px;padding:10px 12px;font-weight:700;margin-bottom:14px}
button{width:100%;min-height:48px;border-radius:12px;border:0;font:inherit;font-weight:700;margin-top:10px;cursor:pointer}
.ok{background:#1F3A30;color:#FBF8F1}.no{background:#fff;color:#1F3A30;border:1px solid #1F3A30}a{color:#1F3A30;font-weight:700}`;

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>הרשמה ל-Grow (בדיקה)</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
const gone = () => NextResponse.json({ error: 'not found' }, { status: 404 });
const CODE = /^[0-9a-f]{24}$/;

async function pendingFor(code: string) {
  const { data } = await admin().from('grow_onboarding_pending').select('tenant_id, consumed_at').eq('tracking_code', code).maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured) return gone();
  const code = new URL(request.url).searchParams.get('c') || '';
  if (!CODE.test(code)) return gone();
  const p = await pendingFor(code);
  if (!p) return gone();
  if (p.consumed_at) return page('<div class="test">מצב בדיקה</div><h1>ההרשמה כבר אושרה</h1><p>אפשר לחזור ל-Kalmea.</p>');
  return page(`<div class="test">מצב בדיקה: זה לא הטופס של Grow ואין כאן פתיחת חשבון אמיתית</div>
<h1>טופס ההרשמה ל-Grow</h1><p>בחשבון אמיתי ממלאים כאן את פרטי העסק והבנק, ו-Grow בודקת ומאשרת.</p>
<form method="post"><input type="hidden" name="c" value="${code}"><button class="ok" name="result" value="approve">דמה אישור החשבון</button><button class="no" name="result" value="reject">דמה דחייה</button></form>`);
}

export async function POST(request: Request) {
  const grow = resolveGrow(process.env, APP_URL);
  if (grow.mode !== 'mock' || !grow.configured) return gone();
  const form = await request.formData().catch(() => null);
  const code = String(form?.get('c') || '');
  if (!CODE.test(code)) return gone();
  const p = await pendingFor(code);
  if (!p || p.consumed_at) return gone();
  const approve = form?.get('result') === 'approve';
  const raw = approve
    ? { status: '1', data: { user_id: `mockuser${randomBytes(4).toString('hex')}`, tracking_code: code, business_title: 'Mock business', tracking_status: { id: '1', message: 'approved' } } }
    : { status: '0', data: { tracking_code: code, tracking_status: { id: '9', message: 'rejected: mock' } } };
  const u = readOnboarding(raw);
  if (!u) return gone();
  const r = await applyOnboarding(u, supabaseOnboardingRepo(admin()));
  console.log('[grow] mock registration', approve ? 'approved' : 'rejected', r.status, r.registration);
  const back = `<p><a href="${APP_URL.replace(/\/+$/, '')}/">חזרה ל-Kalmea</a></p>`;
  return approve
    ? page(`<div class="test">מצב בדיקה</div><h1>החשבון אושר ✓</h1><p>הסליקה הופעלה בהגדרות שלך ב-Kalmea.</p>${back}`)
    : page(`<div class="test">מצב בדיקה</div><h1>הבקשה נדחתה</h1><p>כך זה ייראה כש-Grow לא מאשרת חשבון.</p>${back}`);
}
