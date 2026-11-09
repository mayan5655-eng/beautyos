'use client';

// app/pay/[token]/PayClient.jsx
//
// The client's side of a Grow payment: who is asking, how much, one button, then Grow's wallet (card, Bit, Apple Pay, Google Pay) opens
// on this page. Warm and short, in the voice of her business. Card details never reach Kalmea: they go to Grow's form.
// "Thank you" is shown only after OUR record says paid (Grow's server callback), not on the wallet's own success event, so a client is
// never told it worked when the cosmetician's side did not see it; after a short wait it says the payment is on its way.

import { useCallback, useEffect, useRef, useState } from 'react';
import { openGrowWallet, preloadGrowSdk, growSdkLoaded, growWalletVisible } from '@/lib/grow/walletClient';
import { uaClass, osOf, fallbackDecision, androidIntentUrl, buildDiagPayload, sdkFailureText } from '@/lib/grow/walletDiag';
import { PAYMENT_TERMS_HREF, PAY_TERMS_BEFORE_HE, PAY_TERMS_LINK_HE, PAY_TERMS_AFTER_HE } from '@/lib/paymentTerms';
import { contrastOn, readableAccentText, DEFAULT_ACCENT } from '@/lib/theme';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;

// How long the wallet may take to appear after the tap before the page treats it as not opened (in-app browsers fail silently).
const OPEN_WATCHDOG_MS = 9000;

/** What she reads when the wallet did not complete: Grow's own words when it gave any, never an empty failure. */
function failureText(m, raw) {
  const said = sdkFailureText(raw) || (m && m !== 'timeout' ? String(m).slice(0, 200) : '');
  if (said) return `Grow השיבה: ${said}. לא חויבת, אפשר לנסות שוב.`;
  if (m === 'timeout') return 'עבר יותר מדי זמן והתשלום לא הושלם. לא חויבת, אפשר לנסות שוב.';
  return 'התשלום לא הושלם. לא חויבת. אפשר לנסות שוב.';
}

const WORDS = {
  unknown: 'הקישור הזה לא תקין. אפשר לבקש מהעסק קישור חדש.',
  closed: 'הקישור הזה כבר לא פעיל.',
  expired: 'תוקף הקישור הסתיים. אפשר לבקש מהעסק קישור חדש.',
};

