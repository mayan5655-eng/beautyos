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
import VoucherArt from '@/app/VoucherArt';
import { voucherLook } from '@/lib/giftVoucherDesign';
import { useTr } from "@/lib/i18n/useTr";
import { useDocumentLang } from '@/lib/i18n/react';

const money = (n: number) => `₪${(Math.round(n * 100) / 100).toLocaleString('he-IL')}`;
const POLL_MS = 3000;
const POLL_FOR_MS = 4 * 60 * 1000;

export default function VoucherView({ token, initial, buyer, growResult }: { token: string; initial: PublicVoucherState; buyer: boolean; growResult: string | null }) {
  // The business's language (lib/i18n), carried on the voucher's brand.
  const lang = initial.state !== 'unknown' ? initial.brand?.language || null : null;
  useDocumentLang(lang);
  const tr = useTr(lang);
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
      <PublicPage primary={brand?.primary || null} lang={lang}>
        <BusinessHeader logoUrl={brand?.logoUrl} name={brand?.name} lang={lang} />
        <div className="pub-card" data-testid="voucher-pending">
          {cancelled ? (
            <>
              <LineIcon src={ICON_QUESTION} />
              <h1 className="pub-h1">{tr("התשלום לא הושלם")}</h1>
              <p className="pub-p">{tr("לא נוצר שובר ולא נגבה כסף. אפשר לנסות שוב.")}</p>
              {backToShop && <a className="pub-pill" href={backToShop} style={{ marginTop: 18 }}>{tr("חזרה לשובר המתנה")}</a>}
            </>
          ) : (
            <>
              <p style={{ fontSize: 40, margin: '0 0 8px' }} aria-hidden>🎁</p>
              <h1 className="pub-h1">{gaveUp ? tr("האישור מ-Grow מתעכב") : tr("מחכות לאישור התשלום")}</h1>
              <p className="pub-p" role="status">{gaveUp ? tr("אם שילמת, השובר יופיע כאן ברגע שהאישור יגיע. אפשר לשמור את הקישור ולחזור אליו מאוחר יותר.") : tr("זה לוקח בדרך כלל כמה שניות. השובר יופיע כאן לבד.")}</p>
              {gaveUp && <button type="button" className="pub-pill pub-pill-quiet" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>{tr("רענון")}</button>}
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
  const look = voucherLook(st.design, brand?.primary || '#B5838D');

  return (
    <PublicPage primary={brand?.primary || null} lang={lang}>
      {/* Her logo is ON the gift card below (the hero of this page); the header carries her name only, so the logo is not shown twice. */}
      <BusinessHeader logoUrl={null} name={brand?.name} />

      {buyer && (
        <div className="pub-card" data-testid="voucher-buyer-share" style={{ marginBottom: 14, padding: '18px 18px' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 'var(--t-lg)', color: 'var(--ink)' }}>{tr("השובר מוכן! 🌸")}</p>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--t-md)', lineHeight: 1.6, color: 'var(--ink-2)' }}>
            {tr("עכשיו שלחי אותו")}{v.recipientName ? tr(" ל{0}", [v.recipientName]) : ''} {tr("מהוואטסאפ שלך. היא תראה את הדף הזה עם הקוד.")}
          </p>
          <a className="pub-pill" href={share} target="_blank" rel="noreferrer" data-testid="voucher-share-wa">{tr("שליחה בוואטסאפ")}</a>
          <button type="button" className="pub-pill pub-pill-quiet" style={{ marginTop: 8 }} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the address bar has it */ } }}>{copied ? tr("הקישור הועתק ✓") : tr("העתקת הקישור")}</button>
        </div>
      )}

      {/* The gift itself, in HER design (Settings > שוברי מתנה > עיצוב; lib/giftVoucherDesign.ts). */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <VoucherArt testId="voucher-card" look={look} width={340} content={{
          recipientName: v.recipientName, title: v.kind === 'service' && v.serviceName ? v.serviceName : money(v.initial),
          sub: v.kind === 'service' ? tr("בשווי {0}", [money(v.initial)]) : undefined, message: v.message, fromName: v.fromName,
          code: v.code, struck: !active, badge: active ? undefined : STATUS_HE[v.status], businessName: brand?.name, logoUrl: brand?.logoUrl || null,
        }} />
      </div>
      <div className="pub-card" style={{ marginTop: 14, padding: '18px 20px' }}>
        {!active && <p data-testid="voucher-status" style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--ink-2)' }}>{STATUS_HE[v.status]}</p>}
        {partial && <p style={{ margin: '0 0 4px', fontSize: 'var(--t-md)', color: 'var(--ink)', fontWeight: 700 }}>{tr("נשארו")} {money(v.balance)} {tr("מתוך")} {money(v.initial)}</p>}
        {v.expiresAt && <p style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{v.status === 'expired' ? tr("פג תוקף ב-") : tr("בתוקף עד ")}{dateHe(v.expiresAt)}</p>}
        {v.note && <p style={{ margin: '12px 0 0', fontSize: 'var(--t-md)', lineHeight: 1.6, color: 'var(--ink-2)' }}>{v.note}</p>}
        {active && brand?.slug && <a className="pub-pill" href={`/${encodeURIComponent(brand.slug)}`} style={{ marginTop: 16 }}>{tr("לקביעת תור")}</a>}
        {active && <a className="pub-pill pub-pill-quiet" data-testid="voucher-image" href={`/api/vouchers/image?k=${encodeURIComponent(token)}`} download="gift-voucher.png" style={{ marginTop: 8 }}>{tr("שמירת השובר כתמונה")}</a>}
        {active && <p style={{ margin: '10px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6 }}>{tr("מציגים את הקוד בעסק ביום הטיפול. אפשר לממש בכמה ביקורים, עד שהיתרה נגמרת.")}</p>}
      </div>
    </PublicPage>
  );
}
