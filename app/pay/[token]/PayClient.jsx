'use client';

// app/pay/[token]/PayClient.jsx
//
// The client's side of a Grow payment: who is asking, how much, one button, then Grow's wallet (card, Bit, Apple Pay, Google Pay) opens
// on this page. Warm and short, in the voice of her business. Card details never reach Kalmea: they go to Grow's form.
// "Thank you" is shown only after OUR record says paid (Grow's server callback), not on the wallet's own success event, so a client is
// never told it worked when the cosmetician's side did not see it; after a short wait it says the payment is on its way.

import { useCallback, useEffect, useRef, useState } from 'react';
import { openGrowWallet, preloadGrowSdk } from '@/lib/grow/walletClient';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;

const WORDS = {
  unknown: 'הקישור הזה לא תקין. אפשר לבקש מהעסק קישור חדש.',
  closed: 'הקישור הזה כבר לא פעיל.',
  expired: 'תוקף הקישור הסתיים. אפשר לבקש מהעסק קישור חדש.',
};

export default function PayClient({ token }) {
  const [info, setInfo] = useState(null); // { state, amount, description, businessName, accent }
  const [phase, setPhase] = useState('loading'); // loading | ready | opening | open | confirming | paid | late | error
  const [msg, setMsg] = useState('');
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/grow/wallet?t=${encodeURIComponent(token)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { setInfo({ state: 'unknown' }); setPhase('ready'); return; }
      setInfo(j);
      setPhase(j.state === 'paid' ? 'paid' : 'ready');
    } catch { setMsg('אין חיבור כרגע. נסי לרענן.'); setPhase('error'); }
  }, [token]);
  useEffect(() => { load(); preloadGrowSdk(window); return () => { if (timer.current) clearInterval(timer.current); }; }, [load]);

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
    setPhase('opening'); setMsg('');
    try {
      const r = await fetch('/api/grow/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        if (j?.state === 'paid') { setPhase('paid'); return; }
        setMsg(j?.error || 'לא הצלחנו לפתוח את התשלום. נסי שוב בעוד רגע.'); setPhase('ready'); return;
      }
      await openGrowWallet(window, {
        sdkEnv: j.sdkEnv,
        authCode: j.authCode,
        events: {
          onSuccess: () => confirm(),
          onFailure: (m) => { setMsg(m && m !== 'timeout' ? m : 'התשלום לא הושלם. לא חויבת. אפשר לנסות שוב.'); setPhase('ready'); },
          onCancel: () => setPhase('ready'),
          onOpenChange: (open) => { if (open) setPhase((p) => (p === 'opening' ? 'open' : p)); },
        },
      });
      setPhase((p) => (p === 'opening' ? 'open' : p));
    } catch {
      setMsg('לא הצלחנו לפתוח את התשלום. נסי לרענן ולנסות שוב.'); setPhase('ready');
    }
  };

  const accent = info?.accent || '#1F3A30';
  const closed = info && info.state !== 'open' && info.state !== 'paid';
  const card = { background: '#fff', border: '1px solid #E8DFD0', borderRadius: 20, padding: '28px 22px', maxWidth: 420, margin: '0 auto', textAlign: 'center', boxShadow: '0 6px 24px rgba(31,58,48,.06)' };

  return (
    <div dir="rtl" data-testid="pay-page" style={{ minHeight: '100vh', background: '#FBF8F1', padding: '36px 16px', fontFamily: 'var(--font-assistant, Assistant, system-ui, sans-serif)', color: '#1F3A30' }}>
      <div style={card}>
        {info?.businessName && <p style={{ fontSize: 15, color: '#656A56', marginBottom: 6 }}>{info.businessName}</p>}
        {phase === 'loading' && <p>רגע, פותחות את הדף…</p>}
        {phase === 'error' && <p style={{ color: '#B3261E' }}>{msg}</p>}

        {closed && phase !== 'loading' && <p data-testid="pay-closed" style={{ fontSize: 17, lineHeight: 1.7 }}>{WORDS[info.state] || WORDS.closed}</p>}

        {info && !closed && phase !== 'loading' && phase !== 'error' && (
          <>
            {phase !== 'paid' && phase !== 'late' && (
              <>
                <h1 style={{ fontSize: 34, margin: '4px 0', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)', fontWeight: 600 }} data-testid="pay-amount">{money(info.amount)}</h1>
                {info.description && <p style={{ fontSize: 16, color: '#656A56', marginBottom: 18 }}>{info.description}</p>}
              </>
            )}
            {(phase === 'ready' || phase === 'opening') && (
              <>
                <button type="button" data-testid="pay-start" onClick={start} disabled={phase === 'opening'} style={{ width: '100%', minHeight: 52, borderRadius: 14, border: 'none', background: accent, color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {phase === 'opening' ? 'פותחת את התשלום…' : `לתשלום ${money(info.amount)}`}
                </button>
                <p style={{ fontSize: 13, color: '#656A56', marginTop: 12, lineHeight: 1.7 }}>כרטיס אשראי, ביט, Apple Pay או Google Pay.<br />התשלום מאובטח ועובר דרך Grow. פרטי הכרטיס לא נשמרים אצלנו.</p>
              </>
            )}
            {phase === 'open' && <p style={{ fontSize: 15, color: '#656A56' }}>השלימי את התשלום בחלון שנפתח.</p>}
            {phase === 'confirming' && <p data-testid="pay-confirming" style={{ fontSize: 17 }}>התשלום עבר, רגע מאשרות אותו…</p>}
            {phase === 'paid' && (
              <div data-testid="pay-paid">
                <p style={{ fontSize: 40, margin: 0 }}>🌸</p>
                <h2 style={{ fontSize: 24, margin: '6px 0', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)' }}>התשלום התקבל, תודה!</h2>
                <p style={{ fontSize: 15, color: '#656A56' }}>{money(info.amount)}{info.description ? ` · ${info.description}` : ''}</p>
              </div>
            )}
            {phase === 'late' && <p data-testid="pay-late" style={{ fontSize: 16, lineHeight: 1.7 }}>התשלום עבר ב-Grow, והאישור בדרך אל העסק. אין צורך לשלם שוב. 🌸</p>}
            {msg && phase === 'ready' && <p role="alert" style={{ color: '#B3261E', fontSize: 14, marginTop: 12 }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
