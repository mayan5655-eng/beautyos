'use client';

// app/design/DesignEditor.jsx
//
// Filling a design: the text fields the template declares, a picture for
// every slot, her name for it, and the four actions - save, export PNG,
// duplicate, make default. The preview on the left is the DOM renderer; the
// export captures a full-size copy of it mounted off-screen. Moving and
// resizing things is the editor layer (stage 3) and is not here.

import { WRITE_BLOCKED_TOAST_HE } from '@/lib/planCopy';
import { useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import ImagePicker from './ImagePicker';
import { fillTemplate } from '@/lib/design/mapBranding';
import { downloadBlob, uploadExport } from './exportPng';
import { renderTemplateBlob } from './canvasRender';
import Sheet from '../Sheet';
import CesdkEditor from './CesdkEditor';
import { EDITOR_AVAILABLE } from './renderers';
import AiFill from './AiFill';
import SaveShare from './SaveShare';
import { isTouchDevice } from '@/lib/design/sharePost';
import { defaultCaption } from '@/lib/design/defaultCaption';

const input = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '9px 11px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)' };
const label = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4, display: 'block' };

export default function DesignEditor({ design, template, settings, readOnly, previousImages, onSaved, onDuplicated, onDeleted, onBack, toast }) {
  const [name, setName] = useState(design.name || template.name);
  const [values, setValues] = useState(design.values || {});
  const [images, setImages] = useState(design.images || {});
  const [consent, setConsent] = useState(design.overrides?.consent || {});
  // Her layout edits (positions, sizes, colours, hidden layers) from the
  // advanced editor; consent is kept apart and merged back on save.
  const [overrides, setOverrides] = useState(() => { const o = { ...(design.overrides || {}) }; delete o.consent; delete o.brand; return o; });
  // Which brand marks this design shows. Absent = on when she has it.
  const [brand, setBrand] = useState(design.overrides?.brand || {});
  // The post text that goes with the picture: from the AI, or typed here.
  // A design she never wrote a text for starts with a plain one drawn from the card (defaultCaption); one she saved,
  // even empty, keeps hers.
  const [copyText, setCopyText] = useState(() => (typeof design.copy?.text === 'string' ? design.copy.text
    : defaultCaption(template, fillTemplate(template, { settings, inputs: design.values || {}, images: design.images || {} }).values, settings)));
  const [hashtags, setHashtags] = useState(Array.isArray(design.copy?.hashtags) ? design.copy.hashtags.join(' ') : '');
  const captionFull = () => [copyText.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
  // Resolves true only when the text really reached the clipboard (the in-app browsers of Instagram and Facebook have none).
  const copyCaption = async ({ quiet = false } = {}) => {
    const text = captionFull();
    if (!text) { toast?.('אין עדיין טקסט לפוסט', 'error'); return false; }
    try { await navigator.clipboard.writeText(text); if (!quiet) toast?.('הטקסט הועתק'); return true; } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); return false; }
  };
  const shareWhatsApp = () => { const text = captionFull(); window.open(`https://wa.me/?text=${encodeURIComponent(text || name)}`, '_blank', 'noopener'); };
  // The page is opened in the same tap as the copy (a window.open after an await is refused by Safari); the toast only says "copied" when it was.
  const shareFacebook = () => {
    const copied = copyCaption({ quiet: true });
    window.open('https://www.facebook.com/', '_blank', 'noopener');
    copied.then((ok) => { if (ok) toast?.('הטקסט הועתק. שמרי את התמונה בכפתור "שמירה ושיתוף" וצרפי אותה לפוסט'); });
  };
  const [advanced, setAdvanced] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pickSlot, setPickSlot] = useState(null);
  const [error, setError] = useState('');
  // The finished PNG, waiting in the save/share panel for her tap (a phone only shares from a fresh tap).
  const [ready, setReady] = useState(null); // { blob, source }
  const pngName = () => `${(name || template.name).replace(/[^\p{L}\p{N}]+/gu, '-')}-${template.format}.png`;
  const showReady = (blob, source = 'editor') => {
    setReady({ blob, source });
    // A computer keeps the one-click download it always had; a phone gets the panel only (a blob download there
    // lands in Files, or nowhere, instead of in her gallery).
    if (!isTouchDevice(navigator.userAgent, navigator.maxTouchPoints)) downloadBlob(blob, pngName());
  };

  // State starts from the row; the parent remounts this editor (key=design.id)
  // when another design opens, so no effect has to reset anything.
  const fill = useMemo(() => fillTemplate(template, { settings, inputs: values, images, brand }), [template, settings, values, images, brand]);
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const has = { logo: !!branding.logo_url, phone: !!settings?.business_phone, instagram: !!branding.instagram };
  const toggles = [['logo', 'לוגו'], ['phone', 'טלפון'], ['instagram', 'אינסטגרם']].filter(([k]) => has[k]);
  const flip = (k) => { setBrand((p) => ({ ...p, [k]: p[k] === false })); setDirty(true); };

  const patch = async (body) => {
    const res = await fetch(`/api/designs/${design.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || 'השמירה נכשלה');
    return data.design;
  };

  const save = async () => {
    if (readOnly) { toast?.(WRITE_BLOCKED_TOAST_HE, 'error'); return; }
    setSaving(true); setError('');
    try {
      const saved = await patch({ name, values, images, overrides: { ...overrides, consent, brand }, copy: { text: copyText, hashtags: hashtags.split(/\s+/).filter(Boolean) } });
      setDirty(false); onSaved?.(saved); toast?.('העיצוב נשמר');
    } catch (e) { setError(String(e.message || e)); } finally { setSaving(false); }
  };

  const exportPng = async () => {
    // A photo slot she has not filled shows the template's sample photo in the preview, but the sample goes into a
    // post only by her choice (lib/design/mapBranding.ts, Fill.seedImages). Asked here, inside her tap, so the file
    // is never a surprise: before this the preview showed a photo and the PNG came out without one.
    let exportFill = fill;
    if (seedSlots.length && window.confirm('בפוסט עוד אין תמונה משלך. בתצוגה רואים תמונת דוגמה של התבנית.\n\nלהכניס לפוסט את תמונת הדוגמה? (ביטול = פוסט בלי תמונה)')) {
      const picked = seedPicks();
      setImages((p) => ({ ...p, ...picked })); setDirty(true);
      exportFill = fillTemplate(template, { settings, inputs: values, images: { ...images, ...picked }, brand });
    }
    setExporting(true); setError('');
    try {
      const blob = await renderTemplateBlob(template, exportFill, overrides);
      showReady(blob);
      if (!readOnly && settings?.tenant_id) {
        try { const path = await uploadExport(blob, settings.tenant_id, design.id, design.export_path); onSaved?.(await patch({ export_path: path })); } catch { /* the picture is already in her hands */ }
      }
    } catch (e) { setError(String(e.message || e)); } finally { setExporting(false); }
  };

  const duplicate = async () => {
    if (readOnly) return;
    const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duplicateOf: design.id }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) { setError(data?.error || 'השכפול נכשל'); return; }
    onDuplicated?.(data.design); toast?.('נוצר עותק');
  };

  const makeDefault = async () => {
    if (readOnly) return;
    try { const saved = await patch({ is_default: !design.is_default }); onSaved?.(saved); toast?.(saved.is_default ? 'זה עכשיו העיצוב שלך לקטגוריה' : 'ברירת המחדל בוטלה'); } catch (e) { setError(String(e.message || e)); }
  };

  const remove = async () => {
    if (readOnly) return;
    if (!window.confirm('למחוק את העיצוב הזה? אי אפשר לשחזר.')) return;
    const res = await fetch(`/api/designs/${design.id}`, { method: 'DELETE' });
    if (res.ok) { onDeleted?.(design.id); toast?.('העיצוב נמחק'); } else setError('המחיקה נכשלה');
  };

  const slotFor = (key) => template.slots.find((s) => s.key === key);
  // Slots showing the template's sample photo, not hers (never a consent slot: those have no sample).
  const seedSlots = template.slots.filter((s) => !fill.images?.[s.key] && fill.seedImages?.[s.key]);
  // As full https URLs: that is what a saved design's images may hold (sanitizeImages), and the canvas loads it as is.
  const seedPicks = () => Object.fromEntries(seedSlots.map((s) => {
    const u = fill.seedImages[s.key];
    return [s.key, u.startsWith('/') ? `${window.location.origin}${u}` : u];
  }));
  const takeSeed = () => { setImages((p) => ({ ...p, ...seedPicks() })); setDirty(true); };
  // Every variable is hers to change, the fixed labels included.
  const editableVars = template.variables;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => { if (dirty && !window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) return; onBack?.(); }} className="icon-btn" aria-label="חזרה"><Icon name="arrow-right" size={16} /></button>
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="שם העיצוב" style={{ ...input, flex: 1, minWidth: 160, fontWeight: 700 }} />
        {design.is_default && <span style={{ fontSize: 'var(--t-xs)', background: 'var(--pc-tint)', color: 'var(--pc-deep)', borderRadius: 'var(--r-full)', padding: '4px 10px', fontWeight: 700 }}>ברירת מחדל</span>}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', width: 'min(100%, 320px)' }}>
          <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid var(--line)' }}>
            <DomPreview template={template} fill={fill} overrides={overrides} width={320} />
          </div>
          {fill.missing.length > 0 && (
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--warning, #B26B00)', marginTop: 8, lineHeight: 1.5 }}>
              חסר: {fill.missing.map((m) => (m.startsWith('slot:') ? `תמונה (${slotFor(m.slice(5))?.label || m})` : template.variables.find((v) => v.key === m)?.label || m)).join(', ')}
            </p>
          )}
          {seedSlots.length > 0 && (
            <div data-testid="seed-photo-note" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, margin: 0, flex: '1 1 180px' }}>התמונה בתצוגה היא דוגמה של התבנית. היא נכנסת לפוסט רק אם תבחרי בה.</p>
              <button type="button" onClick={takeSeed} disabled={readOnly} style={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', color: 'var(--pc-deep)', fontSize: 'var(--t-xs)', fontWeight: 600, padding: '8px 12px', minHeight: 40, cursor: 'pointer', fontFamily: 'inherit' }}>להשתמש בתמונה הזו</button>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <AiFill
            template={template} designId={design.id} readOnly={readOnly} toast={toast}
            imageSlot={template.slots.find((s) => s.sources.includes('ai')) || null}
            onValues={(v) => { setValues((p) => ({ ...p, ...v })); setDirty(true); }}
            onCopy={(c) => { if (c?.text) setCopyText(c.text); if (Array.isArray(c?.hashtags)) setHashtags(c.hashtags.join(' ')); setDirty(true); }}
            onImage={(slotKey, url) => { setImages((p) => ({ ...p, [slotKey]: url })); setDirty(true); }}
          />
          {template.slots.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>תמונות</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {template.slots.map((s) => (
                  <button key={s.key} onClick={() => setPickSlot(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                    <Icon name="image" size={14} /> {s.label}{images[s.key] ? ' ✓' : s.required ? ' (חסרה)' : ''}
                  </button>
                ))}
                {/* A slot that holds the template's AI character: she can put the character back after choosing her own photo. */}
                {template.slots.filter((s) => s.defaultImage && images[s.key]).map((s) => (
                  <button key={`back-${s.key}`} type="button" onClick={() => { setImages((p) => ({ ...p, [s.key]: null })); setDirty(true); }} style={{ padding: '8px 12px', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', background: 'none', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-2)' }}>
                    חזרה לדמות AI
                  </button>
                ))}
              </div>
            </div>
          )}

          {toggles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>בפוסט הזה</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {toggles.map(([k, l]) => {
                  const on = brand[k] !== false;
                  return (
                    <button key={k} type="button" role="switch" aria-checked={on} onClick={() => flip(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: `1px solid ${on ? 'var(--pc)' : 'var(--line-2)'}`, borderRadius: 'var(--r-full)', background: on ? 'var(--pc-tint)' : 'var(--surface)', color: on ? 'var(--pc-deep)' : 'var(--ink-3)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }}>
                      <Icon name={on ? 'check' : 'x'} size={12} /> {l}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>בלי לוגו, השם שלך נכנס במקומו. נשמר עם העיצוב הזה בלבד.</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {editableVars.map((v) => (
              <label key={v.key}>
                <span style={label}>{v.label}{v.required ? ' *' : ''}</span>
                {v.maxLength && v.maxLength > 60 ? (
                  <textarea value={values[v.key] ?? ''} rows={3} maxLength={v.maxLength} placeholder={fill.values[v.key] || v.default || ''} onChange={(e) => { setValues((p) => ({ ...p, [v.key]: e.target.value })); setDirty(true); }} style={{ ...input, resize: 'vertical' }} />
                ) : (
                  <input value={values[v.key] ?? ''} maxLength={v.maxLength} placeholder={fill.values[v.key] || v.default || ''} onChange={(e) => { setValues((p) => ({ ...p, [v.key]: e.target.value })); setDirty(true); }} style={input} />
                )}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
            <span style={label}>הטקסט לפוסט</span>
            {template.suggestedCaption && !copyText.trim() && (
              <button type="button" onClick={() => { setCopyText(template.suggestedCaption); setDirty(true); }} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '8px 10px', marginBottom: 8, border: '1px dashed var(--line-2)', borderRadius: 'var(--r-xs)', background: 'var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                הצעה לטקסט: {template.suggestedCaption} <b style={{ color: 'var(--pc-deep)' }}>להשתמש בהצעה</b>
              </button>
            )}
            <textarea value={copyText} rows={4} maxLength={2200} placeholder="מה כתוב מתחת לתמונה. ה-AI ממלא את זה, או שאת." onChange={(e) => { setCopyText(e.target.value); setDirty(true); }} style={{ ...input, resize: 'vertical', marginBottom: 8 }} />
            <input value={hashtags} placeholder="#האשטגים #מופרדים #ברווח" onChange={(e) => { setHashtags(e.target.value); setDirty(true); }} style={{ ...input, direction: 'rtl' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={copyCaption} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="copy" size={14} /> העתקת הטקסט</button>
              <button onClick={shareWhatsApp} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="whatsapp" size={14} /> וואטסאפ</button>
              <button onClick={shareFacebook} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="share" size={14} /> פייסבוק</button>
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>לאינסטגרם ולפייסבוק: "שמירה ושיתוף" למטה שומר את התמונה בגלריה או שולח אותה ישר, והטקסט מועתק באותה לחיצה.</p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={save} disabled={saving || readOnly} className="primary-btn" style={{ padding: '11px 20px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: saving || readOnly ? 0.6 : 1 }}>
              {saving ? <Spinner inline label="שומרת" /> : dirty ? 'שמירה' : 'נשמר'}
            </button>
            <button onClick={exportPng} disabled={exporting} className="primary-btn" style={{ padding: '11px 18px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}>
              {exporting ? <Spinner inline label="מייצאת" /> : <><Icon name="share" size={14} /> שמירה ושיתוף</>}
            </button>
            <button onClick={duplicate} disabled={readOnly} className="primary-btn" style={{ padding: '11px 14px', background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="copy" size={14} /> שכפול</button>
            <button onClick={makeDefault} disabled={readOnly} className="primary-btn" style={{ padding: '11px 14px', background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="star" size={14} /> {design.is_default ? 'לא ברירת מחדל' : 'ברירת מחדל לקטגוריה'}</button>
            {EDITOR_AVAILABLE && (
              <button onClick={() => setAdvanced(true)} className="primary-btn" style={{ padding: '11px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--pc)', fontSize: 'var(--t-sm)' }}><Icon name="edit" size={14} /> עריכה מתקדמת</button>
            )}
            <button onClick={remove} disabled={readOnly} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', padding: '11px 6px' }}><Icon name="trash" size={14} /> מחיקה</button>
          </div>
          {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
        </div>
      </div>

      {EDITOR_AVAILABLE && (
        <Sheet open={advanced} onClose={() => setAdvanced(false)} width={560} zIndex={1200} title="עריכה מתקדמת" subtitle="גררי, שני גודל, הקישי פעמיים לעריכת טקסט. השינויים נשמרים עם העיצוב.">
          {advanced && (
            <CesdkEditor
              template={template} fill={fill} overrides={overrides} values={values}
              onChange={(next) => { setOverrides(next.overrides); setValues((p) => ({ ...p, ...next.values })); setDirty(true); }}
              onExport={(blob) => showReady(blob, 'advanced')}
              onClose={() => setAdvanced(false)}
            />
          )}
        </Sheet>
      )}

      <SaveShare open={!!ready} onClose={() => setReady(null)} blob={ready?.blob} source={ready?.source} kind="image" ext="png" downloadName={pngName()} caption={captionFull()} toast={toast} />

      <ImagePicker
        key={pickSlot ? pickSlot.key : 'none'}
        open={!!pickSlot} onClose={() => setPickSlot(null)} slot={pickSlot} current={pickSlot ? images[pickSlot.key] : null}
        branding={settings?.branding} tenantId={settings?.tenant_id} previous={previousImages} consent={pickSlot ? consent[pickSlot.key] : false}
        onPick={(ref, agreed) => { if (!pickSlot) return; setImages((p) => ({ ...p, [pickSlot.key]: ref })); setConsent((p) => ({ ...p, [pickSlot.key]: !!agreed })); setDirty(true); }}
      />
    </div>
  );
}
