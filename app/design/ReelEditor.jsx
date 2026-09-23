'use client';

// app/design/ReelEditor.jsx
//
// Filling a reel: one form for the whole sequence, section per scene (its
// photo, its words), the same brand toggles as a static design, a strip of
// scene previews drawn by the studio's renderer, and the recorder that
// turns it into a video. Saving writes the same designs row a static
// design uses (format 'reel', values and images namespaced sN_).

import { useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import ImagePicker from './ImagePicker';
import ReelRender from './ReelRender';
import { fillReel, scenePrefix } from '@/lib/design/reel';
import { uploadReel } from './exportPng';

const input = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '9px 11px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)' };
const label = { fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4, display: 'block' };

export default function ReelEditor({ design, reel, settings, readOnly, previousImages, onSaved, onDeleted, onBack, toast }) {
  const [name, setName] = useState(design.name || reel.name);
  const [values, setValues] = useState(design.values || {});
  const [images, setImages] = useState(design.images || {});
  const [consent, setConsent] = useState(design.overrides?.consent || {});
  const [brand, setBrand] = useState(design.overrides?.brand || {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickSlot, setPickSlot] = useState(null);
  const [error, setError] = useState('');

  const fill = useMemo(() => fillReel(reel, { settings, inputs: values, images, brand }), [reel, settings, values, images, brand]);
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const has = { logo: !!branding.logo_url, phone: !!settings?.business_phone, instagram: !!branding.instagram };
  const toggles = [['logo', 'לוגו'], ['phone', 'טלפון'], ['instagram', 'אינסטגרם']].filter(([k]) => has[k]);

  const patch = async (body) => {
    const res = await fetch(`/api/designs/${design.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || 'השמירה נכשלה');
    return data.design;
  };

  const save = async () => {
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    setSaving(true); setError('');
    try { const saved = await patch({ name, values, images, overrides: { consent, brand } }); setDirty(false); onSaved?.(saved); toast?.('הרילס נשמר'); }
    catch (e) { setError(String(e.message || e)); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (readOnly) return;
    if (!window.confirm('למחוק את הרילס הזה? אי אפשר לשחזר.')) return;
    const res = await fetch(`/api/designs/${design.id}`, { method: 'DELETE' });
    if (res.ok) { onDeleted?.(design.id); toast?.('הרילס נמחק'); } else setError('המחיקה נכשלה');
  };

  const onVideo = async (blob, ext) => {
    if (readOnly || !settings?.tenant_id) return;
    try { const path = await uploadReel(blob, settings.tenant_id, design.id, ext); await patch({ export_path: path }); } catch { /* the download still works */ }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} className="icon-btn" aria-label="חזרה"><Icon name="arrow-right" size={16} /></button>
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="שם הרילס" style={{ ...input, flex: 1, minWidth: 160, fontWeight: 700 }} />
        <span style={{ fontSize: 'var(--t-xs)', background: 'var(--pc-tint)', color: 'var(--pc-deep)', borderRadius: 'var(--r-full)', padding: '4px 10px', fontWeight: 700 }}><Icon name="film" size={12} /> רילס · {fill.totalSeconds} שניות</span>
      </div>

      {/* The scenes, as the studio draws them. */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
        {reel.scenes.map((s, i) => (
          <div key={s.id} style={{ flex: '0 0 auto', width: 108, textAlign: 'center' }}>
            <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-xs)', aspectRatio: '9 / 16' }}>
              <DomPreview template={s.frame} fill={fill.scenes[i]} width={108} style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16' }} />
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 4 }}>{i + 1}. {s.label} · {s.seconds}״</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          {toggles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={label}>בכל הסצנות</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {toggles.map(([k, l]) => { const on = brand[k] !== false; return (
                  <button key={k} type="button" role="switch" aria-checked={on} onClick={() => { setBrand((p) => ({ ...p, [k]: p[k] === false })); setDirty(true); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: `1px solid ${on ? 'var(--pc)' : 'var(--line-2)'}`, borderRadius: 'var(--r-full)', background: on ? 'var(--pc-tint)' : 'var(--surface)', color: on ? 'var(--pc-deep)' : 'var(--ink-3)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }}>
                    <Icon name={on ? 'check' : 'x'} size={12} /> {l}
                  </button>
                ); })}
              </div>
            </div>
          )}

          {reel.scenes.map((s, i) => {
            const p = scenePrefix(i);
            const vars = reel.variables.filter((v) => v.key.startsWith(p));
            const slots = reel.slots.filter((sl) => sl.key.startsWith(p));
            return (
              <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{i + 1}. {s.label} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {s.seconds} שניות</span></p>
                {slots.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {slots.map((sl) => (
                      <button key={sl.key} onClick={() => setPickSlot(sl)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                        <Icon name="image" size={14} /> {sl.label.replace(`${s.label}: `, '')}{images[sl.key] ? ' ✓' : sl.required ? ' (חסרה)' : ''}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 8 }}>
                  {vars.map((v) => (
                    <label key={v.key}>
                      <span style={label}>{v.label.replace(`${s.label}: `, '')}{v.required ? ' *' : ''}</span>
                      <input value={values[v.key] ?? ''} maxLength={v.maxLength} placeholder={fill.scenes[i].values[v.key.slice(p.length)] || v.default || ''} onChange={(e) => { setValues((x) => ({ ...x, [v.key]: e.target.value })); setDirty(true); }} style={input} />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button onClick={save} disabled={saving || readOnly} className="primary-btn" style={{ padding: '11px 20px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: saving || readOnly ? 0.6 : 1 }}>
              {saving ? <Spinner inline label="שומרת" /> : dirty ? 'שמירה' : 'נשמר'}
            </button>
            <button onClick={remove} disabled={readOnly} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit', padding: '11px 6px' }}><Icon name="trash" size={14} /> מחיקה</button>
          </div>
          {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
        </div>

        <div style={{ flex: '0 0 auto', width: 'min(100%, 320px)' }}>
          <ReelRender reel={reel} fills={fill.scenes} name={name} onVideo={onVideo} toast={toast} />
        </div>
      </div>

      <ImagePicker
        key={pickSlot ? pickSlot.key : 'none'}
        open={!!pickSlot} onClose={() => setPickSlot(null)} slot={pickSlot} current={pickSlot ? images[pickSlot.key] : null}
        branding={settings?.branding} tenantId={settings?.tenant_id} previous={previousImages} consent={pickSlot ? consent[pickSlot.key] : false}
        onPick={(ref, agreed) => { if (!pickSlot) return; setImages((p) => ({ ...p, [pickSlot.key]: ref })); setConsent((p) => ({ ...p, [pickSlot.key]: !!agreed })); setDirty(true); }}
      />
    </div>
  );
}
