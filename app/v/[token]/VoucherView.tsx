'use client';
// app/v/[token]/VoucherView.tsx
//
// The gift itself, in HER colours (settings.primary_color through PublicPage's accent tokens; never Kalmea green). Waits for Grow's
// confirmation when the buyer has just paid (polls /api/vouchers/public every few seconds, for a few minutes), then shows the gift.
import { useEffect, useState } from 'react';
import { PublicPage, BusinessHeader, LineIcon } from '@/app/PublicChrome';
import { ICON_QUESTION } from '@/lib/brand';
import { STATUS_HE, dateHe, voucherShareText, waShareLink, type PublicVoucher } from '@/lib/giftVouchers';
import type { PublicVoucherState, PublicBrand } from '@/lib/giftVoucherView';

const money = (n: number) => `₪${(Math.round(n * 100) / 100).toLocaleString('he-IL')}`;
const POLL_MS = 3000;
const POLL_FOR_MS = 4 * 60 * 1000;

export default function VoucherView({ token, initial, buyer, growResult }: { token: string; initial: PublicVoucherState; buyer: boolean; growResult: string | null }) {
  const [st, setSt] = useState<PublicVoucherState>(initial);
  const [gaveUp, setGaveUp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (st.state !== 'pending' || growResult === 'cancelled') return undefined;
    const started = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) { setGaveUp(true); clearInterval(t); return; }
      try {
        const r = await fetch(`/api/vouchers/public?k=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = (await r.json().catch(() => null)) as PublicVoucherState | null;
        if (j && (j.state === 'ready' || j.state === 'cancelled')) { setSt(j); clearInterval(t); }
      } catch { /* keep waiting */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [st.state, token, growResult]);

  const brand: PublicBrand | null = st.state === 'unknown' ? null : st.brand;
  const backToShop = brand?.slug ? `/${encodeURIComponent(brand.slug)}/gift` : null;

  if (st.state !== 'ready') {
    const cancelled = st.state === 'cancelled' || growResult === 'cancelled';
    return (
      <PublicPage primary={brand?.primary || null}>
        <BusinessHeader logoUrl={brand?.logoUrl} name={brand?.name} />
        <div className="pub-card" data-testid="voucher-pending">
          {cancelled ? (
            <>
              <LineIcon src={ICON_QUESTION} />
              <h1 className="pub-h1">התשלום לא הושלם</h1>
              <p className="pub-p">לא נוצר שובר ולא נגבה כסף. אפשר לנסות שוב.</p>
              {backToShop && <a className="pub-pill" href={backToShop} style={{ marginTop: 18 }}>חזרה לשובר המתנה</a>}
            </>
          ) : (
            <>
              <p style={{ fontSize: 40, margin: '0 0 8px' }} aria-hidden>🎁</p>
              <h1 className="pub-h1">{gaveUp ? 'האישור מ-Grow מתעכב' : 'מחכות לאישור התשלום'}</h1>
              <p className="pub-p" role="status">{gaveUp ? 'אם שילמת, השובר יופיע כאן ברגע שהאישור יגיע. אפשר לשמור את הקישור ולחזור אליו מאוחר יותר.' : 'זה לוקח בדרך כלל כמה שניות. השובר יופיע כאן לבד.'}</p>
              {gaveUp && <button type="button" className="pub-pill pub-pill-quiet" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>רענון</button>}
            </>
          )}
        </div>
      </PublicPage>
    );
  }

  const v: PublicVoucher = st.voucher;
  const url = typeof window !== 'undefined' ? `${window.location.origin}/v/${token}` : `/v/${token}`;
  const share = waShareLink(voucherShareText({ businessName: brand?.name || '', recipientName: v.recipientName, url }));
  const active = v.status === 'active';
  const partial = active && v.balance < v.initial - 0.005;

  return (
    <PublicPage primary={brand?.primary || null}>
      <BusinessHeader logoUrl={brand?.logoUrl} name={brand?.name} />

      {buyer && (
        <div className="pub-card" data-testid="voucher-buyer-share" style={{ marginBottom: 14, padding: '18px 18px' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 'var(--t-lg)', color: 'var(--ink)' }}>השובר מוכן! 🌸</p>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--t-md)', lineHeight: 1.6, color: 'var(--ink-2)' }}>
            עכשיו שלחי אותו{v.recipientName ? ` ל${v.recipientName}` : ''} מהוואטסאפ שלך. היא תראה את הדף הזה עם הקוד.
          </p>
          <a className="pub-pill" href={share} target="_blank" rel="noreferrer" data-testid="voucher-share-wa">שליחה בוואטסאפ</a>
          <button type="button" className="pub-pill pub-pill-quiet" style={{ marginTop: 8 }} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the address bar has it */ } }}>{copied ? 'הקישור הועתק ✓' : 'העתקת הקישור'}</button>
        </div>
      )}

      <div className="pub-card" data-testid="voucher-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'var(--pc, #E9A9A1)', color: 'var(--pc-contrast, #1F3A30)', padding: '22px 20px 18px' }}>
          <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.04em', fontSize: 'var(--t-sm)' }}>🎁 שובר מתנה</p>
          {v.recipientName && <p style={{ margin: '8px 0 0', fontSize: 'var(--t-xl)', fontWeight: 700 }}>ל{v.recipientName}</p>}
          <p className="serif" style={{ margin: '10px 0 0', fontFamily: "var(--display-heavy, 'Frank Ruhl Libre', serif)", fontWeight: 700, fontSize: v.kind === 'service' ? 28 : 44, lineHeight: 1.15 }}>
            {v.kind === 'service' && v.serviceName ? v.serviceName : money(v.initial)}
          </p>
          {v.kind === 'service' && <p style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)', opacity: 0.9 }}>בשווי {money(v.initial)}</p>}
        </div>
        <div style={{ padding: '18px 20px 22px' }}>
          {v.message && <p style={{ margin: '0 0 10px', fontSize: 'var(--t-lg)', lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-line' }}>״{v.message}״</p>}
          {v.fromName && <p style={{ margin: '0 0 14px', fontSize: 'var(--t-md)', color: 'var(--ink-2)' }}>באהבה, {v.fromName}</p>}
          {!active && <p data-testid="voucher-status" style={{ display: 'inline-block', margin: '0 0 12px', padding: '6px 12px', borderRadius: 999, background: 'var(--surface-2, #F4EFE4)', fontWeight: 700, color: 'var(--ink-2)' }}>{STATUS_HE[v.status]}</p>}
          <p style={{ margin: '0 0 4px', fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>הקוד למימוש בעסק</p>
          <p dir="ltr" data-testid="voucher-code" style={{ margin: '0 auto 12px', display: 'inline-block', padding: '10px 16px', borderRadius: 12, border: '1.5px dashed var(--pc-deep, #C48E87)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 24, fontWeight: 700, letterSpacing: '0.12em', color: active ? 'var(--ink)' : 'var(--ink-3)', textDecoration: active ? 'none' : 'line-through' }}>{v.code}</p>
          {partial && <p style={{ margin: '0 0 4px', fontSize: 'var(--t-md)', color: 'var(--ink)', fontWeight: 700 }}>נשארו {money(v.balance)} מתוך {money(v.initial)}</p>}
          {v.expiresAt && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{v.status === 'expired' ? 'פג תוקף ב-' : 'בתוקף עד '}{dateHe(v.expiresAt)}</p>}
          {v.note && <p style={{ margin: '14px 0 0', fontSize: 'var(--t-md)', lineHeight: 1.6, color: 'var(--ink-2)' }}>{v.note}</p>}
          {active && brand?.slug && <a className="pub-pill" href={`/${encodeURIComponent(brand.slug)}`} style={{ marginTop: 18 }}>לקביעת תור</a>}
          {active && <p style={{ margin: '10px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6 }}>מציגים את הקוד בעסק ביום הטיפול. אפשר לממש בכמה ביקורים, עד שהיתרה נגמרת.</p>}
        </div>
      </div>
    </PublicPage>
  );
}
