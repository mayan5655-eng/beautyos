'use client';
// app/[slug]/gift/GiftPurchase.tsx
//
// The buyer's form. She picks an option, writes her name and phone (Grow's payment page needs a phone), the friend's name and an
// optional message, and goes to Grow's page. The price shown is the one the server priced; the server prices it again on submit.
import { useState } from 'react';
import { PublicPage, BusinessHeader } from '@/app/PublicChrome';
import { MAX_MESSAGE } from '@/lib/giftVouchers';
import { voucherLook, type VoucherDesign } from '@/lib/giftVoucherDesign';
import VoucherArt from '@/app/VoucherArt';
import { useTr } from "@/lib/i18n/useTr";
import { useLang } from "@/lib/i18n/react";

type Option = { key: string; kind: 'amount' | 'service'; amount: number; label: string };
const money = (n: number) => `₪${n.toLocaleString('he-IL')}`;

export default function GiftPurchase({ tenantId, slug, brand, options, validityMonths, note, online, contact, design }: {
  tenantId: string; slug: string; brand: { name: string; primary: string; logoUrl: string };
  options: Option[]; validityMonths: number; note: string; online: boolean; contact: string | null; design: VoucherDesign;
}) {
  const tr = useTr();
  const lang = useLang();
  const [pick, setPick] = useState<string>(options[0]?.key || '');
  const [f, setF] = useState({ buyerName: '', buyerPhone: '', recipientName: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = options.find((o) => o.key === pick) || null;
  const can = online && !!chosen && f.buyerName.trim() && f.recipientName.trim() && f.buyerPhone.replace(/\D/g, '').length >= 9 && !busy;

  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2, #DAD2BF)', borderRadius: 12, padding: '12px 14px', fontSize: 16, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)', minHeight: 48, outline: 'none' };
  const label: React.CSSProperties = { display: 'block', textAlign: 'right', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '14px 0 6px' };

  const pay = async () => {
    if (!can) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/vouchers/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: tenantId, option: pick, ...f }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success || !j.url) { setErr(j?.error || tr("לא הצלחנו לפתוח את דף התשלום. אפשר לנסות שוב בעוד רגע.")); setBusy(false); return; }
      window.location.href = j.url;
    } catch {
      setErr(tr("לא הצלחנו לפתוח את דף התשלום. בדקי את החיבור ונסי שוב.")); setBusy(false);
    }
  };

  return (
    <PublicPage primary={brand.primary} lang={lang}>
      <BusinessHeader logoUrl={brand.logoUrl} name={brand.name} lang={lang} />
      {/* A live preview in her design: what the friend will open (the code appears after payment). */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <VoucherArt testId="gift-shop-preview" width={300} look={voucherLook(design, brand.primary)} content={{
          recipientName: f.recipientName.trim(), title: chosen ? (chosen.kind === 'service' ? chosen.label : money(chosen.amount)) : tr("שובר מתנה"),
          sub: chosen?.kind === 'service' ? tr("בשווי {0}", [money(chosen.amount)]) : undefined, message: f.message.trim(), fromName: f.buyerName.trim().split(' ')[0], businessName: brand.name, logoUrl: brand.logoUrl || null,
        }} />
      </div>
      <div className="pub-card" data-testid="gift-shop" style={{ textAlign: 'right' }}>
        <h1 className="pub-h1" style={{ textAlign: 'center' }}>{tr("🎁 שובר מתנה")}</h1>
        <p className="pub-p" style={{ textAlign: 'center', fontSize: 'var(--t-md)' }}>{tr("מתנה מפנקת למישהי שאת אוהבת. היא תקבל דף אישי עם קוד, ותממש אותו אצלנו.")}</p>

        <p style={label}>{tr("במה תבחרי?")}</p>
        <div role="radiogroup" aria-label={tr("סוג השובר")} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {options.map((o) => {
            const on = o.key === pick;
            return (
              <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setPick(o.key)}
                style={{ gridColumn: o.kind === 'service' ? '1 / -1' : undefined, minHeight: 56, borderRadius: 14, border: `2px solid ${on ? 'var(--pc-deep, #C48E87)' : 'var(--line-2, #DAD2BF)'}`, background: on ? 'var(--pc-tint, #FBEDE9)' : '#fff', color: 'var(--ink)', fontFamily: 'inherit', fontWeight: 700, fontSize: o.kind === 'service' ? 'var(--t-md)' : 22, cursor: 'pointer', padding: '8px 12px' }}>
                {o.kind === 'service' ? <>{o.label} <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>· {money(o.amount)}</span></> : o.label}
              </button>
            );
          })}
        </div>

        {online ? (
          <>
            <label style={label} htmlFor="gv-recipient">{tr("למי השובר?")}</label>
            <input id="gv-recipient" value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} maxLength={60} placeholder={tr("השם שלה")} style={field} />
            <label style={label} htmlFor="gv-message">{tr("ברכה (לא חובה)")}</label>
            <textarea id="gv-message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={MAX_MESSAGE} rows={3} placeholder={tr("מזל טוב! מגיע לך פינוק")} style={{ ...field, minHeight: 84, resize: 'vertical' }} />
            <label style={label} htmlFor="gv-buyer">{tr("השם שלך")}</label>
            <input id="gv-buyer" value={f.buyerName} onChange={(e) => setF({ ...f, buyerName: e.target.value })} maxLength={60} autoComplete="name" style={field} />
            <label style={label} htmlFor="gv-phone">{tr("הנייד שלך")}</label>
            <input id="gv-phone" value={f.buyerPhone} onChange={(e) => setF({ ...f, buyerPhone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="0501234567" style={{ ...field, direction: 'ltr', textAlign: 'right' }} />
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '6px 0 0' }}>{tr("הנייד נדרש לדף התשלום ולא מוצג למקבלת. השובר בתוקף")} {validityMonths} {tr("חודשים.")}</p>
            {err && <p role="alert" style={{ color: 'var(--danger, #C2557A)', fontSize: 'var(--t-sm)', fontWeight: 700, margin: '12px 0 0' }}>{err}</p>}
            <button type="button" className="pub-pill" data-testid="gift-pay" disabled={!can} onClick={pay} style={{ marginTop: 18 }}>
              {busy ? tr("פותחת את דף התשלום…") : chosen ? tr("לתשלום {0}", [money(chosen.amount)]) : tr("בחרי שובר")}
            </button>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '10px 0 0', textAlign: 'center' }}>{tr("התשלום מאובטח ב-Grow ומגיע ישירות לעסק. אחרי התשלום תקבלי קישור לשובר ותשלחי אותו בעצמך.")}</p>
          </>
        ) : (
          <div data-testid="gift-offline" style={{ marginTop: 16, textAlign: 'center' }}>
            <p className="pub-p" style={{ fontSize: 'var(--t-md)' }}>{tr("כרגע אפשר לקנות שובר מתנה ישירות בעסק. כתבי לי ונסגור את זה יחד.")}</p>
            {contact && <a className="pub-pill" href={`${contact}?text=${encodeURIComponent('היי, אשמח לקנות שובר מתנה 🎁')}`} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>{tr("כתבי לי בוואטסאפ")}</a>}
          </div>
        )}
        {note && <p style={{ margin: '16px 0 0', fontSize: 'var(--t-md)', lineHeight: 1.6, color: 'var(--ink-2)', textAlign: 'center' }}>{note}</p>}
        <p style={{ margin: '14px 0 0', textAlign: 'center' }}><a href={`/${encodeURIComponent(slug)}`} style={{ color: 'var(--ink-2)', fontSize: 'var(--t-sm)' }}>{tr("חזרה לדף העסק")}</a></p>
      </div>
    </PublicPage>
  );
}
