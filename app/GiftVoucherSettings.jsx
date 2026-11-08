'use client';
// app/GiftVoucherSettings.jsx
//
// Settings > העסק שלי: gift vouchers. OPTIONAL: they already work with nothing set (₪200 / ₪300 / ₪500, 12 months, online when
// Grow is connected, the elegant design in her colours). Here she can change the amounts, offer treatments, the validity, a
// personal note, and the DESIGN: a ready template (elegant, floral, minimal, festive, birthday), her colours, a background
// (presets, or her own photo through the same public-bucket upload her branding images use), the headline and the font.
// Stored in automations.gift_vouchers and validated again by the settings save (lib/giftVouchers.ts sanitizeVoucherAutomations).
// Shown only when gift vouchers are on and installed (beautyos.jsx + useVouchersReady).
import { useState } from 'react';
import { voucherConfig, voucherStored, MIN_AMOUNT, MAX_AMOUNT, MAX_NOTE } from '@/lib/giftVouchers';
import {
  TEMPLATES, TEMPLATE_LABELS, BACKGROUNDS, BACKGROUND_LABELS, FONTS, FONT_LABELS, MAX_HEADLINE, voucherLook, templatePreset, storageHostOf,
} from '@/lib/giftVoucherDesign';
import { resizeImage, IMAGE_PRESETS, notUploadable, MAX_SOURCE_BYTES, TOO_LARGE_SOURCE_HE } from '@/lib/imageResize';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
import { supabase } from './supabase';
import VoucherArt from './VoucherArt';
import { useVouchersReady } from './useVouchersReady';

const VALIDITY = [3, 6, 12, 24, 36];
const HOST = storageHostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

