'use client';
// app/GiftVoucherLink.tsx
//
// "שובר מתנה" on her public page. Asks /api/vouchers/public?shop= AFTER the page has loaded, so her page never waits on it, and
// renders nothing unless gift vouchers can be bought online right now (the platform flag, her switch, Grow connected).
import { useEffect, useState } from 'react';

export default function GiftVoucherLink({ tenantId }: { tenantId: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/vouchers/public?shop=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then((j) => { if (live && j?.online && typeof j.href === 'string' && j.href.startsWith('/')) setHref(j.href); })
      .catch(() => {});
    return () => { live = false; };
  }, [tenantId]);
  if (!href) return null;
  return (
    <section className="lp-sec" aria-label="שובר מתנה" data-testid="gift-voucher-link">
      <div className="lp-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-md, 16px)', fontWeight: 700 }}>🎁 שובר מתנה</p>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--t-sm, 15px)', opacity: 0.85 }}>מתנה מפנקת לחברה, נשלחת בוואטסאפ</p>
        </div>
        <a href={href} className="lp-btn lp-ghost" style={{ minHeight: 42, flexShrink: 0 }}>לרכישה</a>
      </div>
    </section>
  );
}
