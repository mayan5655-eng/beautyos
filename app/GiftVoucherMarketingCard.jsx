'use client';
// app/GiftVoucherMarketingCard.jsx
//
// Content tab (תוכן / שיווק): "🎁 שוברי מתנה". Gift cards are a revenue driver at Fresha and Vagaro because they are PROMOTED,
// before holidays and birthdays. This card gives her what she needs to do that in one minute:
//   * her voucher shop link (/<slug>/gift), to copy, or to send from her own WhatsApp (wa.me with no number: she picks who);
//   * a ready Instagram story image in her voucher design (/api/vouchers/image?shop=..&f=story, 1080x1920);
//   * ready texts for holidays, birthdays and "just because", to copy;
//   * a button to sell one at the till right now.
// Nothing is posted or sent by us. Renders nothing until gift vouchers are installed (useVouchersReady).
import GrowCostNote from './GrowCostNote';
import { useEffect, useMemo, useState } from 'react';
import { voucherConfig } from '@/lib/giftVouchers';
import { voucherLook, storageHostOf } from '@/lib/giftVoucherDesign';
import { waShareLink } from '@/lib/giftVouchers';
import VoucherArt from './VoucherArt';
import { useVouchersReady } from './useVouchersReady';

const HOST = storageHostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Ready texts. {name} is her business, {link} her shop. Feminine, warm, her voice to her clients. No long dashes. */
export const VOUCHER_COPY = [
  { key: 'birthday', label: 'יום הולדת', text: 'מחפשת מתנה ליום הולדת? 🎂 שובר פינוק אצל {name} זו מתנה שתמיד שמחים לקבל. בוחרות סכום או טיפול, משלמות אונליין, והשובר נשלח בוואטסאפ תוך דקה:\n{link}',
    offline: 'מחפשת מתנה ליום הולדת? 🎂 שובר פינוק אצל {name} זו מתנה שתמיד שמחים לקבל. בוחרות סכום או טיפול, וכותבות לי לתאם:\n{link}' },
  { key: 'holiday', label: 'לחג', text: 'החג מתקרב ✨ במקום עוד מתנה שתעמוד על המדף, תני לה רגע של פינוק. שוברי מתנה של {name}, נשלחים בוואטסאפ:\n{link}' },
  { key: 'mothers', label: 'יום האם', text: 'לאמא שעושה הכל 💐 שובר פינוק אצל {name}, בדיוק מה שמגיע לה. קונים אונליין ושולחים לה בוואטסאפ:\n{link}',
    offline: 'לאמא שעושה הכל 💐 שובר פינוק אצל {name}, בדיוק מה שמגיע לה. כל הפרטים כאן:\n{link}' },
  { key: 'friend', label: 'סתם כי בא לך', text: 'יש לך חברה שמגיע לה פינוק? 🌸 שובר מתנה אצל {name}, עם ברכה אישית ממך:\n{link}' },
];
/** The text for her clients. Until online payment is connected the shop page says "buy it at the business", so the texts must not
 *  promise paying online (2026-11-08 QA: the card said Grow is not connected while the birthday text said "משלמות אונליין"). */
export const copyText = (c, online) => (online === false && c.offline ? c.offline : c.text);
export const fillCopy = (t, name, link) => t.replace(/\{name\}/g, name || 'אצלי').replace(/\{link\}/g, link || '');

export default function GiftVoucherMarketingCard(props) {
  const { ready, slug } = useVouchersReady(true);
  const [online, setOnline] = useState(null);
  const tenantId = props.settings?.tenant_id || null;
  useEffect(() => {
    if (ready !== true || !tenantId) return undefined;
    let live = true;
    fetch(`/api/vouchers/public?shop=${encodeURIComponent(tenantId)}`).then((r) => r.json()).then((j) => { if (live) setOnline(!!j?.online); }).catch(() => { if (live) setOnline(false); });
    return () => { live = false; };
  }, [ready, tenantId]);
  if (ready !== true) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return <GiftVoucherMarketingBody {...props} slug={slug} online={online} origin={origin} />;
}

/** The card itself, without the network: what tests render. */
export function GiftVoucherMarketingBody({ settings, pc, pcTint, toast, onSellAtTill, slug, online, origin }) {
  const tenantId = settings?.tenant_id || null;
  const cfg = useMemo(() => voucherConfig(settings, tenantId, HOST), [settings, tenantId]);
  const name = settings?.business_name || '';
  const link = slug ? `${origin || ''}/${encodeURIComponent(slug)}/gift` : '';
  const look = voucherLook(cfg.design, settings?.primary_color);
  const copy = async (text, what = 'הועתק') => { try { await navigator.clipboard.writeText(text); toast?.(what); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); } };
  const btn = { padding: '10px 14px', minHeight: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 };

  return (
    <div className="glass-card" data-testid="gift-voucher-marketing" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>🎁 שוברי מתנה</h3>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: '4px 0 0' }}>
            לפני חג או יום הולדת, שובר מתנה הוא המכירה הכי קלה. {online === false ? 'שתפי את הקישור, והקונה תכתוב לך כדי לקנות.' : 'שתפי את הקישור, והקונה משלמת ושולחת את השובר בעצמה.'}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}><VoucherArt look={look} width={92} content={{ title: `₪${cfg.amounts[1] || cfg.amounts[0] || 300}` }} /></div>
      </div>

      {link ? (
        <div style={{ marginTop: 12, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>הקישור לשוברים שלך</p>
          <p dir="ltr" data-testid="gv-shop-link" style={{ margin: '2px 0 8px', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{link.replace(/^https?:\/\//, '')}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={btn} onClick={() => copy(link, 'הקישור הועתק')}>העתקה</button>
            <a style={{ ...btn, background: '#0B7A3E', color: '#fff', border: 'none' }} target="_blank" rel="noreferrer" href={waShareLink(fillCopy(copyText(VOUCHER_COPY[3], online), name, link))}>שליחה בוואטסאפ</a>
            <a style={btn} data-testid="gv-story" href={`/api/vouchers/image?shop=${encodeURIComponent(tenantId)}&f=story`} download="gift-voucher-story.png" target="_blank" rel="noreferrer">תמונה לסטורי</a>
          </div>
          {online === false && <p style={{ margin: '8px 0 0', fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6 }}>Grow עוד לא מחובר, אז בדף כתוב שקונים שובר אצלך בעסק. אחרי החיבור הקונה תוכל לשלם אונליין, בלי לשנות כלום.</p>}
          {online === false && <GrowCostNote style={{ marginTop: 4 }} />}
        </div>
      ) : null}

      <p style={{ margin: '14px 0 6px', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>טקסטים מוכנים</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {VOUCHER_COPY.map((c) => {
          const text = fillCopy(copyText(c, online), name, link);
          return (
            <div key={c.key} style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>{c.label}</b>
                <button type="button" style={{ ...btn, minHeight: 34, padding: '4px 12px' }} onClick={() => copy(text, 'הטקסט הועתק')}>העתקה</button>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{text}</p>
            </div>
          );
        })}
      </div>

      <button type="button" data-testid="gv-sell-at-till" onClick={onSellAtTill} style={{ ...btn, width: '100%', marginTop: 12, background: pc, color: 'var(--pc-contrast, #1F3A30)', border: 'none' }}>מכירת שובר בקופה</button>
    </div>
  );
}