export default function PayClient({ token }) {
  const [info, setInfo] = useState(null); // { state, amount, description, businessName, accent }
  const [phase, setPhase] = useState('loading'); // loading | ready | opening | open | confirming | paid | late | error
  const [msg, setMsg] = useState('');
  // The required terms tick (Grow's site check): the pay button waits for it, and /api/grow/wallet refuses without it.
  const [termsOk, setTermsOk] = useState(false);
  const timer = useRef(null);
  // One tap's wallet attempt: whether it opened, whether the page already moved on (redirect / prompt), its watchdog.
  const attempt = useRef(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    // Every payment token is randomBytes(24) in hex (app/api/grow/*). Anything else cannot open a payment,
    // so it is "invalid link" without a request (it used to leave a 404 in the client's console).
    if (!/^[0-9a-f]{48}$/i.test(String(token || ''))) { setInfo({ state: 'unknown' }); setPhase('ready'); return; }
    try {
      const r = await fetch(`/api/grow/wallet?t=${encodeURIComponent(token)}`);
      const j = await r.json().catch(() => null);
      // Busy or a server hiccup is not a bad link: a refresh will work.
      if (r.status === 429 || r.status >= 500) { setMsg('יש עומס רגעי. נסי לרענן בעוד רגע.'); setPhase('error'); return; }
      if (!r.ok || !j?.success) { setInfo({ state: 'unknown' }); setPhase('ready'); return; }
      setInfo(j);
      setPhase(j.state === 'paid' ? 'paid' : 'ready');
    } catch { setMsg('אין חיבור כרגע. נסי לרענן.'); setPhase('error'); }
  }, [token]);
  useEffect(() => {
    load(); preloadGrowSdk(window);
    return () => { if (timer.current) clearInterval(timer.current); if (attempt.current?.watch) clearTimeout(attempt.current.watch); };
  }, [load]);

  // Every wallet failure goes home (no PII: lib/grow/walletDiag.js), so the reason is in ops_events and not only on her screen.
  const report = useCallback((event, raw, extra) => {
    try {
      const body = buildDiagPayload({ token, event, raw, sdkLoaded: growSdkLoaded(window), sdkEnv: extra?.sdkEnv, ua: window.navigator.userAgent, phase: extra?.phase });
      fetch('/api/grow/wallet/diag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
    } catch { /* diagnostics never block the payment */ }
  }, [token]);

  // A booking (deposit or the visit itself) or a gift voucher: once OUR record says paid, she goes back to her booking confirmation (or
  // the voucher) on her own, a few seconds after the thank-you, and the button below does it at once.
  const backUrl = info?.context?.returnUrl || '';
  useEffect(() => {
    if (phase !== 'paid' || !backUrl) return undefined;
    const id = setTimeout(() => { window.location.assign(backUrl); }, 4000);
    return () => clearTimeout(id);
  }, [phase, backUrl]);

  // After the wallet says success, look for our own record of the payment for up to ~40 seconds.
  const confirm = useCallback(() => {
    setPhase('confirming');
    let tries = 0;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      tries += 1;
      try {
        const j = await (await fetch(`/api/grow/wallet?t=${encodeURIComponent(token)}`)).json();
        if (j?.state === 'paid') { clearInterval(timer.current); setPhase('paid'); return; }
      } catch { /* try again */ }
      if (tries >= 20) { clearInterval(timer.current); setPhase('late'); }
    }, 2000);
  }, [token]);

  const start = async () => {
    if (!termsOk) { setMsg('כדי להמשיך לתשלום צריך לסמן את האישור.'); return; }
    setPhase('opening'); setMsg('');
    try {
      const r = await fetch('/api/grow/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, acceptedTerms: termsOk === true }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        if (j?.state === 'paid') { setPhase('paid'); return; }
        setMsg(j?.error || 'לא הצלחנו לפתוח את התשלום. נסי שוב בעוד רגע.'); setPhase('ready'); return;
      }
      const ua = window.navigator.userAgent;
      const cls = uaClass(ua);
      const hostedUrl = j.hostedUrl || '';
      // An in-app browser (WhatsApp, Instagram, Facebook) with Grow's hosted page for this process: straight there, the same process.
      const first = fallbackDecision({ when: 'before', cls, hostedUrl });
      if (first.action === 'hosted') { report('hosted-redirect', null, { sdkEnv: j.sdkEnv, phase: 'before' }); setPhase('redirect'); window.location.assign(first.url); return; }

      if (attempt.current?.watch) clearTimeout(attempt.current.watch);
      const a = { opened: false, done: false, watch: null };
      attempt.current = a;
      const failed = (event, raw, m) => {
        if (a.done || attempt.current !== a) return;
        if (a.watch) clearTimeout(a.watch);
        const dec = fallbackDecision({ when: 'failed', cls, hostedUrl, opened: a.opened, os: osOf(ua) });
        report(event, raw, { sdkEnv: j.sdkEnv, phase: dec.action });
        if (dec.action === 'hosted') { a.done = true; setPhase('redirect'); window.location.assign(dec.url); return; }
        if (dec.action === 'browser') { a.done = true; setMsg(''); setPhase('browser'); return; }
        setMsg(failureText(m, raw)); setPhase('ready');
      };
      try {
        await openGrowWallet(window, {
          sdkEnv: j.sdkEnv,
          authCode: j.authCode,
          events: {
            onSuccess: () => { a.opened = true; a.done = true; if (a.watch) clearTimeout(a.watch); confirm(); },
            onFailure: (m, raw, event) => failed(event || 'onFailure', raw, m),
            onCancel: () => { a.done = true; if (a.watch) clearTimeout(a.watch); setPhase('ready'); },
            onOpenChange: (open) => { if (open) { a.opened = true; setPhase((p) => (p === 'opening' ? 'open' : p)); } },
          },
        });
      } catch (e) {
        // The script did not load (blocked, offline, an in-app browser) or Grow's init threw: never a dead end.
        failed(e && e.message === 'sdk' ? 'sdk-load' : 'init-throw', { message: e && e.message === 'sdk' ? '' : String((e && e.message) || '') });
        return;
      }
      setPhase((p) => (p === 'opening' ? 'open' : p));
      // Nothing on screen a few seconds after the tap, and no event either: the wallet did not open here.
      a.watch = setTimeout(() => {
        if (a.done || a.opened) return;
        if (growWalletVisible(window.document)) { a.opened = true; return; }
        failed('no-open', null, '');
      }, OPEN_WATCHDOG_MS);
    } catch {
      setMsg('לא הצלחנו לפתוח את התשלום. נסי לרענן ולנסות שוב.'); setPhase('ready');
    }
  };

  const copyLink = async () => {
    try { await window.navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setCopied(false); }
  };

  // Her colour, as on her booking page (the same default pink when she has none), with text that stays readable on it: white on
  // petal pink was about 2:1 (2026-11-02 audit).
  const accent = info?.accent || DEFAULT_ACCENT;
  const onAccent = contrastOn(accent);
  const accentText = readableAccentText(accent);
  const closed = info && info.state !== 'open' && info.state !== 'paid';
  // Only read on the open-in-browser prompt, which exists in the browser alone (never server-rendered).
  const os = phase === 'browser' && typeof window !== 'undefined' ? osOf(window.navigator.userAgent) : 'other';
  const ctx = info?.context || null;
  const backLink = { display: 'inline-block', marginTop: 12, fontSize: 16, color: accentText, fontWeight: 700 };
  const card = { background: '#fff', border: '1px solid #E8DFD0', borderRadius: 20, padding: '28px 22px', maxWidth: 420, margin: '0 auto', textAlign: 'center', boxShadow: '0 6px 24px rgba(31,58,48,.06)' };

  return (
    <div dir="rtl" data-testid="pay-page" style={{ minHeight: '100vh', background: '#FBF8F1', padding: '36px 16px', fontFamily: 'var(--font-assistant, Assistant, system-ui, sans-serif)', color: '#1F3A30' }}>
      <div style={card}>
        {info?.businessName && <p style={{ fontSize: 15, color: '#656A56', marginBottom: 6 }}>{info.businessName}</p>}
        {phase === 'loading' && <p>רגע, פותחות את הדף…</p>}
        {phase === 'error' && <p style={{ color: '#B3261E' }}>{msg}</p>}

        {closed && phase !== 'loading' && <p data-testid="pay-closed" style={{ fontSize: 17, lineHeight: 1.7 }}>{info.note || WORDS[info.state] || WORDS.closed}</p>}
        {closed && phase !== 'loading' && ctx && (ctx.kind === 'deposit' || ctx.kind === 'booking') && <a href={ctx.returnUrl.replace(/[?&]grow=paid/, '')} style={backLink}>לדף קביעת התורים</a>}

        {info && !closed && phase !== 'loading' && phase !== 'error' && (
          <>
            {phase !== 'paid' && phase !== 'late' && (
              <>
                <h1 style={{ fontSize: 34, margin: '4px 0', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)', fontWeight: 600 }} data-testid="pay-amount">{money(info.amount)}</h1>
                {info.description && <p style={{ fontSize: 16, color: '#656A56', marginBottom: ctx && ctx.when ? 10 : 18 }}>{info.description}</p>}
                {ctx && (ctx.kind === 'deposit' || ctx.kind === 'booking') && (ctx.service || ctx.when) && (
                  <div data-testid="pay-booking" style={{ background: '#FBF8F1', border: '1px solid #E8DFD0', borderRadius: 14, padding: '12px 14px', marginBottom: 18, textAlign: 'right', fontSize: 15, lineHeight: 1.7 }}>
                    {ctx.service && <div><span style={{ color: '#656A56' }}>טיפול: </span><b>{ctx.service}</b></div>}
                    {ctx.when && <div><span style={{ color: '#656A56' }}>מתי: </span><b>{ctx.when}</b></div>}
                    {ctx.kind === 'deposit' && phase !== 'paid' && <div style={{ color: '#656A56', fontSize: 14, marginTop: 4 }}>התור שמור עבורך ל-30 דקות, ויאושר מיד עם תשלום המקדמה.</div>}
                  </div>
                )}
              </>
            )}
            {(phase === 'ready' || phase === 'opening') && (
              <>
                <label data-testid="pay-terms" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'right', padding: '12px', borderRadius: 14, border: `1px solid ${termsOk ? accent : '#E8DFD0'}`, background: '#FDFBF9', marginBottom: 14, cursor: 'pointer', fontSize: 15, lineHeight: 1.6 }}>
                  <input type="checkbox" checked={termsOk} onChange={(e) => { setTermsOk(e.target.checked); if (e.target.checked) setMsg(''); }} aria-label="אישור תנאי התשלום" style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: accent }} />
                  <span>{PAY_TERMS_BEFORE_HE}<a href={PAYMENT_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: accentText, fontWeight: 700, textDecoration: 'underline' }}>{PAY_TERMS_LINK_HE}</a>{PAY_TERMS_AFTER_HE}</span>
                </label>
                <button type="button" data-testid="pay-start" onClick={start} disabled={phase === 'opening' || !termsOk} style={{ width: '100%', minHeight: 52, borderRadius: 14, border: 'none', background: accent, color: onAccent, fontSize: 18, fontWeight: 700, cursor: termsOk ? 'pointer' : 'default', opacity: termsOk ? 1 : 0.55, fontFamily: 'inherit' }}>
                  {phase === 'opening' ? 'פותחת את התשלום…' : `לתשלום ${money(info.amount)}`}
                </button>
                {/* The button waits for the tick (Grow's site check); without this line a greyed button gave no reason (2026-11-02 audit). */}
                {!termsOk && <p data-testid="pay-tick-hint" style={{ fontSize: 'var(--t-sm)', color: '#656A56', marginTop: 8 }}>כדי להמשיך לתשלום, מסמנים את האישור למעלה.</p>}
                <p style={{ fontSize: 13, color: '#656A56', marginTop: 12, lineHeight: 1.7 }}>כרטיס אשראי, ביט, Apple Pay או Google Pay.<br />התשלום מאובטח ועובר דרך Grow. פרטי הכרטיס לא נשמרים אצלנו.</p>
              </>
            )}
            {phase === 'open' && <p style={{ fontSize: 15, color: '#656A56' }}>השלימי את התשלום בחלון שנפתח.</p>}
            {phase === 'redirect' && <p data-testid="pay-redirect" style={{ fontSize: 'var(--t-lg)', color: '#656A56' }}>עוברות לדף התשלום המאובטח של Grow…</p>}
            {phase === 'browser' && (
              <div data-testid="pay-browser" style={{ textAlign: 'right', background: '#FBF8F1', border: '1px solid #E8DFD0', borderRadius: 'var(--r-md)', padding: '16px 14px', marginTop: 4 }}>
                <h2 style={{ fontSize: 'var(--t-xl)', margin: '0 0 6px', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)', textAlign: 'center' }}>עוד צעד קטן והתשלום מוכן</h2>
                <p style={{ fontSize: 'var(--t-lg)', lineHeight: 1.7, margin: '0 0 12px', textAlign: 'center' }}>חלון התשלום לא נפתח בתוך האפליקציה. בדפדפן של הטלפון הוא נפתח מיד. לא חויבת.</p>
                {os === 'android' ? (
                  <a data-testid="pay-open-chrome" href={androidIntentUrl(typeof window !== 'undefined' ? window.location.href : '')} style={{ display: 'block', textAlign: 'center', minHeight: 52, lineHeight: '52px', borderRadius: 'var(--r-sm)', background: accent, color: onAccent, fontSize: 'var(--t-lg)', fontWeight: 700, textDecoration: 'none' }}>פתיחה ב-Chrome</a>
                ) : (
                  <ol data-testid="pay-ios-steps" style={{ margin: '0 0 12px', paddingInlineStart: 0, listStyle: 'decimal inside', fontSize: 'var(--t-lg)', lineHeight: 1.9 }}>
                    <li>לוחצים על <b>⋯</b> בפינת המסך</li>
                    <li>בוחרים <b>פתיחה בספארי</b></li>
                    <li>מסמנים את האישור ומשלמים</li>
                  </ol>
                )}
                <button type="button" data-testid="pay-copy-link" onClick={copyLink} style={{ width: '100%', minHeight: 48, marginTop: 10, borderRadius: 'var(--r-sm)', border: `1.5px solid ${accent}`, background: os === 'android' ? '#fff' : accent, color: os === 'android' ? accentText : onAccent, fontSize: 'var(--t-lg)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {copied ? 'הקישור הועתק. מדביקים אותו בדפדפן 🌸' : 'העתקת הקישור לדפדפן'}
                </button>
                <button type="button" data-testid="pay-retry-here" onClick={() => { setPhase('ready'); setCopied(false); }} style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: '#656A56', fontSize: 'var(--t-lg)', textDecoration: 'underline', fontFamily: 'inherit', cursor: 'pointer' }}>לנסות שוב כאן</button>
              </div>
            )}
            {phase === 'confirming' && <p data-testid="pay-confirming" style={{ fontSize: 17 }}>התשלום עבר, רגע מאשרות אותו…</p>}
            {phase === 'paid' && (
              <div data-testid="pay-paid">
                <p style={{ fontSize: 40, margin: 0 }}>🌸</p>
                <h2 style={{ fontSize: 24, margin: '6px 0', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)' }}>התשלום התקבל, תודה!</h2>
                <p style={{ fontSize: 15, color: '#656A56' }}>{money(info.amount)}{info.description ? ` · ${info.description}` : ''}</p>
                {ctx?.kind === 'deposit' && <p style={{ fontSize: 15, marginTop: 6 }}>התור שלך מאושר. נתראה{ctx.when ? ` ב${ctx.when}` : ''}!</p>}
              </div>
            )}
            {phase === 'late' && <p data-testid="pay-late" style={{ fontSize: 16, lineHeight: 1.7 }}>התשלום עבר ב-Grow, והאישור בדרך אל העסק. אין צורך לשלם שוב. 🌸</p>}
            {(phase === 'paid' || phase === 'late') && ctx && <a data-testid="pay-back" href={ctx.returnUrl} style={{ ...backLink, display: 'block', marginTop: 16, padding: '13px 0', borderRadius: 14, background: accent, color: onAccent, textDecoration: 'none', fontWeight: 700 }}>{ctx.returnLabel}</a>}
            {msg && phase === 'ready' && <p role="alert" style={{ color: '#B3261E', fontSize: 14, marginTop: 12 }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
