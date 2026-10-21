'use client';

// app/BillingNotices.jsx
//
// The trial banner plus what billing adds to it. It wraps the existing TrialBanner (which is unchanged apart from an optional `cta` slot) and
// leaves its WhatsApp button in place as the fallback:
//   - from INVITE_DAYS (5) before the trial ends, the banner offers "add a card";
//   - when the plan is on hold (expired), it offers "pay and continue", which opens her billing screen: billing stays reachable while blocked;
//   - when a monthly charge failed and she is still inside the grace period, a notice says so and when access would pause.
// Everything here is invisible unless billing is switched on for the deployment (/api/billing/status answers 404 otherwise).
// With the upgrade buttons on (NEXT_PUBLIC_UPGRADE_BUTTONS, lib/pricing.ts) she can also join from the first day of the trial: a quiet
// button on the gentle line, a full one on the urgent card, both with her price, both opening the same billing screen. Off = unchanged.

import { useEffect, useState } from 'react';
import TrialBanner from './TrialBanner';
import { trialEndDateHe, upgradeCtaHe, payToContinueHe, UPGRADE_HINT_HE } from '@/lib/planCopy';
import { PLAN_PRICES, upgradeButtonsEnabled } from '@/lib/pricing';

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
  // Her own price: her subscription's, else her agreed price, else the regular one (the status route resolves the first two).
  const price = Number(s?.plan?.price) > 0 ? Number(s.plan.price) : PLAN_PRICES.regular;
  const upgradeOn = upgradeButtonsEnabled();
  const upgrade = upgradeOn && canPay && plan?.isTrial && (plan?.tone === 'gentle' || plan?.tone === 'urgent') && !sub?.card_last4;

  if (upgrade && plan.tone === 'gentle') {
    // The gentle line stays a line: a small text button, not a card.
    const quiet = (
      <button
        type="button"
        onClick={onOpenBilling}
        data-testid="upgrade-cta"
        style={{ background: 'none', border: 'none', padding: '0 4px', minHeight: 44, color: banner.pcDeep, fontWeight: 700, fontSize: 'var(--t-sm)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginInlineStart: 'auto' }}
      >
        {upgradeCtaHe(price)}
      </button>
    );
    return <TrialBanner plan={plan} cta={quiet} {...banner} />;
  }

  const label = payToContinue ? (upgradeOn ? payToContinueHe(price) : 'תשלום וחזרה לעבודה') : (upgrade ? upgradeCtaHe(price) : 'הוספת כרטיס אשראי');
  const button = (invite || payToContinue || upgrade) ? (
    <button
      type="button"
      onClick={onOpenBilling}
      data-testid={upgrade ? 'upgrade-cta' : 'billing-cta'}
      className="primary-btn"
      style={{ background: banner.pcGrad, color: 'var(--surface)', fontSize: 'var(--t-sm)', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-accent)', flexShrink: 0 }}
    >
      {label}
    </button>
  ) : null;
  const cta = button && upgrade ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {button}
      <span style={{ fontSize: 'var(--t-xs, 12px)', color: 'var(--ink-2)' }}>{UPGRADE_HINT_HE}</span>
    </div>
  ) : button;

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
