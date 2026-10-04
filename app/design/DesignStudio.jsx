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
import ReelEditor from './ReelEditor';
import Generate, { FORMAT_FOR_CHANNEL } from './Generate';
import WeekView from './WeekView';
import Archive from './Archive';
import { latestReels, getReel } from '@/lib/design/reels';
import { fillReel } from '@/lib/design/reel';
import { galleryTemplates, getTemplate, storySibling, TEMPLATES } from '@/lib/design/templates';
import { CATEGORY_LABELS, GROUP_LABELS } from '@/lib/design/contract';
import { fillTemplate } from '@/lib/design/mapBranding';
import { upcomingHolidays, holidayPrompt } from '@/lib/design/holidays';
import { businessFieldsOf } from '@/lib/businessFields';
import { topicsForField, SHAPE_META, buildTopicBrief } from '@/lib/ai/topicBank';
import { designIdeaSuggestion } from '@/lib/design/suggestions';
import { ICON_PLAY, ICON_FRAME } from '@/lib/brand';

const GROUPS = ['evergreen', 'seasonal', 'closer'];
const REEL_GROUP = 'reels';

const chip = (on) => ({ padding: '7px 13px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: on ? 'var(--pc)' : 'var(--surface)', color: on ? 'var(--pc-contrast)' : 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
const ghost = { padding: '8px 0', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 1 };

async function fetchDesigns() {
  const res = await fetch('/api/designs');
  const data = await res.json().catch(() => null);
  return res.ok && data?.success ? data.designs : [];
}

/** The seasonal templates whose window is open today: one card each, newest
 *  feed version, restricted to her own field(s) so a dual-field tenant does
 *  not see the same occasion twice and a single-field one never sees the
 *  other field's card at all. */
function openOccasions(fields) {
  let upcoming = [];
  try { upcoming = upcomingHolidays(); } catch { return []; }
  const out = [];
  for (const u of upcoming) {
    const t = TEMPLATES.filter((x) => x.holiday === u.holiday.key && x.format === 'feed45' && x.fields.some((f) => fields.includes(f))).sort((a, b) => b.version - a.version)[0];
    if (t) out.push({ upcoming: u, template: t });
  }
  return out;
}

export default function DesignStudio({ settings, readOnly, toast, appointments = [], services = [] }) {
  const [view, setView] = useState('week'); // the door's views: week | templates | mine
  const [preset, setPreset] = useState(null); // a brief handed to the AI card, e.g. a filming idea as a reel
  const [presetKey, setPresetKey] = useState(0);
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

  const fields = useMemo(() => businessFieldsOf(settings), [settings]);
  const occasions = useMemo(() => openOccasions(fields), [fields]);
  // Per group: its cards, the seasonal ones whose window is open lifted to the front with their days left.
  const sections = useMemo(() => {
    const open = new Map(occasions.map((o) => [o.template.key, o.upcoming]));
    return GROUPS.filter((g) => !group || g === group).map((g) => {
      const list = galleryTemplates(null, g, fields);
      const rank = (t) => (open.has(t.key) ? open.get(t.key).daysLeft - 1000 : 0);
      return { group: g, templates: [...list].sort((a, b) => rank(a) - rank(b)), open };
    });
  }, [group, occasions, fields]);
  // Design ideas: the topic bank's visual seed, browsable, not a ready-drawn
  // template like the sections above - a card here has no image until she
  // asks the AI card to write it. The seasonal production nudge (nails-only,
  // window-gated - see designIdeaSuggestion's own doc) points at an already-
  // drawn template instead, so it's created directly, the same tap as any
  // suggestion card, not handed to Generate.
  const [ideaQuery, setIdeaQuery] = useState('');
  const ideaTopics = useMemo(() => {
    const q = ideaQuery.trim();
    const all = topicsForField(fields);
    return q ? all.filter((t) => t.name.includes(q)) : all;
  }, [fields, ideaQuery]);
  const seasonalIdea = useMemo(() => designIdeaSuggestion({ fields }), [fields]);
  // "כמו בפעם הקודמת": her most recently CREATED design (not most recently
  // updated - the designs list itself is updated_at-sorted, which would
  // surface an old one she just re-opened rather than the last thing she
  // actually made), archived ones excluded. One tap re-runs the exact same
  // template or reel through `create`, which refills from her current
  // settings/services/branding - never the frozen values of the old row.
  const lastDesign = useMemo(() => {
    const candidates = (designs || []).filter((d) => d.template_key && d.status !== 'archived');
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [designs]);
  const repeatLast = () => {
    if (!lastDesign) return;
    const t = lastDesign.format === 'reel'
      ? getReel(lastDesign.template_key, lastDesign.template_version)
      : getTemplate(lastDesign.template_key, lastDesign.template_version);
    if (t) create(t);
  };
  // Hands a topic + shape off to the AI card exactly like WeekView's filming
  // idea does (onReel below): stuff `preset`, remount Generate with it, jump
  // to the week view where that card lives, and say where it landed.
  const sendIdeaToGenerate = (topic, shapeKey) => {
    const brief = buildTopicBrief(topic, shapeKey);
    const format = FORMAT_FOR_CHANNEL[SHAPE_META[shapeKey].channel] || 'feed45';
    setPreset({ brief, format });
    setPresetKey((k) => k + 1);
    setView('week');
    toast?.('הרעיון נכנס לכרטיס ה-AI למטה');
  };
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const hasReviews = Array.isArray(branding.reviews) && branding.reviews.length > 0;
  const previousImages = useMemo(() => [...new Set((designs || []).flatMap((d) => Object.values(d.images || {})).filter((u) => typeof u === 'string' && u.startsWith('https://')))], [designs]);

  const create = async (t, values = null) => {
    if (readOnly) { toast?.('החשבון במצב קריאה בלבד', 'error'); return; }
    setCreating(t.key); setError('');
    try {
      const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateKey: t.key, templateVersion: t.version, ...(values ? { values } : {}) }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'לא הצלחנו ליצור עיצוב');
      setDesigns((p) => [data.design, ...(p || [])]);
      setOpen(data.design);
    } catch (e) { setError(String(e.message || e)); } finally { setCreating(''); }
  };

  if (open && open.format === 'reel') {
    const reel = getReel(open.template_key, open.template_version);
    if (!reel) { setOpen(null); return null; }
    return (
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <ReelEditor
          key={open.id}
          design={open} reel={reel} settings={settings} readOnly={readOnly} previousImages={previousImages} toast={toast}
          onBack={() => setOpen(null)}
          onSaved={(d) => { setOpen(d); setDesigns((p) => (p || []).map((x) => (x.id === d.id ? d : x))); }}
          onDeleted={(id) => { setDesigns((p) => (p || []).filter((x) => x.id !== id)); setOpen(null); }}
        />
      </div>
    );
  }

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
              <DomPreview template={preview} fill={fill} width={400} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} preferSeed />
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6, textAlign: 'center' }}>פוסט 4:5</p>
          </div>
          {story && (
            <div style={{ width: 'min(100%, 300px)' }}>
              <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)', aspectRatio: '9 / 16' }}>
                <DomPreview template={story} fill={fillTemplate(story, { settings })} width={300} style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16' }} preferSeed />
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
          <DomPreview template={t} fill={fill} width={150} style={{ width: '100%', height: 'auto', aspectRatio: storyOnly ? '9 / 16' : '4 / 5' }} preferSeed />
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

  const reelCard = (r) => {
    const f = fillReel(r, { settings });
    const blocked = r.category === 'review' && !hasReviews;
    return (
      <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {r.scenes.slice(0, 3).map((s, i) => (
            <div key={s.id} style={{ flex: 1, borderRadius: 'var(--r-xs)', overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '9 / 16', background: 'var(--surface-2)' }}>
              <DomPreview template={s.frame} fill={f.scenes[i]} width={48} style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16' }} preferSeed />
            </div>
          ))}
        </div>
        <div>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}><Icon name="film" size={12} /> {r.name}</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.4 }}>{r.scenes.length} סצנות · {f.totalSeconds} שניות · {blocked ? 'צריך ביקורת שמורה' : r.needs.length ? `צריך: ${r.needs.join(', ')}` : 'לא צריך כלום'}</p>
        </div>
        <button onClick={() => create(r)} disabled={blocked || creating === r.key || readOnly} className="primary-btn" style={{ padding: '9px 0', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: blocked || readOnly ? 0.5 : 1 }}>
          {creating === r.key ? <Spinner inline label="פותחת" /> : 'ליצור רילס'}
        </button>
      </div>
    );
  };

  const viewChip = (k, l, n) => (
    <button key={k} onClick={() => setView(k)} style={{ ...chip(view === k), display: 'flex', gap: 6, alignItems: 'center' }}>{l}{typeof n === 'number' ? <span style={{ fontSize: 'var(--t-xs)', opacity: 0.8 }}>{n}</span> : null}</button>
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {viewChip('week', 'השבוע')}
        {viewChip('templates', 'תבניות')}
        {viewChip('ideas', 'רעיונות', ideaTopics.length)}
        {viewChip('mine', 'שלי', (designs || []).length)}
      </div>

      {view === 'week' && (
        <>
          {lastDesign && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', flex: 1, minWidth: 160 }}><Icon name="refresh" size={13} /> כמו בפעם הקודמת: <b style={{ color: 'var(--ink)' }}>{lastDesign.name || 'העיצוב האחרון שלך'}</b></p>
              <button disabled={creating || readOnly} onClick={repeatLast} style={{ ...ghost, flex: '0 0 auto', padding: '9px 18px' }}>
                {creating === lastDesign.template_key ? <Spinner inline label="" /> : 'לחזור על זה, עם הנתונים של היום'}
              </button>
            </div>
          )}
          <WeekView settings={settings} appointments={appointments} services={services} designs={designs || []} readOnly={readOnly} creating={creating} toast={toast}
            onCreate={(t, values) => create(t, values)}
            onReel={(brief) => { setPreset({ brief, format: 'reel' }); setPresetKey((k) => k + 1); toast?.('הרעיון נכנס לכרטיס ה-AI למטה'); }} />
          <Generate key={presetKey} preset={preset} settings={settings} readOnly={readOnly} toast={toast} onCreated={(list) => { setDesigns((p) => [...list, ...(p || [])]); }} onOpen={(d) => setOpen(d)} />
          {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
        </>
      )}

      {false && occasions.length > 0 && (
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

      {view === 'templates' && <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <img aria-hidden alt="" src={ICON_FRAME} style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
          <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>תבניות מוכנות, כבר בצבעים שלך</p>
        </div>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>כל תבנית מתמלאת אוטומטית בלוגו, בשם העסק, בצבע המותג ובתמונות מהגלריה. בחרי אחת, שני מה שבא לך, והורידי. בלי הגבלה.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button style={chip(!group)} onClick={() => setGroup(null)}>הכול</button>
          {GROUPS.map((g) => <button key={g} style={chip(group === g)} onClick={() => setGroup(g)}>{GROUP_LABELS[g]}</button>)}
          <button style={chip(group === REEL_GROUP)} onClick={() => setGroup(REEL_GROUP)}><Icon name="film" size={12} /> רילסים</button>
        </div>
        {(!group || group === REEL_GROUP) && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <img aria-hidden alt="" src={ICON_PLAY} style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} />
              <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                רילסים <span style={{ fontSize: 'var(--t-xs)', fontWeight: 400, color: 'var(--ink-3)', fontFamily: 'inherit' }}>{latestReels(null, null, fields).length}</span>
              </p>
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginBottom: 10 }}>רצף מוכן של 3 עד 5 סצנות: מלאי תמונות וכיתובים, והסרטון נבנה אצלך בדפדפן.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
              {latestReels(null, null, fields).map(reelCard)}
            </div>
          </div>
        )}
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
      </div>}

      {view === 'ideas' && <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>רעיונות, לא פוסטים מוכנים</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>כיוון אמיתי לכל נושא — בחרי זווית וה-AI כותב פוסט טרי סביבו בכרטיס ה-AI. שונה מהתבניות למעלה: שם אין תמונה מוכנה לבחור, כאן יש כיוון לצלם וליצור.</p>

        {seasonalIdea && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', marginBottom: 18, background: 'var(--pc-tint)', border: `1px solid var(--pc)`, borderRadius: 'var(--r-md)' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--pc-deep)', marginBottom: 3 }}><Icon name="sparkle" size={12} /> רעיון לצילום, לא לפרסום מיידי</p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', fontWeight: 600 }}>{seasonalIdea.reason}</p>
            </div>
            <button disabled={creating || readOnly} onClick={() => { const t = getTemplate(seasonalIdea.templateKey); if (t) create(t); }} className="primary-btn" style={{ padding: '9px 16px', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', flexShrink: 0 }}>
              {creating === seasonalIdea.templateKey ? <Spinner inline label="" /> : 'ליצור כרטיס לעונה'}
            </button>
          </div>
        )}

        <input value={ideaQuery} onChange={(e) => setIdeaQuery(e.target.value)} placeholder="חיפוש נושא..." style={{ width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-xs)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)', outline: 'none', marginBottom: 12 }} dir="rtl" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {ideaTopics.map((t) => (
            <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 14px', background: 'var(--surface)' }}>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{t.name}</p>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 9 }}>{t.visualSeed}</p>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {Object.entries(SHAPE_META).map(([key, meta]) => (
                  <button key={key} title={meta.goal} disabled={readOnly} onClick={() => sendIdeaToGenerate(t, key)}
                    style={{ fontSize: 'var(--t-xs)', padding: '4px 9px', borderRadius: 'var(--r-full)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', cursor: readOnly ? 'default' : 'pointer', fontFamily: 'inherit', opacity: readOnly ? 0.5 : 1 }}>
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {ideaTopics.length === 0 && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>לא נמצאו נושאים תואמים.</p>}
        </div>
      </div>}

      {view === 'mine' && <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>העיצובים שלי</p>
        {designs === null ? <Spinner inline label="טוענת" /> : designs.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>עוד אין עיצובים שמורים. בחרי תבנית למעלה.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {designs.map((d) => {
              const reel = d.format === 'reel' ? getReel(d.template_key, d.template_version) : null;
              const t = reel ? reel.scenes[0].frame : getTemplate(d.template_key, d.template_version);
              if (!t) return null;
              const fill = reel ? fillReel(reel, { settings, inputs: d.values, images: d.images, brand: d.overrides?.brand }).scenes[0] : fillTemplate(t, { settings, inputs: d.values, images: d.images, brand: d.overrides?.brand });
              const ratio = t.format === 'story' ? '9 / 16' : '4 / 5';
              return (
                <button key={d.id} onClick={() => setOpen(d)} style={{ textAlign: 'right', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: d.is_default ? '2px solid var(--pc)' : '1px solid var(--line)', aspectRatio: ratio, background: 'var(--surface-2)' }}>
                    <DomPreview template={t} fill={fill} overrides={d.overrides} width={130} style={{ width: '100%', height: 'auto', aspectRatio: ratio }} />
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)', marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>{d.is_default && <Icon name="star" size={12} />}{reel && <Icon name="film" size={12} />}{d.name}</p>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{CATEGORY_LABELS[d.category] || d.category} · {new Date(d.updated_at).toLocaleDateString('he-IL')}</p>
                </button>
              );
            })}
          </div>
        )}
        <Archive toast={toast} />
      </div>}
    </>
  );
}
