'use client';

// app/design/DesignStudio.jsx
//
// The studio's front door on the marketing tab, top to bottom:
//   1. free-form generation, capped (Generate.jsx) - she types, gets options
//   2. the occasion cards - "ראש השנה בעוד 12 ימים, תרצי פוסט?" when a
//      seasonal template's window is open (lib/design/holidays.ts)
//   3. the gallery of templates, each already drawn with HER logo, colours,
//      name and first pictures; one card per key, the 9:16 story folded
//      into its 4:5 card as a second button. Unlimited, always open.
//   4. the designs she has saved
// Pick a template -> a design row is created from it -> the editor opens.

import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import DesignEditor from './DesignEditor';
import Generate from './Generate';
import { galleryTemplates, getTemplate, storySibling, TEMPLATES } from '@/lib/design/templates';
import { CATEGORY_LABELS, GROUP_LABELS } from '@/lib/design/contract';
import { fillTemplate } from '@/lib/design/mapBranding';
import { upcomingHolidays, holidayPrompt } from '@/lib/design/holidays';

const GROUPS = ['evergreen', 'seasonal', 'closer'];

const chip = (on) => ({ padding: '7px 13px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: on ? 'var(--pc)' : 'var(--surface)', color: on ? 'var(--pc-contrast)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
const ghost = { padding: '8px 0', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 1 };

async function fetchDesigns() {
  const res = await fetch('/api/designs');
  const data = await res.json().catch(() => null);
  return res.ok && data?.success ? data.designs : [];
}

/** The seasonal templates whose window is open today: one card each, newest feed version. */
function openOccasions() {
  let upcoming = [];
  try { upcoming = upcomingHolidays(); } catch { return []; }
  const out = [];
  for (const u of upcoming) {
    const t = TEMPLATES.filter((x) => x.holiday === u.holiday.key && x.format === 'feed45').sort((a, b) => b.version - a.version)[0];
    if (t) out.push({ upcoming: u, template: t });
  }
  return out;
}

export default function DesignStudio({ settings, readOnly, toast }) {
  const [group, setGroup] = useState(null); // null = all three groups, each under its heading
  const [designs, setDesigns] = useState(null);
  const [open, setOpen] = useState(null); // design being edited
  const [preview, setPreview] = useState(null); // template being looked at, large, before anything is created
  const [creating, setCreating] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchDesigns().then((d) => { if (alive) setDesigns(d); });
    return () => { alive = false; };
  }, []);

  const occasions = useMemo(() => openOccasions(), []);
  // Per group: its cards, the seasonal ones whose window is open lifted to the front with their days left.
  const sections = useMemo(() => {
    const open = new Map(occasions.map((o) => [o.template.key, o.upcoming]));
    return GROUPS.filter((g) => !group || g === group).map((g) => {
      const list = galleryTemplates(null, g);
      const rank = (t) => (open.has(t.key) ? open.get(t.key).daysLeft - 1000 : 0);
      return { group: g, templates: [...list].sort((a, b) => rank(a) - rank(b)), open };
    });
  }, [group, occasions]);
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

  if (preview) {
    const story = storySibling(preview.key);
    const fill = fillTemplate(preview, { settings });
    return (
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setPreview(null)} style={{ ...ghost, flex: 'none', padding: '8px 14px' }}><Icon name="arrow-right" size={14} /> חזרה לגלריה</button>
          <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)' }}>{preview.name}</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>ככה זה נראה עם הלוגו, הצבע והשם שלך, לפני שנוגעים במשהו.</p>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 'min(100%, 400px)' }}>
            <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)', aspectRatio: '4 / 5' }}>
              <DomPreview template={preview} fill={fill} width={400} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} />
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6, textAlign: 'center' }}>פוסט 4:5</p>
          </div>
          {story && (
            <div style={{ width: 'min(100%, 300px)' }}>
              <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)', aspectRatio: '9 / 16' }}>
                <DomPreview template={story} fill={fillTemplate(story, { settings })} width={300} style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16' }} />
              </div>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6, textAlign: 'center' }}>סטורי 9:16</p>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => create(preview)} disabled={creating === preview.key || readOnly} className="primary-btn" style={{ padding: '9px 18px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)' }}>
            {creating === preview.key ? <Spinner inline label="פותחת" /> : 'להשתמש בתבנית ולערוך'}
          </button>
          {story && <button onClick={() => create(story)} disabled={creating === story.key || readOnly} style={{ ...ghost, flex: 'none', padding: '9px 18px', fontSize: 'var(--t-sm)' }}>{creating === story.key ? <Spinner inline label="פותחת" /> : 'סטורי 9:16'}</button>}
        </div>
        {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  const card = (t, blocked, upcoming) => {
    const fill = fillTemplate(t, { settings });
    const story = storySibling(t.key);
    const storyOnly = t.format === 'story';
    return (
      <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
        {upcoming && <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, background: 'var(--pc)', color: 'var(--pc-contrast)', fontSize: 'var(--t-xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)' }}>{upcoming.daysLeft <= 0 ? 'עכשיו' : upcoming.daysLeft === 1 ? 'מחר' : `בעוד ${upcoming.daysLeft} ימים`}</span>}
        <button onClick={() => setPreview(t)} title="לתצוגה גדולה" style={{ padding: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)', aspectRatio: storyOnly ? '9 / 16' : '4 / 5', background: 'var(--surface-2)', cursor: 'zoom-in', display: 'block', width: '100%' }}>
          <DomPreview template={t} fill={fill} width={150} style={{ width: '100%', height: 'auto', aspectRatio: storyOnly ? '9 / 16' : '4 / 5' }} />
        </button>
        <div>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{t.name}</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.4 }}>{blocked ? 'צריך לפחות ביקורת אחת שמורה בהגדרות' : t.needs.length ? `צריך: ${t.needs.join(', ')}` : 'לא צריך כלום'}</p>
        </div>
        <button onClick={() => create(t)} disabled={blocked || creating === t.key || readOnly} className="primary-btn" style={{ padding: '9px 0', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: blocked || readOnly ? 0.5 : 1 }}>
          {creating === t.key ? <Spinner inline label="פותחת" /> : story ? 'פוסט 4:5' : storyOnly ? 'סטורי 9:16' : 'להשתמש בתבנית'}
        </button>
        {story && (
          <button onClick={() => create(story)} disabled={blocked || creating === story.key || readOnly} style={{ ...ghost, opacity: blocked || readOnly ? 0.5 : 1 }}>
            {creating === story.key ? <Spinner inline label="פותחת" /> : 'סטורי 9:16'}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Generate settings={settings} readOnly={readOnly} toast={toast} onCreated={(list) => setDesigns((p) => [...list, ...(p || [])])} onOpen={(d) => setOpen(d)} />

      {occasions.length > 0 && (
        <div className="glass-card" style={{ padding: '18px 24px', marginBottom: 18 }}>
          {occasions.map(({ upcoming, template }) => (
            <div key={template.key} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 64, borderRadius: 'var(--r-xs)', overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
                <DomPreview template={template} fill={fillTemplate(template, { settings })} width={64} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)' }}><Icon name="calendar" size={16} /> {holidayPrompt(upcoming)}</p>
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>תבנית {template.name} כבר בצבעים שלך; שני מילה, שני תמונה, והורידי.</p>
              </div>
              <button onClick={() => create(template)} disabled={creating === template.key || readOnly} className="primary-btn" style={{ padding: '9px 16px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)' }}>
                {creating === template.key ? <Spinner inline label="פותחת" /> : 'כן, בואי נכין'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>תבניות מוכנות, כבר בצבעים שלך</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>כל תבנית מתמלאת אוטומטית בלוגו, בשם העסק, בצבע המותג ובתמונות מהגלריה. בחרי אחת, שני מה שבא לך, והורידי. בלי הגבלה.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button style={chip(!group)} onClick={() => setGroup(null)}>הכול</button>
          {GROUPS.map((g) => <button key={g} style={chip(group === g)} onClick={() => setGroup(g)}>{GROUP_LABELS[g]}</button>)}
        </div>
        {sections.map((s) => (
          <div key={s.group} style={{ marginBottom: 22 }}>
            <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {GROUP_LABELS[s.group]} <span style={{ fontSize: 'var(--t-xs)', fontWeight: 400, color: 'var(--ink-3)', fontFamily: 'inherit' }}>{s.templates.length}</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
              {s.templates.map((t) => card(t, t.category === 'review' && !hasReviews, s.open.get(t.key) || null))}
            </div>
          </div>
        ))}
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
              const ratio = t.format === 'story' ? '9 / 16' : '4 / 5';
              return (
                <button key={d.id} onClick={() => setOpen(d)} style={{ textAlign: 'right', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: d.is_default ? '2px solid var(--pc)' : '1px solid var(--line)', aspectRatio: ratio, background: 'var(--surface-2)' }}>
                    <DomPreview template={t} fill={fill} overrides={d.overrides} width={130} style={{ width: '100%', height: 'auto', aspectRatio: ratio }} />
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
