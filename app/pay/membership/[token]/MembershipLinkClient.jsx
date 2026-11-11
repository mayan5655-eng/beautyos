'use client';

// app/pay/membership/[token]/MembershipLinkClient.jsx
//
// The client's side of a membership (app/api/memberships/link): warm and short, in the voice of her business, in its colour.
//   join     the plan, the exact consent words, one required tick, then Grow's secure page to save the card (Grow keeps the card number,
//            Kalmea never sees it). Back from Grow, the page waits for OUR record to say the card is saved before it says so.
//   member   what is left this month, the next charge, and "ביטול המנוי" (after the plan's minimum months), with one confirm.

import { useCallback, useEffect, useRef, useState } from 'react';
import { contrastOn, readableAccentText, DEFAULT_ACCENT } from '@/lib/theme';

const card = { background: '#fff', border: '1px solid #E8DFD0', borderRadius: 20, padding: '26px 20px', maxWidth: 440, margin: '0 auto', boxShadow: '0 6px 24px rgba(31,58,48,.06)' };

export default function MembershipLinkClient({ token }) {
  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | opening | confirming | error | gone
  const [msg, setMsg] = useState('');
  const [agree, setAgree] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async () => {
    if (!/^[0-9a-f]{48}$/.test(String(token || ''))) { setPhase('gone'); return null; }
    try {
      const r = await fetch(`/api/memberships/link?t=${encodeURIComponent(token)}`);
      const j = await r.json().catch(() => null);
      if (r.status === 404) { setPhase('gone'); return null; }
      if (!r.ok || !j?.success) { setMsg('יש עומס רגעי. נסי לרענן בעוד רגע.'); setPhase('error'); return null; }
      setInfo(j);
      return j;
    } catch {
      setMsg('אין חיבור כרגע. נסי לרענן בעוד רגע.'); setPhase('error'); return null;
    }
  }, [token]);

  useEffect(() => {
    let stop = false;
    (async () => {
      const j = await load();
      if (!j || stop) return;
      const back = typeof window !== 'undefined' && /[?&]grow=paid/.test(window.location.search);
      // Back from Grow's page: "saved" only once OUR record says so (Grow's callback), checked for about half a minute.
      if (back && (j.status === 'awaiting_card' || j.status === 'awaiting_consent')) {
        setPhase('confirming');
        const tick = async () => {
          if (stop) return;
          polls.current += 1;
          const k = await load();
          if (k && k.status !== 'awaiting_card' && k.status !== 'awaiting_consent') { setPhase('ready'); return; }
          if (polls.current < 10) setTimeout(tick, 3000); else setPhase('ready');
        };
        setTimeout(tick, 2500);
        return;
      }
      setPhase('ready');
    })();
    return () => { stop = true; };
  }, [load]);

  const start = async () => {
    if (!agree || !info) return;
    setPhase('opening'); setMsg('');
    try {
      const r = await fetch('/api/memberships/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, action: 'start', agree: true, consentText: info.consentText }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.success && j.url) { window.location.href = j.url; return; }
      setMsg(j?.error || 'לא הצלחנו לפתוח את הדף המאובטח. נסי שוב בעוד רגע.');
      if (j?.code === 'changed') await load();
      setPhase('ready');
    } catch {
      setMsg('אין חיבור כרגע. נסי שוב בעוד רגע.'); setPhase('ready');
    }
  };

  const cancel = async () => {
    if (!askCancel) { setAskCancel(true); return; }
    setAskCancel(false); setPhase('opening');
    try {
      const r = await fetch('/api/memberships/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, action: 'cancel' }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) setMsg(j?.error || 'לא הצלחנו לבטל כרגע. נסי שוב בעוד רגע.');
      await load();
    } finally { setPhase('ready'); }
  };

  const accent = info?.accent || DEFAULT_ACCENT;
  const onAccent = contrastOn(accent);
  const accentText = readableAccentText(accent);
  const waiting = info && (info.status === 'awaiting_consent' || info.status === 'awaiting_card');
  const button = (enabled) => ({ width: '100%', minHeight: 52, borderRadius: 14, border: 'none', background: accent, color: onAccent, fontSize: 18, fontWeight: 700, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.55, fontFamily: 'inherit' });

  return (
    <div dir="rtl" lang="he" data-testid="membership-page" style={{ minHeight: '100vh', background: '#FBF8F1', padding: '32px 16px', fontFamily: 'var(--font-assistant, Assistant, system-ui, sans-serif)', color: '#1F3A30' }}>
      <div style={card}>
        {info?.businessName && <p style={{ fontSize: 15, color: '#656A56', marginBottom: 6, textAlign: 'center' }}>{info.businessName}</p>}
        {phase === 'loading' && <p style={{ textAlign: 'center' }}>רגע, פותחות את הדף…</p>}
        {phase === 'gone' && <p style={{ fontSize: 17, lineHeight: 1.7, textAlign: 'center' }}>הקישור הזה לא תקין או שכבר לא פעיל. אפשר לבקש מהעסק קישור חדש.</p>}
        {phase === 'error' && <p style={{ color: '#B3261E', textAlign: 'center' }}>{msg}</p>}

        {info && phase !== 'loading' && phase !== 'gone' && phase !== 'error' && (
          <>
            <h1 style={{ fontSize: 28, margin: '4px 0 2px', fontFamily: 'var(--font-frank, "Frank Ruhl Libre", serif)', fontWeight: 600, textAlign: 'center' }}>{info.plan.name}</h1>
            <p style={{ fontSize: 16, color: '#656A56', textAlign: 'center', marginBottom: 16 }}>{info.plan.line}</p>

            {phase === 'confirming' && <p data-testid="membership-confirming" style={{ fontSize: 16, lineHeight: 1.7, textAlign: 'center' }}>רגע, מוודאות שהכרטיס נשמר…</p>}

            {waiting && phase !== 'confirming' && (
              info.canStart ? (
                <>
                  <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 12 }}>היי{info.clientFirstName ? ` ${info.clientFirstName}` : ''} 🌸 כאן מצטרפים למנוי. קראי את התנאים, אשרי, ובשלב הבא שומרים כרטיס בדף המאובטח של Grow.</p>
                  <label data-testid="membership-consent" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, border: `1px solid ${agree ? accent : '#E8DFD0'}`, background: '#FDFBF9', marginBottom: 14, cursor: 'pointer', fontSize: 15, lineHeight: 1.65 }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-label="אישור תנאי המנוי" style={{ width: 20, height: 20, marginTop: 3, flexShrink: 0, accentColor: accent }} />
                    <span>{info.consentText}</span>
                  </label>
                  <button type="button" data-testid="membership-start" onClick={start} disabled={!agree || phase === 'opening'} style={button(agree && phase !== 'opening')}>{phase === 'opening' ? 'פותחת…' : 'המשך לשמירת כרטיס'}</button>
                  <p style={{ fontSize: 13, color: '#656A56', marginTop: 10, lineHeight: 1.6, textAlign: 'center' }}>פרטי הכרטיס נכתבים רק בדף של Grow ולא נשמרים אצלנו.</p>
                </>
              ) : (
                <p style={{ fontSize: 16, lineHeight: 1.7, textAlign: 'center' }}>ההצטרפות לא זמינה כרגע. אפשר לפנות לבעלת העסק.</p>
              )
            )}

            {!waiting && phase !== 'confirming' && (
              <>
                {info.status === 'cancelled' ? (
                  <p data-testid="membership-cancelled" style={{ fontSize: 16, lineHeight: 1.7, textAlign: 'center' }}>המנוי בוטל ולא יהיו חיובים נוספים. {info.credits && !/^אין/.test(info.credits) ? `${info.credits} עד סוף החודש ששולם.` : ''}</p>
                ) : (
                  <div data-testid="membership-active" style={{ background: '#FBF8F1', border: '1px solid #E8DFD0', borderRadius: 14, padding: '12px 14px', fontSize: 16, lineHeight: 1.75 }}>
                    <div>{info.status === 'active' ? 'המנוי פעיל ✓' : info.status === 'paused' ? 'המנוי מושהה כרגע' : 'החיוב החודשי ממתין'}</div>
                    {info.credits && <div><b>{info.credits}</b></div>}
                    {info.status === 'active' && info.nextChargeOn && <div style={{ color: '#656A56', fontSize: 15 }}>החיוב הבא ב-{info.nextChargeOn}</div>}
                  </div>
                )}
                {info.consentText && info.consentedAt && (
                  <details style={{ marginTop: 14, fontSize: 14, color: '#656A56' }}>
                    <summary style={{ cursor: 'pointer', minHeight: 32 }}>התנאים שאישרת</summary>
                    <p style={{ lineHeight: 1.65, marginTop: 6 }}>{info.consentText}</p>
                  </details>
                )}
                {info.canCancel && (
                  <div style={{ marginTop: 16 }}>
                    {askCancel && <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>לבטל את המנוי? לא יהיו חיובים נוספים, והטיפולים ששולמו נשארים לך עד סוף החודש.</p>}
                    <button type="button" data-testid="membership-cancel" onClick={cancel} disabled={phase === 'opening'} style={{ width: '100%', minHeight: 48, borderRadius: 14, border: askCancel ? 'none' : `1px solid ${accentText}`, background: askCancel ? '#B3261E' : '#fff', color: askCancel ? '#fff' : accentText, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{askCancel ? 'כן, לבטל את המנוי' : 'ביטול המנוי'}</button>
                    {askCancel && <button type="button" onClick={() => setAskCancel(false)} style={{ width: '100%', minHeight: 44, marginTop: 6, background: 'none', border: 'none', color: '#656A56', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>לא, להשאיר</button>}
                  </div>
                )}
                {!info.canCancel && info.cancelFrom && info.status !== 'cancelled' && <p style={{ fontSize: 14, color: '#656A56', marginTop: 14, textAlign: 'center' }}>לפי תנאי המנוי אפשר לבטל אחרי החיוב של {info.cancelFrom}.</p>}
              </>
            )}
            {msg && <p role="alert" style={{ color: '#B3261E', marginTop: 12, textAlign: 'center' }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
