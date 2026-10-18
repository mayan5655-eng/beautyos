'use client';

// app/BillingNotices.jsx
//
// The trial banner plus what billing adds to it. It wraps the existing TrialBanner (which is unchanged apart from an optional `cta` slot) and
// leaves its WhatsApp button in place as the fallback:
//   - from INVITE_DAYS (5) before the trial ends, the banner offers "add a card";
//   - when the plan is on hold (expired), it offers "pay and continue", which opens her billing screen: billing stays reachable while blocked;
//   - when a monthly charge failed and she is still inside the grace period, a notice says so and when access would pause.
// Everything here is invisible unless billing is switched on for the deployment (/api/billing/status answers 404 otherwise).

import { useEffect, useState } from 'react';
import TrialBanner from './TrialBanner';
import { trialEndDateHe } from '@/lib/planCopy';

export default function BillingNotices({ plan, onOpenBilling, isDemo, ...banner }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    if (isDemo) return undefined;
    let alive = true;
    fetch('/api/billing/status').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.success) setS(j); }).catch(() => {});
    return () => { alive = false; };
  }, [isDemo]);

  const sub = s?.subscription || null;
  const canPay = !!(s && s.configured && s.tableReady !== false && !isDemo);
  const invite = canPay && plan?.tone === 'urgent' && plan?.isTrial && plan?.daysRemaining !== null && plan.daysRemaining <= (s.inviteDays ?? 5) && !sub?.card_last4;
  const payToContinue = canPay && plan?.tone === 'blocked' && plan?.status === 'expired';

  const cta = (invite || payToContinue) ? (
    <button
      type="button"
      onClick={onOpenBilling}
      data-testid="billing-cta"
      className="primary-btn"
      style={{ background: banner.pcGrad, color: 'var(--surface)', fontSize: 'var(--t-sm)', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-accent)', flexShrink: 0 }}
    >
      {payToContinue ? 'תשלום וחזרה לעבודה' : 'הוספת כרטיס אשראי'}
    </button>
  ) : null;

  const pastDue = canPay && sub?.status === 'past_due' && plan?.tone !== 'blocked';

  return (
    <>
      <TrialBanner plan={plan} cta={cta} {...banner} />
      {pastDue && (
        <div role="status" data-testid="billing-past-due" style={{ maxWidth: 1180, margin: '0 auto 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>החיוב החודשי נכשל</p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {sub.graceEndsAt ? `כדי להמשיך לעבוד בלי הפסקה, עדכני כרטיס עד ${trialEndDateHe(new Date(sub.graceEndsAt))}. ` : ''}ננסה שוב אוטומטית, וכל מה שיצרת נשאר שלך.
            </p>
          </div>
          <button type="button" onClick={onOpenBilling} className="primary-btn" style={{ background: banner.pcGrad, color: 'var(--surface)', fontSize: 'var(--t-sm)', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>עדכון כרטיס</button>
        </div>
      )}
    </>
  );
}
