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
import { billingConsentTextHe, billingAnnualConsentTextHe, billingMonthlyConsentTextHe, BILLING_TERMS_SENTENCE_HE } from '@/lib/billing/consent';
import { annualOfferHe } from '@/lib/planCopy';
import { KALMEA_TERMS_HREF } from '@/lib/paymentTerms';
import { priceHe } from '@/lib/pricing';

const money = (n) => `₪${Math.round(Number(n) * 100) / 100}`;
const day = (iso) => (iso ? trialEndDateHe(new Date(iso)) : '');

export default function BillingCard({ pc, pcTint, toast, isDemo }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  // Shown under the button, not only as a toast: on the blocked screen (PlanBlockedScreen) there is no toast stack, so a failed card
  // page was a button that did nothing (2026-11-02 audit).
  const [cardErr, setCardErr] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The required tick before the card page opens (lib/billing/consent.ts); the server refuses without it too.
  const [consentOk, setConsentOk] = useState(false);
  // Add-on packs (lib/pricing.ts, only when the status route sends `addons`): the pack she tapped, waiting for her "yes, charge".
  const [confirmPack, setConfirmPack] = useState(null);
  // The yearly plan (only when the status route sends `annual`, NEXT_PUBLIC_ANNUAL_PLAN): the plan she tapped, waiting for her tick.
  const [periodAsk, setPeriodAsk] = useState(null);
  const [periodOk, setPeriodOk] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/billing/status');
      const j = await r.json().catch(() => null);
      // Hidden only when billing is off (hidden / 404). A failed read shows an error with a retry: a past-due owner sent here by the
      // banner's "עדכון כרטיס" used to find no billing card at all.
      if (r.ok && j && j.success) setS(j);
      else setS(j?.hidden || r.status === 404 ? { hidden: true } : { failed: true });
    } catch { setS({ failed: true }); }
  }, []);
  useEffect(() => {
    load();
    // She comes back from the card page in the same tab or another one: refresh when this one is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (!s || s.hidden) return null;
  if (s.failed) {
    return (
      <div data-testid="billing-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>המנוי שלך</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 10 }}>לא הצלחנו לטעון את פרטי המנוי.</p>
        <button type="button" onClick={load} style={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>לנסות שוב</button>
      </div>
    );
  }

  const openCardPage = async () => {
    if (busy) return;
    setBusy(true);
    setCardErr('');
    try {
      const r = await fetch('/api/billing/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: consentOk === true }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { const m = j?.error || 'לא הצלחנו לפתוח את דף הכרטיס'; setCardErr(m); toast?.(m, 'error'); return; }
      window.location.assign(j.url);
    } catch {
      setCardErr('אין חיבור. דף הכרטיס לא נפתח, נסי שוב'); toast?.('אין חיבור. דף הכרטיס לא נפתח, נסי שוב', 'error');
    } finally { setBusy(false); }
  };

  const buyPack = async (key) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/billing/addon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: key }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'החיוב לא הצליח, נסי שוב', r.status === 202 ? 'info' : 'error'); return; }
      toast?.('החבילה נוספה, אפשר להמשיך ליצור 🌸');
      setConfirmPack(null);
      await load();
    } catch {
      // A lost answer is not a refusal: the charge may have gone through. Re-read and say so honestly (Vercel review 2026-11-09).
      toast?.('לא קיבלנו תשובה. בודקות אם החיוב עבר, ואם כן החבילה תופיע כאן', 'info');
      setConfirmPack(null);
      await load();
    } finally { setBusy(false); }
  };

  const choosePeriod = async (period) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/billing/period', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, consent: periodOk === true }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'לא הצלחנו לשמור, נסי שוב', 'error'); return; }
      toast?.(j.pendingPeriod ? 'נשמר. המעבר ייכנס לתוקף בחידוש הבא 🌸' : 'נשמר, המסלול נשאר כמו שהיה');
      setPeriodAsk(null); setPeriodOk(false);
      await load();
    } catch {
      toast?.('אין חיבור. לא נשמר, נסי שוב', 'error');
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
    } catch {
      toast?.('אין חיבור. המנוי לא בוטל, נסי שוב', 'error');
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
    // The yearly plan: her plan now, and a switch that waits for the renewal.
    const an = s.annual || null;
    const yearly = an?.billingPeriod === 'annual';
    const nextPeriod = an?.pendingPeriod || an?.billingPeriod || 'monthly';
    let line;
    if (sub?.status === 'canceled') line = `המנוי בוטל. את ממשיכה לעבוד עד ${day(sub.ends_at)}, ואז המערכת נסגרת עד לחידוש. כל הנתונים נשמרים.`;
    else if (sub?.status === 'past_due') line = `החיוב האחרון נכשל. כדי להמשיך לעבוד בלי הפסקה, עדכני כרטיס${sub.graceEndsAt ? ` עד ${day(sub.graceEndsAt)}` : ''}. ננסה שוב אוטומטית בימים הקרובים.`;
    else if (status === 'paused') line = 'החשבון מושהה בהסדר איתנו, והמערכת סגורה בינתיים. כדי לחדש אותו, כתבי לנו בוואטסאפ ונחזיר אותו לפעילות.';
    else if (status === 'expired') line = 'המערכת סגורה עד לחידוש המנוי. הוספת כרטיס וחיוב יפתחו אותה מיד, עם כל הנתונים כמו שהיו.';
    else if (status === 'trial' || sub?.status === 'trialing') line = `תקופת ההתנסות עד ${day(s.plan.trialEndsAt || sub?.next_charge_at)}. ${hasCard ? `החיוב הראשון, ${money(nextPeriod === 'annual' && an ? an.yearly : s.plan.price)}, יהיה בתום ההתנסות.` : 'כדי שלא תהיה הפסקה, אפשר להוסיף כרטיס כבר עכשיו. לא יחויב כלום עד סוף ההתנסות.'}`;
    else if (sub?.next_charge_at) line = `החיוב הבא: ${day(sub.next_charge_at)}.`;
    else line = 'המנוי פעיל.';

    body = (
      <>
        <p style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{yearly ? money(an.yearly) : money(s.plan.price)} <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-2)' }}>{yearly ? 'לשנה' : 'לחודש'}</span></p>
        <p data-testid="billing-line" style={{ ...text, marginBottom: 10 }}>{line}</p>

        {hasCard && <p style={{ ...text, marginBottom: 8 }}>כרטיס שמור: <b dir="ltr">•••• {sub.card_last4}</b></p>}
        {/* Paused is an arrangement with us: a saved card does not reopen it (lib/billing/service.ts), so no card form (2026-11-02 audit). */}
        {!isDemo && s.configured && status !== 'paused' && (
          <label data-testid="billing-consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 10, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <input type="checkbox" checked={consentOk} onChange={(e) => setConsentOk(e.target.checked)} style={{ accentColor: pc, width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
            <span>{(nextPeriod === 'annual' ? billingAnnualConsentTextHe(an.yearly, '') : billingConsentTextHe(s.plan.price)).replace(BILLING_TERMS_SENTENCE_HE, '')}קראתי ואני מסכימה ל<a href={KALMEA_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>תנאי השימוש</a> של קלמיה.</span>
          </label>
        )}
        {!isDemo && s.configured && status !== 'paused' && sub?.status !== 'canceled' && (
          <button type="button" style={{ ...primary, opacity: consentOk ? 1 : 0.55 }} disabled={busy || !consentOk} onClick={openCardPage}>{hasCard ? 'עדכון כרטיס' : 'הוספת כרטיס אשראי'}</button>
        )}
        {!isDemo && s.configured && status !== 'paused' && sub?.status === 'canceled' && (
          <button type="button" style={{ ...primary, opacity: consentOk ? 1 : 0.55 }} disabled={busy || !consentOk} onClick={openCardPage}>חידוש המנוי בכרטיס אשראי</button>
        )}
        {cardErr && <p role="alert" data-testid="billing-card-error" style={{ ...text, color: 'var(--danger)', fontWeight: 700, marginTop: 8 }}>{cardErr}</p>}
        {!s.configured && <p style={text}>התשלום בכרטיס אשראי עוד לא פעיל. כשיהיה זמין תוכלי להוסיף כרטיס כאן.</p>}

        {an && (
          <div data-testid="billing-period" style={{ marginTop: 16 }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>מסלול תשלום</p>
            {!an.ready ? (
              <p style={text}>התשלום השנתי עוד לא פעיל בחשבון. נעדכן כשהוא זמין.</p>
            ) : (
              <>
                <div role="radiogroup" aria-label="מסלול תשלום" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { k: 'monthly', title: 'חודשי', line: `${priceHe(an.monthly)} לחודש` },
                    { k: 'annual', title: 'שנתי', line: annualOfferHe(an.monthly) },
                  ].map((o) => {
                    const on = nextPeriod === o.k;
                    return (
                      <button key={o.k} type="button" role="radio" aria-checked={on} data-testid={`billing-period-${o.k}`}
                        disabled={busy || isDemo || !sub || sub.status === 'canceled'}
                        onClick={() => { if (!on) { setPeriodAsk(o.k); setPeriodOk(false); } }}
                        style={{ textAlign: 'right', background: on ? pcTint : 'var(--surface)', border: on ? `1.5px solid ${pc}` : '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', cursor: on ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 44, color: 'var(--ink)' }}>
                        <b style={{ fontSize: 'var(--t-sm)' }}>{o.title}{on ? ' ✓' : ''}</b>
                        <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', unicodeBidi: 'isolate' }}>{o.line}</span>
                      </button>
                    );
                  })}
                </div>
                {an.pendingPeriod && (
                  <p data-testid="billing-period-pending" style={{ ...text, marginTop: 8 }}>
                    {an.pendingPeriod === 'annual' ? 'המעבר לתשלום שנתי' : 'החזרה לתשלום חודשי'} ייכנס לתוקף בחידוש הבא{sub?.next_charge_at ? `, ב-${day(sub.next_charge_at)}` : ''}. עד אז לא משתנה דבר ולא יהיה חיוב נוסף.
                  </p>
                )}
                {!sub && <p style={{ ...text, marginTop: 8 }}>אחרי שמירת כרטיס אפשר לבחור תשלום שנתי.</p>}
                {periodAsk && sub && (
                  <div style={{ marginTop: 10, background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                      <input type="checkbox" data-testid="billing-period-consent" checked={periodOk} onChange={(e) => setPeriodOk(e.target.checked)} style={{ accentColor: pc, width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
                      <span>{(periodAsk === 'annual' ? billingAnnualConsentTextHe(an.yearly, day(sub.next_charge_at)) : billingMonthlyConsentTextHe(an.monthly, day(sub.next_charge_at))).replace(BILLING_TERMS_SENTENCE_HE, '')}קראתי ואני מסכימה ל<a href={KALMEA_TERMS_HREF} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>תנאי השימוש</a> של קלמיה.</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" data-testid="billing-period-confirm" style={{ ...ghost, background: pc, color: 'var(--pc-contrast)', border: 'none', opacity: periodOk ? 1 : 0.55 }} disabled={busy || !periodOk} onClick={() => choosePeriod(periodAsk)}>{periodAsk === 'annual' ? 'כן, לעבור לשנתי' : 'כן, לחזור לחודשי'}</button>
                      <button type="button" style={ghost} disabled={busy} onClick={() => { setPeriodAsk(null); setPeriodOk(false); }}>ביטול</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {Array.isArray(s.addons) && s.addons.length > 0 && (
          <div id="billing-addons" data-testid="billing-addons" style={{ marginTop: 16, scrollMarginTop: 80 }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>מה כלול החודש, ותוספות</p>
            <p style={{ ...text, marginBottom: 8 }}>הכמויות מתחדשות בראשון לחודש. חבילה שמוסיפים היא לחודש הנוכחי בלבד.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.addons.map((a) => {
                const full = a.used !== null && a.cap !== null && a.used >= a.cap;
                return (
                  <div key={a.key} data-testid={`addon-${a.key}`} style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600 }}>
                        {/* Each part isolated: "AI" inside the label is Latin, and next to digits it would drag the numbers out of order. */}
                        <bdi>{a.label}</bdi>: <b style={{ color: full ? 'var(--danger)' : 'var(--ink)', unicodeBidi: 'isolate' }}>{a.used === null ? '…' : a.used} מתוך {a.cap}</b>
                        {a.purchased > 0 && <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}> (כולל {a.purchased} שהוספת)</span>}
                      </span>
                      {!isDemo && s.configured && confirmPack !== a.key && (
                        <button type="button" data-testid={`addon-buy-${a.key}`} style={{ ...primary, minHeight: 40, padding: '8px 12px' }} disabled={busy} onClick={() => setConfirmPack(a.key)}>{a.button}</button>
                      )}
                    </div>
                    {confirmPack === a.key && (
                      hasCard ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ ...text, flex: '1 1 180px' }}>לחייב {priceHe(a.price)} בכרטיס שמסתיים ב-<b dir="ltr" style={{ unicodeBidi: 'isolate' }}>{sub.card_last4}</b>, חיוב אחד לחודש הזה?</span>
                          <button type="button" data-testid={`addon-confirm-${a.key}`} style={{ ...ghost, background: pc, color: 'var(--pc-contrast)', border: 'none' }} disabled={busy} onClick={() => buyPack(a.key)}>{busy ? 'מחייבת…' : 'כן, להוסיף'}</button>
                          <button type="button" style={ghost} disabled={busy} onClick={() => setConfirmPack(null)}>ביטול</button>
                        </div>
                      ) : (
                        <p style={{ ...text, marginTop: 8 }}>כדי להוסיף חבילה צריך כרטיס שמור. אפשר להוסיף אותו כאן למעלה.</p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {s.payments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>היסטוריית חיובים</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="billing-history">
              {s.payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', background: pcTint, borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
                  <span>{day(p.created_at)} · {money(p.amount)}{p.kind === 'manual' ? ' · שולם ישירות' : p.kind === 'addon' ? ' · תוספת' : an && p.period_start && p.period_end && Date.parse(p.period_end) - Date.parse(p.period_start) > 40 * 864e5 ? ' · שנתי' : ''}</span>
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
    <div id="billing-card" data-testid="billing-card" style={{ ...box, scrollMarginTop: 80 }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>המנוי שלי בקלמיה</p>
      {s.mode === 'mock' && <p data-testid="billing-mock" style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink)', background: 'var(--brand-tint, #FBEDE9)', borderRadius: 'var(--r-sm)', padding: '6px 10px', marginBottom: 8 }}>מצב בדיקה: לא נגבה כסף אמיתי</p>}
      {body}
    </div>
  );
}