export default function GiftVoucherSettings({ automations, services, pc, pcTint, onChange, tenantId, brandPrimary, businessName, logoUrl, toast }) {
  const { ready } = useVouchersReady(true);
  const autos = automations && typeof automations === 'object' ? automations : {};
  const cfg = voucherConfig({ automations: autos }, tenantId, HOST);
  const [add, setAdd] = useState('');
  // What she is typing, as typed: the stored copy is cleaned (spaces collapsed and trimmed), which would eat the space she just typed.
  const [note, setNote] = useState(cfg.note);
  const [headline, setHeadline] = useState(cfg.design.headline);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  if (ready !== true) return null;

  const set = (patch) => onChange({ ...autos, gift_vouchers: voucherStored({ ...cfg, ...patch }, tenantId, HOST) });
  const setDesign = (patch) => set({ design: { ...cfg.design, ...patch } });
  const priced = (services || []).filter((s) => s && s.active !== false && Number(s.price) >= MIN_AMOUNT && Number(s.price) <= MAX_AMOUNT);
  const look = voucherLook(cfg.design, brandPrimary);
  const sample = { title: `₪${cfg.amounts[1] || cfg.amounts[0] || 300}`, recipientName: 'דנה', message: 'מגיע לך פינוק 💕', fromName: 'מיכל', code: 'K7M4-X9Q2', businessName, logoUrl };

  const chip = (on) => ({ padding: '8px 12px', minHeight: 40, borderRadius: 'var(--r-full)', border: `1px solid ${on ? pc : 'var(--line-2)'}`, background: on ? pcTint : 'transparent', color: 'var(--ink)', fontWeight: on ? 700 : 500, fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' });
  const inp = { boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const label = { fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '14px 0 6px' };
  const addAmount = () => {
    const n = Math.round(Number(add));
    if (!(n >= MIN_AMOUNT && n <= MAX_AMOUNT)) return;
    set({ amounts: [...cfg.amounts, n] });
    setAdd('');
  };
  // Her own background photo: the branding upload path (public bucket, HER folder), resized in the browser first.
  const upload = async (file) => {
    if (!file || !tenantId) return;
    if (file.size > MAX_SOURCE_BYTES) { toast?.(TOO_LARGE_SOURCE_HE, 'error'); return; }
    setUploading(true);
    try {
      const blob = await resizeImage(file, IMAGE_PRESETS.gallery);
      const why = notUploadable(blob);
      if (why) { toast?.(why, 'error'); return; }
      const path = `${tenantId}/branding/voucher_bg_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) { toast?.('לא הצלחנו להעלות את התמונה, נסי שוב', 'error'); return; }
      const url = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || '';
      setDesign({ background: 'image', image: url });
      toast?.('התמונה עלתה. שמרי את ההגדרות כדי שתופיע בשובר.');
    } finally { setUploading(false); }
  };

  return (
    <div className="glass-card" data-testid="gift-voucher-settings" style={{ padding: '14px 16px', marginBottom: 14 }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>🎁 שוברי מתנה</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.65, margin: 0 }}>
        השוברים כבר פועלים אצלך: את מוכרת ומממשת בקופה, ואם Grow מחובר אפשר לקנות גם אונליין מהדף שלך. כאן אפשר לשנות סכומים, טיפולים, תוקף ועיצוב, אם רוצים.
      </p>
      {!open ? (
        <button type="button" data-testid="gv-edit" style={{ ...chip(false), marginTop: 10 }} onClick={() => setOpen(true)}>עריכת השוברים והעיצוב</button>
      ) : (
        <>
          {/* ── Design ─────────────────────────────────────────── */}
          <p style={label}>עיצוב השובר</p>
          <div data-testid="gv-templates" role="radiogroup" aria-label="תבנית" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {TEMPLATES.map((t) => {
              const on = cfg.design.template === t;
              const preview = voucherLook({ ...templatePreset(t), color: cfg.design.color }, brandPrimary);
              return (
                <button key={t} type="button" role="radio" aria-checked={on} onClick={() => { setHeadline(''); setDesign({ ...templatePreset(t), color: cfg.design.color, accent: null }); }}
                  style={{ flex: '0 0 auto', background: 'none', border: `2px solid ${on ? pc : 'transparent'}`, borderRadius: 16, padding: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <VoucherArt look={preview} width={96} content={{ title: '₪300' }} />
                  <span style={{ display: 'block', fontSize: 'var(--t-xs)', fontWeight: on ? 700 : 500, color: 'var(--ink)', marginTop: 4 }}>{TEMPLATE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>

          <div data-testid="gv-preview" style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 4px' }}>
            <VoucherArt look={look} width={260} content={sample} />
          </div>

          <p style={label}>צבעים</p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
              <input type="color" aria-label="צבע ראשי" value={cfg.design.color || brandPrimary || '#B5838D'} onChange={(e) => setDesign({ color: e.target.value })} style={{ width: 40, height: 40, border: 'none', background: 'none', padding: 0 }} /> ראשי
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
              <input type="color" aria-label="צבע משני" value={cfg.design.accent || look.accent} onChange={(e) => setDesign({ accent: e.target.value })} style={{ width: 40, height: 40, border: 'none', background: 'none', padding: 0 }} /> משני
            </label>
            {(cfg.design.color || cfg.design.accent) && <button type="button" style={chip(false)} onClick={() => setDesign({ color: null, accent: null })}>חזרה לצבעי העסק</button>}
          </div>

          <p style={label}>רקע</p>
          <div role="radiogroup" aria-label="רקע" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BACKGROUNDS.filter((b) => b !== 'image' || cfg.design.image).map((b) => (
              <button key={b} type="button" role="radio" aria-checked={cfg.design.background === b} style={chip(cfg.design.background === b)} onClick={() => setDesign({ background: b })}>{BACKGROUND_LABELS[b]}</button>
            ))}
            <label style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'מעלה…' : 'העלאת תמונה'}
              <input type="file" accept="image/jpeg,image/png" aria-label="תמונת רקע" style={{ display: 'none' }} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
            </label>
          </div>

          <p style={label}>כותרת</p>
          <input value={headline} onChange={(e) => { setHeadline(e.target.value); setDesign({ headline: e.target.value }); }} maxLength={MAX_HEADLINE} placeholder={look.headline} aria-label="כותרת השובר" style={{ ...inp, width: '100%' }} />

          <p style={label}>גופן</p>
          <div role="radiogroup" aria-label="גופן" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FONTS.map((f) => <button key={f} type="button" role="radio" aria-checked={cfg.design.font === f} style={chip(cfg.design.font === f)} onClick={() => setDesign({ font: f })}>{FONT_LABELS[f]}</button>)}
          </div>

          {/* ── What she sells ─────────────────────────────────── */}
          <p style={label}>סכומים</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {cfg.amounts.map((a) => (
              <button key={a} type="button" aria-label={`הסרת ₪${a}`} style={chip(true)} onClick={() => set({ amounts: cfg.amounts.filter((x) => x !== a) })}>₪{a.toLocaleString('he-IL')} ✕</button>
            ))}
            {cfg.amounts.length < 6 && (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input value={add} onChange={(e) => setAdd(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAmount(); } }} inputMode="numeric" placeholder="₪" aria-label="סכום חדש" style={{ ...inp, width: 84, direction: 'ltr', textAlign: 'right' }} />
                <button type="button" style={chip(false)} onClick={addAmount}>הוספה</button>
              </span>
            )}
          </div>

          {priced.length > 0 && (
            <>
              <p style={label}>שובר לטיפול (לא חובה)</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {priced.slice(0, 30).map((s) => {
                  const id = String(s.id);
                  const on = cfg.services.includes(id);
                  return <button key={id} type="button" role="checkbox" aria-checked={on} style={chip(on)} onClick={() => set({ services: on ? cfg.services.filter((x) => x !== id) : [...cfg.services, id] })}>{s.name} · ₪{Math.round(Number(s.price))}</button>;
                })}
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>תוקף השובר</span>
            <select value={cfg.validityMonths} onChange={(e) => set({ validityMonths: Number(e.target.value) })} aria-label="תוקף השובר" style={{ ...inp, padding: '0 10px' }}>
              {[...new Set([...VALIDITY, cfg.validityMonths])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} חודשים</option>)}
            </select>
          </label>

          <p style={label}>מילה אישית בדף השובר</p>
          <textarea value={note} onChange={(e) => { const t = e.target.value.slice(0, MAX_NOTE); setNote(t); set({ note: t }); }} maxLength={MAX_NOTE} rows={2} placeholder="למשל: מחכה לפנק אותך, תאמי איתי תור בוואטסאפ" aria-label="מילה אישית בדף השובר" style={{ ...inp, width: '100%', resize: 'vertical' }} />
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '6px 0 0' }}>
            שובר שנמכר נספר בהכנסות ביום המכירה. כשמממשים אותו בקופה הוא יורד מהתשלום ולא נספר שוב, ומכירת שובר לא נחשבת ביקור בכרטיסיית הנאמנות.
          </p>
        </>
      )}
    </div>
  );
}
