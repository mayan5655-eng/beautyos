'use client';

// app/design/DesignStudio.jsx
//
// The studio's front door on the marketing tab: the gallery of templates,
// each one already drawn with HER logo, colours, name and first pictures,
// and the list of designs she has saved. Pick a template -> a design row is
// created from it -> the editor opens. No AI on this screen; the AI is one
// way to fill a design (stage 4), not the way in.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import DesignEditor from './DesignEditor';
import { latestTemplates, getTemplate } from '@/lib/design/templates';
import { CATEGORY_LABELS } from '@/lib/design/contract';
import { fillTemplate } from '@/lib/design/mapBranding';

const chip = (on) => ({ padding: '7px 13px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: on ? 'var(--pc)' : 'var(--surface)', color: on ? 'var(--pc-contrast)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function DesignStudio({ settings, readOnly, toast }) {
  const [category, setCategory] = useState(null);
  const [designs, setDesigns] = useState(null);
  const [open, setOpen] = useState(null); // design being edited
  const [creating, setCreating] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/designs');
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) setDesigns(data.designs); else setDesigns([]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const templates = useMemo(() => latestTemplates(category), [category]);
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const hasReviews = Array.isArray(branding.reviews) && branding.reviews.length > 0;
  const previousImages = useMemo(() => [...new Set((designs || []).flatMap((d) => Object.values(d.images || {})).filter((u) => typeof u === 'string' && u.startsWith('https://')))], [designs]);

  const create = async (t) => {
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    setCreating(t.key); setError('');
    try {
      const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateKey: t.key, templateVersion: t.version }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'לא הצלחנו ליצור עיצוב');
      setDesigns((p) => [data.design, ...(p || [])]);
      setOpen(data.design);
    } catch (e) { setError(String(e.message || e)); } finally { setCreating(''); }
  };

  if (open) {
    const template = getTemplate(open.template_key, open.template_version);
    if (!template) { setOpen(null); return null; }
    return (
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <DesignEditor
          key={open.id}
          design={open} template={template} settings={settings} readOnly={readOnly} previousImages={previousImages} toast={toast}
          onBack={() => setOpen(null)}
          onSaved={(d) => { setOpen(d); setDesigns((p) => (p || []).map((x) => (x.id === d.id ? d : x)).map((x) => (d.is_default && x.id !== d.id && x.category === d.category ? { ...x, is_default: false } : x))); }}
          onDuplicated={(d) => { setDesigns((p) => [d, ...(p || [])]); setOpen(d); }}
          onDeleted={(id) => { setDesigns((p) => (p || []).filter((x) => x.id !== id)); setOpen(null); }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>תבניות מוכנות, כבר בצבעים שלך</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>כל תבנית מתמלאת אוטומטית בלוגו, בשם העסק, בצבע המותג ובתמונות מהגלריה. בחרי אחת, שני מה שבא לך, והורידי.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button style={chip(!category)} onClick={() => setCategory(null)}>הכול</button>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <button key={k} style={chip(category === k)} onClick={() => setCategory(k)}>{l}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {templates.map((t) => {
            const fill = fillTemplate(t, { settings });
            const blocked = t.category === 'review' && !hasReviews;
            return (
              <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-xs)', aspectRatio: '4 / 5', background: 'var(--surface-2)' }}>
                  <DomPreview template={t} fill={fill} width={150} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} />
                </div>
                <div>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{t.name}</p>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.4 }}>{blocked ? 'צריך לפחות ביקורת אחת שמורה בהגדרות' : t.needs.length ? `צריך: ${t.needs.join(', ')}` : 'לא צריך כלום'}</p>
                </div>
                <button onClick={() => create(t)} disabled={blocked || creating === t.key || readOnly} className="primary-btn" style={{ padding: '9px 0', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: blocked || readOnly ? 0.5 : 1 }}>
                  {creating === t.key ? <Spinner inline label="פותחת" /> : 'להשתמש בתבנית'}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
      </div>

      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>העיצובים שלי</p>
        {designs === null ? <Spinner inline label="טוענת" /> : designs.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>עוד אין עיצובים שמורים. בחרי תבנית למעלה.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {designs.map((d) => {
              const t = getTemplate(d.template_key, d.template_version);
              if (!t) return null;
              const fill = fillTemplate(t, { settings, inputs: d.values, images: d.images });
              return (
                <button key={d.id} onClick={() => setOpen(d)} style={{ textAlign: 'right', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: d.is_default ? '2px solid var(--pc)' : '1px solid var(--line)', aspectRatio: '4 / 5', background: 'var(--surface-2)' }}>
                    <DomPreview template={t} fill={fill} overrides={d.overrides} width={130} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} />
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)', marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>{d.is_default && <Icon name="star" size={12} />}{d.name}</p>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{CATEGORY_LABELS[d.category] || d.category} · {new Date(d.updated_at).toLocaleDateString('he-IL')}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
