'use client';

// app/design/DesignEditor.jsx
//
// Filling a design: the text fields the template declares, a picture for
// every slot, her name for it, and the four actions - save, export PNG,
// duplicate, make default. The preview on the left is the DOM renderer; the
// export captures a full-size copy of it mounted off-screen. Moving and
// resizing things is the editor layer (stage 3) and is not here.

import { useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import ImagePicker from './ImagePicker';
import { fillTemplate } from '@/lib/design/mapBranding';
import { captureElementPng, downloadBlob, uploadExport } from './exportPng';
import Sheet from '../Sheet';
import CesdkEditor from './CesdkEditor';
import { EDITOR_AVAILABLE } from './renderers';
import AiFill from './AiFill';

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
  const [copyText, setCopyText] = useState(design.copy?.text || '');
  const [hashtags, setHashtags] = useState(Array.isArray(design.copy?.hashtags) ? design.copy.hashtags.join(' ') : '');
  const captionFull = () => [copyText.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
  const copyCaption = async () => {
    const text = captionFull();
    if (!text) { toast?.('אין עדיין טקסט לפוסט', 'error'); return; }
    try { await navigator.clipboard.writeText(text); toast?.('הטקסט הועתק'); } catch { toast?.('ההעתקה נחסמה, סמני והעתיקי ידנית', 'error'); }
  };
  const shareWhatsApp = () => { const text = captionFull(); window.open(`https://wa.me/?text=${encodeURIComponent(text || name)}`, '_blank', 'noopener'); };
  const shareFacebook = async () => { await copyCaption(); window.open('https://www.facebook.com/', '_blank', 'noopener'); toast?.('הטקסט הועתק. הורידי את התמונה וצרפי אותה לפוסט'); };
  const [advanced, setAdvanced] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pickSlot, setPickSlot] = useState(null);
  const [error, setError] = useState('');
  const exportRef = useRef(null);

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
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    setSaving(true); setError('');
    try {
      const saved = await patch({ name, values, images, overrides: { ...overrides, consent, brand }, copy: { text: copyText, hashtags: hashtags.split(/\s+/).filter(Boolean) } });
      setDirty(false); onSaved?.(saved); toast?.('העיצוב נשמר');
    } catch (e) { setError(String(e.message || e)); } finally { setSaving(false); }
  };

  const exportPng = async () => {
    setExporting(true); setError('');
    try {
      const el = exportRef.current;
      if (!el) throw new Error('התצוגה לא מוכנה');
      const blob = await captureElementPng(el);
      downloadBlob(blob, `${(name || template.name).replace(/[^\p{L}\p{N}]+/gu, '-')}-${template.format}.png`);
      if (!readOnly && settings?.tenant_id) {
        try { const path = await uploadExport(blob, settings.tenant_id, design.id); await patch({ export_path: path }); } catch { /* the download already happened */ }
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
  // Every variable is hers to change, the fixed labels included.
  const editableVars = template.variables;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} className="icon-btn" aria-label="חזרה"><Icon name="arrow-right" size={16} /></button>
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
            <textarea value={copyText} rows={4} maxLength={2200} placeholder="מה כתוב מתחת לתמונה. ה-AI ממלא את זה, או שאת." onChange={(e) => { setCopyText(e.target.value); setDirty(true); }} style={{ ...input, resize: 'vertical', marginBottom: 8 }} />
            <input value={hashtags} placeholder="#האשטגים #מופרדים #ברווח" onChange={(e) => { setHashtags(e.target.value); setDirty(true); }} style={{ ...input, direction: 'rtl' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button onClick={copyCaption} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="copy" size={14} /> העתקת הטקסט</button>
              <button onClick={shareWhatsApp} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="whatsapp" size={14} /> וואטסאפ</button>
              <button onClick={shareFacebook} className="primary-btn" style={{ padding: '9px 14px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}><Icon name="share" size={14} /> פייסבוק</button>
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>לאינסטגרם ולפייסבוק: הורידי את ה-PNG למטה והדביקי את הטקסט.</p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={save} disabled={saving || readOnly} className="primary-btn" style={{ padding: '11px 20px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: saving || readOnly ? 0.6 : 1 }}>
              {saving ? <Spinner inline label="שומרת" /> : dirty ? 'שמירה' : 'נשמר'}
            </button>
            <button onClick={exportPng} disabled={exporting} className="primary-btn" style={{ padding: '11px 18px', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)', fontSize: 'var(--t-sm)' }}>
              {exporting ? <Spinner inline label="מייצאת" /> : <><Icon name="download" size={14} /> הורדת PNG</>}
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

      {/* Full-size copy for the exporter, parked off-screen. */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef}><DomPreview template={template} fill={fill} overrides={overrides} width={1080} /></div>
      </div>

      {EDITOR_AVAILABLE && (
        <Sheet open={advanced} onClose={() => setAdvanced(false)} width={560} zIndex={1200} title="עריכה מתקדמת" subtitle="גררי, שני גודל, הקישי פעמיים לעריכת טקסט. השינויים נשמרים עם העיצוב.">
          {advanced && (
            <CesdkEditor
              template={template} fill={fill} overrides={overrides} values={values}
              onChange={(next) => { setOverrides(next.overrides); setValues((p) => ({ ...p, ...next.values })); setDirty(true); }}
              onExport={(blob) => downloadBlob(blob, `${(name || template.name).replace(/[^p{L}p{N}]+/gu, '-')}-${template.format}.png`)}
              onClose={() => setAdvanced(false)}
            />
          )}
        </Sheet>
      )}

      <ImagePicker
        key={pickSlot ? pickSlot.key : 'none'}
        open={!!pickSlot} onClose={() => setPickSlot(null)} slot={pickSlot} current={pickSlot ? images[pickSlot.key] : null}
        branding={settings?.branding} tenantId={settings?.tenant_id} previous={previousImages} consent={pickSlot ? consent[pickSlot.key] : false}
        onPick={(ref, agreed) => { if (!pickSlot) return; setImages((p) => ({ ...p, [pickSlot.key]: ref })); setConsent((p) => ({ ...p, [pickSlot.key]: !!agreed })); setDirty(true); }}
      />
    </div>
  );
}
