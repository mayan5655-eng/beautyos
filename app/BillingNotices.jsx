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
//
// The payment pop-up (owner request 2026-11-18, "a payment page should pop up for her"): every button here opens her billing card in a
// pop-up over the dashboard instead of sending her to Settings, and the pop-up opens BY ITSELF once a day while she is inside the last
// INVITE_DAYS of the trial without a card, or while a monthly charge has failed. "אחר כך" closes it until tomorrow. Never for the demo or a
// founder (free for life). The closed business never needs it: PlanBlockedScreen already carries the billing card itself.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import TrialBanner from './TrialBanner';
import { trialEndDateHe, upgradeCtaHe, payToContinueHe, UPGRADE_HINT_HE } from '@/lib/planCopy';
import { defaultPlanPrice, upgradeButtonsEnabled } from '@/lib/pricing';
import { LAUNCH_PRICE_CUTOFF_ISO } from '@/lib/ownerControl';
import { tr, trv } from "@/lib/i18n/tr";

const BillingCard = dynamic(() => import('./BillingCard'), { ssr: false });

// Once a day at most: the date she last saw it (or closed it), per browser. Storage can be missing or throw; then it simply opens.
const POPUP_KEY = 'kalmea-billing-popup-day';
const todayKey = () => new Date().toISOString().slice(0, 10);
export function popupSeenToday() { try { return window.localStorage.getItem(POPUP_KEY) === todayKey(); } catch { return false; } }
function markPopupSeen() { try { window.localStorage.setItem(POPUP_KEY, todayKey()); } catch { /* private window: fine */ } }

export default function BillingNotices({ plan, onOpenBilling, isDemo, toast, ...banner }) {
  const [s, setS] = useState(null);
  const [popup, setPopup] = useState(false);

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
  // Her own price: her subscription's, else her agreed price, else the launch price while it is open (the status route resolves all of it).
  const price = Number(s?.plan?.price) > 0 ? Number(s.plan.price) : defaultPlanPrice(null, LAUNCH_PRICE_CUTOFF_ISO);
  const upgradeOn = upgradeButtonsEnabled();
  const upgrade = upgradeOn && canPay && plan?.isTrial && (plan?.tone === 'gentle' || plan?.tone === 'urgent') && !sub?.card_last4;
  const pastDue = canPay && sub?.status === 'past_due' && plan?.tone !== 'blocked';
  const autoPopup = !!((invite || pastDue) && !s?.founder);

  useEffect(() => {
    if (!autoPopup || popupSeenToday()) return;
    markPopupSeen();
    setPopup(true);
  }, [autoPopup]);

  const openPay = () => { if (canPay) setPopup(true); else onOpenBilling?.(); };
  const closePay = () => { markPopupSeen(); setPopup(false); };

  const days = plan?.daysRemaining;
  const popupTitle = pastDue ? tr("החיוב החודשי לא עבר")
    : invite ? (days === 0 ? tr("החודש החינמי שלך מסתיים היום") : days === 1 ? tr("החודש החינמי שלך מסתיים מחר") : tr("החודש החינמי שלך מסתיים בעוד {0} ימים", [days]))
    : tr("המנוי שלך בקלמיה");
  const popupBody = pastDue ? tr("כדי להמשיך לעבוד בלי הפסקה, אפשר לעדכן כאן את הכרטיס. כל מה שיצרת נשאר שלך.")
    : invite ? tr("כדי שהיומן, הלקוחות והתזכורות ימשיכו לעבוד בלי הפסקה, אפשר להוסיף כרטיס כבר עכשיו. החיוב הראשון יהיה רק כשהחודש החינמי נגמר.")
    : '';
  const modal = popup ? (
    <div data-overlay="billing-popup" onClick={closePay} style={{ position: 'fixed', inset: 0, zIndex: 4700, background: 'rgba(20,38,31,0.34)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={popupTitle}
        data-testid="billing-popup"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 560, maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto', background: 'var(--surface)',
          borderTopLeftRadius: 26, borderTopRightRadius: 26, border: '1px solid var(--line)', borderBottom: 'none', boxShadow: 'var(--shadow-xl)',
          padding: '18px 16px calc(16px + env(safe-area-inset-bottom, 0px))', animation: 'sheet-in 0.22s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <button type="button" onClick={closePay} aria-label={tr("סגירה")} data-testid="billing-popup-close" style={{ position: 'absolute', top: 8, insetInlineEnd: 8, width: 44, height: 44, background: 'none', border: 'none', fontSize: 22, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
        <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', textAlign: 'center', padding: '0 40px', marginBottom: 6 }}>{popupTitle}</p>
        {popupBody && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.7, textAlign: 'center', marginBottom: 14 }}>{popupBody}</p>}
        <BillingCard pc={banner.pc} pcTint={banner.pcTint} toast={toast} isDemo={isDemo} />
        <button type="button" onClick={closePay} style={{ display: 'block', margin: '4px auto 0', background: 'none', border: 'none', color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--t-sm)', textDecoration: 'underline', cursor: 'pointer', minHeight: 44, padding: '0 12px' }}>{tr("אחר כך")}</button>
      </div>
    </div>
  ) : null;

  if (upgrade && plan.tone === 'gentle') {
    // The gentle line stays a line: a small text button, not a card.
    const quiet = (
      <button
        type="button"
        onClick={openPay}
        data-testid="upgrade-cta"
        style={{ background: 'none', border: 'none', padding: '0 4px', minHeight: 44, color: banner.pcDeep, fontWeight: 700, fontSize: 'var(--t-sm)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginInlineStart: 'auto' }}
      >
        {upgradeCtaHe(price)}
      </button>
    );
    return <><TrialBanner plan={plan} cta={quiet} {...banner} />{modal}</>;
  }

  const label = payToContinue ? (upgradeOn ? payToContinueHe(price) : 'תשלום וחזרה לעבודה') : (upgrade ? upgradeCtaHe(price) : 'הוספת כרטיס אשראי');
  const button = (invite || payToContinue || upgrade) ? (
    <button
      type="button"
      onClick={openPay}
      data-testid={upgrade ? 'upgrade-cta' : 'billing-cta'}
      className="primary-btn"
      style={{ background: banner.pcGrad, color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-accent)', flexShrink: 0 }}
    >
      {trv(label)}
    </button>
  ) : null;
  const cta = button && upgrade ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {button}
      <span style={{ fontSize: 'var(--t-xs, 12px)', color: 'var(--ink-2)' }}>{UPGRADE_HINT_HE}</span>
    </div>
  ) : button;

  return (
    <>
      {modal}
      <TrialBanner plan={plan} cta={trv(cta)} {...banner} />
      {pastDue && (
        <div role="status" data-testid="billing-past-due" style={{ maxWidth: 1180, margin: '0 auto 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>{tr("החיוב החודשי נכשל")}</p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {sub.graceEndsAt ? tr("כדי להמשיך לעבוד בלי הפסקה, עדכני כרטיס עד {0}. ", [trialEndDateHe(new Date(sub.graceEndsAt))]) : ''}{tr("ננסה שוב אוטומטית, וכל מה שיצרת נשאר שלך.")}
            </p>
          </div>
          <button type="button" onClick={openPay} className="primary-btn" style={{ background: banner.pcGrad, color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{tr("עדכון כרטיס")}</button>
        </div>
      )}
    </>
  );
}
