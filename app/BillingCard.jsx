'use client';

// app/BillingCard.jsx
//
// Settings > "העסק שלי": her Kalmea subscription. The plan and price, when the next charge is, the saved card (add or update it on the provider's
// HOSTED page: card details never touch Kalmea), her billing history with the invoice links, and cancel.
//
// Invisible unless the deployment has switched billing on (BILLING_UI_ENABLED, default off): /api/billing/status answers 404 and nothing renders.
// It stays reachable when her plan is on hold (a blocked business must be able to pay), because none of the billing routes use the plan guard.
// In mock mode the card says it is a test run: nobody is ever charged.

import { useCallback, useEffect, useState } from 'react';
import { trialEndDateHe } from '@/lib/planCopy';
import { subscriptionDoc } from '@/lib/kalmeaBusiness';
import { billingConsentTextHe, BILLING_TERMS_SENTENCE_HE } from '@/lib/billing/consent';
import { KALMEA_TERMS_HREF } from '@/lib/paymentTerms';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;
const day = (iso) => (iso ? trialEndDateHe(new Date(iso)) : '');

export default function BillingCard({ pc, pcTint, toast, isDemo }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The required tick before the card page opens (lib/billing/consent.ts); the server refuses without it too.
  const [consentOk, setConsentOk] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/billing/status');
      const j = await r.json().catch(() => null);
      setS(r.ok && j && j.success ? j : { hidden: true });
    } catch { setS({ hidden: true }); }
  }, []);
  useEffect(() => {
    load();
    // She comes back from the card page in the same tab or another one: refresh when this one is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (!s || s.hidden) return null;

  const openCardPage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/billing/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: consentOk === true }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו לפתוח את דף הכרטיס', 'error'); return; }
      window.location.assign(j.url);
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/billing/cancel', { method: 'POST' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'הביטול נכשל, נסי שוב', 'error'); return; }
      toast?.('המנוי בוטל');
      setConfirmCancel(false);
      await load();
    } finally { setBusy(false); }
  };

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 };
  const text = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7 };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const primary = { background: pcTint, border: `1px dashed ${pc}`, borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--pc-text, var(--ink))', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };

  let body;
  if (s.tableReady === false) {
    body = <p style={text}>ניהול המנוי עוד לא הופעל בחשבון. נעדכן כשהוא זמין, ועד אז הכול ממשיך לעבוד כרגיל.</p>;
  } else {
    const sub = s.subscription;
    const status = s.plan.status;
    const hasCard = !!sub?.card_last4;
    let line;
    if (sub?.status === 'canceled') line = `המנוי בוטל. את ממשיכה לעבוד עד ${day(sub.ends_at)}, ואז החשבון עובר למצב צפייה בלבד. כל הנתונים נשארים.`;
    else if (sub?.status === 'past_due') line = `החיוב האחרון נכשל. כדי להמשיך לעבוד בלי הפסקה, עדכני כרטיס${sub.graceEndsAt ? ` עד ${day(sub.graceEndsAt)}` : ''}. ננסה שוב אוטומטית בימים הקרובים.`;
    else if (status === 'expired' || status === 'paused') line = 'החשבון במצב צפייה בלבד. הוספת כרטיס וחיוב ישחררו אותו מיד.';
    else if (status === 'trial' || sub?.status === 'trialing') line = `תקופת ההתנסות עד ${day(s.plan.trialEndsAt || sub?.next_charge_at)}. ${hasCard ? `החיוב הראשון, ${money(s.plan.price)}, יהיה בתום ההתנסות.` : 'כדי שלא תהיה הפסקה, אפשר להוסיף כרטיס כבר עכשיו. לא יחויב כלום עד סוף ההתנסות.'}`;
    else if (sub?.next_charge_at) line = `החיוב הבא: ${day(sub.next_charge_at)}.`;
    else line = 'המנוי פעיל.';

    body = (
      <>
        <p style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{money(s.plan.price)} <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-2)' }}>לחודש</span></p>
        <p data-testid="billing-line" style={{ ...text, marginBottom: 10 }}>{line}</p>

        {hasCard && <p style={{ ...text, marginBottom: 8 }}>כרטיס שמור: <b dir="ltr">•••• {sub.card_last4}</b></p>}
        {!isDemo && s.configured && (
          <label data-testid="billing-consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 10, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <input type="checkbox" checked={consentOk} onChange={(e) => setConsentOk(e.target.checked)} style={{ accentColor: pc, width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
            <span>{billingConsentTextHe(s.plan.price).replace(BILLING_TERMS_SENTENCE_HE, '')}קראתי ואני מסכימה ל<a href={KALMEA_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>תנאי השימוש</a> של קלמיה.</span>
          </label>
        )}
        {!isDemo && s.configured && sub?.status !== 'canceled' && (
          <button type="button" style={{ ...primary, opacity: consentOk ? 1 : 0.55 }} disabled={busy || !consentOk} onClick={openCardPage}>{hasCard ? 'עדכון כרטיס' : 'הוספת כרטיס אשראי'}</button>
        )}
        {!isDemo && s.configured && sub?.status === 'canceled' && (
          <button type="button" style={{ ...primary, opacity: consentOk ? 1 : 0.55 }} disabled={busy || !consentOk} onClick={openCardPage}>חידוש המנוי בכרטיס אשראי</button>
        )}
        {!s.configured && <p style={text}>התשלום בכרטיס אשראי עוד לא פעיל. כשיהיה זמין תוכלי להוסיף כרטיס כאן.</p>}

        {s.payments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>היסטוריית חיובים</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="billing-history">
              {s.payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: pcTint, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                  <span>{day(p.created_at)} · {money(p.amount)}{p.kind === 'manual' ? ' · שולם ישירות' : ''}</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <b style={{ color: p.status === 'succeeded' ? 'var(--success)' : p.status === 'failed' ? 'var(--danger)' : 'var(--ink-3)' }}>{p.status === 'succeeded' ? 'שולם' : p.status === 'failed' ? 'נכשל' : 'בבדיקה מול Grow'}</b>
                    {p.status === 'succeeded' && !p.invoice_url && p.invoice_status === 'pending' && <span style={{ color: 'var(--ink-3)' }}>הקבלה בדרך</span>}
                    {p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--pc-text, var(--ink))', fontWeight: 700 }}>{subscriptionDoc(p.amount).labelHe}{p.invoice_number ? ` ${p.invoice_number}` : ''}</a>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isDemo && sub && sub.status !== 'canceled' && (
          <div style={{ marginTop: 14 }}>
            {!confirmCancel ? (
              <button type="button" style={ghost} onClick={() => setConfirmCancel(true)}>ביטול המנוי</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={text}>לבטל? את ממשיכה לעבוד עד סוף התקופה ששולמה, והנתונים נשארים שלך.</span>
                <button type="button" style={ghost} disabled={busy} onClick={cancel}>כן, לבטל</button>
                <button type="button" style={ghost} onClick={() => setConfirmCancel(false)}>לא</button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div data-testid="billing-card" style={box}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>המנוי שלי בקלמיה</p>
      {s.mode === 'mock' && <p data-testid="billing-mock" style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink)', background: 'var(--brand-tint, #FBEDE9)', borderRadius: 'var(--r-sm)', padding: '6px 10px', marginBottom: 8 }}>מצב בדיקה: לא נגבה כסף אמיתי</p>}
      {body}
    </div>
  );
}
