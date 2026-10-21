'use client';

// app/design/ContentPlan.jsx
//
// "לוח התוכן": her content calendar inside the Content tab (docs/specs/content-publishing.md, stages 1-2). Behind the
// content_plan flag: the server answers enabled:false and this renders nothing for everyone else.
// A month calendar like Meta's planner (drag a post to another day on a computer), a list view, the weekly plan Kalmea
// writes for her, and "+ פוסט חדש" for HER OWN posts: her picture (redrawn as an Instagram-ready JPEG in
// contentMedia.js), her texts, the day and time.
//
// Each post: the picture (her template, in her colours), the topic, the day and time (editable), and one text per
// platform (Instagram, Facebook), editable, with a counter. She approves ("מאשרת"), copies the text, opens the picture to
// edit, marks it posted, or skips it. A morning reminder tells her on the day.
// Automatic publishing (stage 2, behind its own content_publish_meta flag): she connects her Page with publishing
// permission and switches it on; then approving renders the picture from the card, stores it in her private folder,
// and the server queues the post for its time. Each post then shows "scheduled", "published" (with the link) or
// "failed" with the reason. Without the flag, approving stays a reminder, and the card says so plainly.

import { useEffect, useMemo, useState } from 'react';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import { getTemplate } from '@/lib/design/templates';
import { fillTemplate } from '@/lib/design/mapBranding';
import { renderTemplateBlob } from './canvasRender';
import { uploadPostPicture } from './contentMedia';

const PLATFORM_HE = { instagram: 'אינסטגרם', facebook: 'פייסבוק' };
const LIMITS = { instagram: 2200, facebook: 5000 };
const DAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const STATUS = {
  planned: { he: 'ממתין לאישור שלך', fg: 'var(--warning)' },
  approved: { he: 'אישרת', fg: 'var(--success)' },
  posted: { he: 'פורסם', fg: 'var(--pc-deep)' },
};

const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 14px' };
const btn = { padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40, whiteSpace: 'nowrap' };
const primary = { ...btn, background: 'var(--pc-grad)', color: 'var(--pc-contrast)', border: 'none' };

/** Draws the card and stores it, as an Instagram-ready JPEG, in her private folder; returns the storage path. */
async function renderForPublishing(template, fill, tenantId, itemId) {
  const blob = await renderTemplateBlob(template, fill);
  return uploadPostPicture(blob, tenantId, itemId);
}

const JOB_HE = { queued: 'מתוזמן', claimed: 'מתפרסם עכשיו', container_created: 'מתפרסם עכשיו', published: 'פורסם', failed: 'לא פורסם', paused: 'מושהה' };
const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const CHIP = {
  planned: { bg: '#FBF0DC', fg: '#7A5512', bd: '#EBD3A4' },
  approved: { bg: '#E8F1EA', fg: '#2F5E3A', bd: '#C9DFCD' },
  posted: { bg: 'var(--pc-tint)', fg: 'var(--pc-deep)', bd: 'var(--pc)' },
  failed: { bg: '#FAEDEB', fg: '#9A5148', bd: '#EBD4D0' },
};

async function api(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || 'הפעולה נכשלה, נסי שוב');
  return data;
}

const p2 = (n) => String(n).padStart(2, '0');
/** A Date as the value of <input type="datetime-local"> in her own clock. */
const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const ymdLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** The month grid: whole weeks from the Sunday on or before the 1st to the Saturday on or after the last day. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const last = new Date(year, month + 1, 0);
  const end = new Date(year, month + 1, 0 + (6 - last.getDay()));
  const days = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d);
  return { days, from: ymdLocal(start), to: ymdLocal(end) };
}

const itemState = (it) => ((it.jobs || []).some((j) => j.state === 'failed') ? 'failed' : it.status);

export default function ContentPlan({ settings, readOnly, toast, onCreate }) {
  const [state, setState] = useState(null); // GET answer
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);
  const [view, setView] = useState('calendar'); // calendar | list
  const [month, setMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [selected, setSelected] = useState(null); // item id open under the calendar
  const [composer, setComposer] = useState(null); // { date: 'YYYY-MM-DDTHH:mm' } | null
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);

  const load = () => fetch(`/api/content/plan?from=${grid.from}&to=${grid.to}`).then((r) => r.json()).then((d) => setState(d)).catch(() => setState({ success: false, error: 'לא הצלחנו לטעון את לוח התוכן' }));
  useEffect(() => { load(); }, [grid.from, grid.to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || state.enabled === false) return null;
  const items = state.plan?.items || [];
  const autoPublish = !!state.publish?.enabled && (state.publish.pages || []).some((p) => p.publish_enabled && (p.can.facebook || p.can.instagram));
  const postHour = state.preferences?.post_hour ?? 19;

  const generate = async () => {
    setBusy('generate'); setError('');
    try {
      await api('/api/content/plan', 'POST', { action: 'generate' });
      await load();
      toast?.('התוכנית לשבוע מוכנה. עברי עליה ואשרי');
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const patchItem = (id, upd) => setState((s) => ({ ...s, plan: s.plan && { ...s.plan, items: s.plan.items.map((i) => (i.id === id ? { ...i, ...upd } : i)) } }));
  const openNew = (day) => {
    const base = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), postHour, 0) : new Date(Date.now() + 60 * 60_000);
    const when = base.getTime() < Date.now() + 10 * 60_000 ? new Date(Date.now() + 60 * 60_000) : base;
    setSelected(null);
    setComposer({ date: toLocalInput(when.toISOString()) });
  };
  // Drag a post to another day (computer): same hour, new date; only to today or later.
  const moveTo = async (id, day) => {
    const it = items.find((x) => x.id === id);
    if (!it || it.status === 'posted') return;
    const old = new Date(it.planned_for);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes());
    if (next.getTime() < Date.now()) { toast?.('אפשר להעביר רק ליום שעוד לא עבר', 'error'); return; }
    try {
      const d = await api('/api/content/items', 'PATCH', { id, planned_for: next.toISOString() });
      patchItem(id, { planned_for: d.item.planned_for, label: d.item.label });
      toast?.(`הפוסט הועבר ל${d.item.label}`);
    } catch (e) { toast?.(e.message, 'error'); }
  };

  const byDay = new Map();
  for (const it of items) {
    const k = ymdLocal(new Date(it.planned_for));
    byDay.set(k, [...(byDay.get(k) || []), it]);
  }
  const todayKey = ymdLocal(new Date());
  const sel = items.find((i) => i.id === selected) || null;
  const tool = { ...btn, minHeight: 36, padding: '6px 12px' };

  return (
    <div className="glass-card" data-testid="content-plan" style={{ padding: '20px 22px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>לוח התוכן שלך</p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: '4px 0 0' }}>
            כל הפוסטים בלוח אחד: מה שקלמיה מכינה לך, ופוסטים שלך עם תמונה שלך. בוחרים יום ושעה, מאשרים, וזה יוצא בזמן.
          </p>
        </div>
        {state.available && <button type="button" style={btn} onClick={() => setShowPrefs((v) => !v)}>{showPrefs ? 'סגירה' : 'הגדרות הלוח'}</button>}
      </div>

      {state.available === false && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>{state.error}</p>}
      {state.available && showPrefs && <Preferences initial={state.preferences} readOnly={readOnly} toast={toast} onSaved={(p) => { setState((s) => ({ ...s, preferences: p })); setShowPrefs(false); }} />}

      {state.available && (
        <>
          {state.publish?.enabled
            ? <PublishPanel publish={state.publish} readOnly={readOnly} toast={toast} onPages={(pages) => setState((s) => ({ ...s, publish: { ...s.publish, pages } }))} />
            : (
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.6, margin: '6px 0 12px', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
                פרסום אוטומטי לאינסטגרם ולפייסבוק ייפתח כאן אחרי האישור של Meta. עד אז, בכל פוסט יש העתקת טקסט והורדת התמונה בלחיצה.
              </p>
            )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 12px' }}>
            <button type="button" style={{ ...primary, minHeight: 40 }} disabled={readOnly} onClick={() => openNew(null)}>+ פוסט חדש</button>
            <button type="button" style={tool} disabled={readOnly || busy === 'generate'} onClick={generate}>
              {busy === 'generate' ? <Spinner inline label="מכינה" /> : 'להכין לי תוכנית לשבוע'}
            </button>
            <div role="tablist" aria-label="תצוגה" style={{ display: 'flex', gap: 4, marginInlineStart: 'auto' }}>
              {[['calendar', 'לוח חודשי'], ['list', 'רשימה']].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                  style={{ ...tool, background: view === k ? 'var(--pc-tint)' : 'var(--surface)', borderColor: view === k ? 'var(--pc)' : 'var(--line-2)' }}>{l}</button>
              ))}
            </div>
          </div>

          {composer && (
            <Composer key={composer.date} initialDate={composer.date} tenantId={settings?.tenant_id} autoPublish={autoPublish} toast={toast}
              onClose={() => setComposer(null)} onSaved={async (id) => { setComposer(null); await load(); setSelected(id); }} />
          )}

          {view === 'calendar' ? (
            <div data-testid="content-calendar">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <button type="button" style={tool} aria-label="החודש הקודם" onClick={() => setMonth((m) => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))}>→</button>
                <p className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 'var(--t-lg)' }}>{MONTHS_HE[month.m]} {month.y}</p>
                <button type="button" style={tool} aria-label="החודש הבא" onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))}>←</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                {DAYS_HE.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 'var(--t-xs)', fontWeight: 700, color: 'var(--ink-3)', padding: '2px 0' }}>{d}</div>)}
                {grid.days.map((day) => {
                  const k = ymdLocal(day);
                  const list = byDay.get(k) || [];
                  const inMonth = day.getMonth() === month.m;
                  const past = k < todayKey;
                  return (
                    <div key={k} data-day={k}
                      onDragOver={(e) => { if (!past && !readOnly) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) moveTo(id, day); }}
                      onClick={() => { if (!past && !readOnly && !list.length) openNew(day); }}
                      style={{ minHeight: 74, border: `1px solid ${k === todayKey ? 'var(--pc)' : 'var(--line)'}`, borderRadius: 10, padding: 4, background: inMonth ? 'var(--surface)' : 'var(--surface-2)', opacity: inMonth ? 1 : 0.6, cursor: !past && !readOnly && !list.length ? 'pointer' : 'default', minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--t-xs)', fontWeight: k === todayKey ? 800 : 600, color: k === todayKey ? 'var(--pc-deep)' : 'var(--ink-2)' }}>{day.getDate()}</span>
                        {!past && !readOnly && list.length > 0 && (
                          <button type="button" aria-label={`פוסט חדש ב-${day.getDate()}`} onClick={(e) => { e.stopPropagation(); openNew(day); }}
                            style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>+</button>
                        )}
                      </div>
                      {list.slice(0, 3).map((it) => {
                        const c = CHIP[itemState(it)] || CHIP.planned;
                        const d = new Date(it.planned_for);
                        return (
                          <button key={it.id} type="button" draggable={!readOnly && it.status !== 'posted'}
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
                            onClick={(e) => { e.stopPropagation(); setComposer(null); setSelected(it.id === selected ? null : it.id); }}
                            title={it.topic}
                            style={{ display: 'block', width: '100%', textAlign: 'right', marginTop: 3, padding: '2px 4px', borderRadius: 6, border: `1px solid ${it.id === selected ? 'var(--ink)' : c.bd}`, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p2(d.getHours())}:{p2(d.getMinutes())} {it.topic}
                          </button>
                        );
                      })}
                      {list.length > 3 && <p style={{ fontSize: 10, color: 'var(--ink-3)', margin: '2px 0 0' }}>+{list.length - 3}</p>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>
                {[['planned', 'ממתין לאישור'], ['approved', 'מאושר ומתוזמן'], ['posted', 'פורסם'], ['failed', 'לא פורסם']].map(([k, l]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CHIP[k].bg, border: `1px solid ${CHIP[k].bd}` }} />{l}</span>
                ))}
                <span>במחשב אפשר לגרור פוסט ליום אחר.</span>
              </div>
              {sel && (
                <div style={{ marginTop: 12 }}>
                  <PlanItem key={sel.id} item={sel} settings={settings} readOnly={readOnly} toast={toast} onCreate={onCreate} autoPublish={autoPublish} onReload={load}
                    onChange={(upd) => patchItem(sel.id, upd)} onGone={() => { setSelected(null); load(); }} />
                </div>
              )}
              {!items.length && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginTop: 10 }}>אין עדיין פוסטים בחודש הזה. אפשר ללחוץ על יום בלוח, על "פוסט חדש", או על "להכין לי תוכנית לשבוע".</p>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {!items.length && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>אין פוסטים בתקופה הזו.</p>}
              {items.map((it) => (
                <PlanItem key={it.id} item={it} settings={settings} readOnly={readOnly} toast={toast} onCreate={onCreate} autoPublish={autoPublish} onReload={load}
                  onChange={(upd) => patchItem(it.id, upd)} onGone={() => load()} />
              ))}
            </div>
          )}
          {error && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
        </>
      )}
    </div>
  );
}

/** "+ פוסט חדש": her own post. Picture from her phone or computer, the texts, the day and time. */
function Composer({ initialDate, tenantId, autoPublish, toast, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [when, setWhen] = useState(initialDate);
  const [ig, setIg] = useState('');
  const [tags, setTags] = useState('');
  const [same, setSame] = useState(true);
  const [fb, setFb] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f) => {
    setErr('');
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr('צריך לבחור קובץ תמונה'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f));
  };
  const save = async (approve) => {
    setBusy(approve ? 'approve' : 'save'); setErr('');
    try {
      if (!file) throw new Error('צריך לבחור תמונה לפוסט');
      if (!ig.trim() && !(same ? '' : fb.trim())) throw new Error('צריך לכתוב טקסט לפוסט');
      const hashtags = tags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
      const texts = { instagram: { caption: ig, hashtags }, facebook: { caption: same ? ig : fb } };
      const created = await api('/api/content/items', 'POST', { planned_for: new Date(when).toISOString(), texts });
      const id = created.item.id;
      const media_path = await uploadPostPicture(file, tenantId, id);
      const d = await api('/api/content/items', 'PATCH', { id, media_path, ...(approve ? { status: 'approved' } : {}) });
      if (approve) toast?.(d.publish?.queued?.length ? `נשמר ותוזמן לפרסום (${d.publish.queued.map((p) => PLATFORM_HE[p]).join(', ')})` : 'נשמר ואושר. נזכיר לך ביום הפרסום');
      else toast?.('הפוסט נשמר בלוח');
      onSaved(id);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const field = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 'var(--t-sm)', lineHeight: 1.6, background: 'var(--surface)' };
  const igCount = ig.length + (tags.trim() ? tags.trim().length + 2 : 0);

  return (
    <div data-testid="content-composer" style={{ ...card, display: 'grid', gap: 10, marginBottom: 12, borderColor: 'var(--pc)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, margin: 0 }}>פוסט חדש</p>
        <button type="button" style={{ ...btn, minHeight: 34 }} onClick={onClose}>סגירה</button>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label style={{ width: 120, aspectRatio: '4 / 5', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', background: 'var(--surface-2)', flexShrink: 0 }}>
          {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', textAlign: 'center', padding: 8 }}>+ תמונה</span>}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} aria-label="תמונה לפוסט" />
        </label>
        <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>מתי לפרסם
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...field, marginTop: 4, minHeight: 42 }} />
          </label>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>תמונה מהטלפון או מהמחשב. אם היא גבוהה או רחבה מדי לאינסטגרם, נוסיף לה שוליים בלי לחתוך.</p>
        </div>
      </div>
      <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>הטקסט לאינסטגרם
        <textarea rows={5} value={ig} onChange={(e) => setIg(e.target.value)} style={{ ...field, marginTop: 4, resize: 'vertical' }} />
      </label>
      <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>האשטגים (רווח בין אחד לשני)
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#טיפוחפנים #קוסמטיקה" style={{ ...field, marginTop: 4, direction: 'rtl' }} />
      </label>
      <span style={{ fontSize: 'var(--t-xs)', color: igCount > LIMITS.instagram ? 'var(--danger)' : 'var(--ink-3)' }}>{igCount} / {LIMITS.instagram}</span>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--t-sm)' }}>
        <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> אותו טקסט גם לפייסבוק
      </label>
      {!same && (
        <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>הטקסט לפייסבוק
          <textarea rows={4} value={fb} onChange={(e) => setFb(e.target.value)} style={{ ...field, marginTop: 4, resize: 'vertical' }} />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={primary} disabled={!!busy} onClick={() => save(true)}>{busy === 'approve' ? <Spinner inline label="שומרת" /> : autoPublish ? 'שמירה ותזמון לפרסום' : 'שמירה ואישור'}</button>
        <button type="button" style={btn} disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? <Spinner inline label="שומרת" /> : 'שמירה בלי לאשר'}</button>
      </div>
      {err && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0 }}>{err}</p>}
    </div>
  );
}

function PlanItem({ item, settings, readOnly, toast, onCreate, onChange, onGone, autoPublish, onReload }) {
  const platforms = Object.keys(item.platforms || {}).filter((p) => PLATFORM_HE[p]);
  const [tab, setTab] = useState(platforms[0] || 'instagram');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [editTime, setEditTime] = useState(false);
  const [time, setTime] = useState(toLocalInput(item.planned_for));
  const text = item.platforms?.[tab];
  const [draft, setDraft] = useState(text?.caption || '');
  useEffect(() => { setDraft(item.platforms?.[tab]?.caption || ''); }, [tab, item.platforms]);

  const t = useMemo(() => (item.template_key ? getTemplate(item.template_key) : null), [item.template_key]);
  const fill = useMemo(() => (t ? fillTemplate(t, { settings, inputs: item.values || {} }) : null), [t, settings, item.values]);
  const st = STATUS[item.status] || STATUS.planned;

  const run = async (key, fn) => { setBusy(key); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const setStatus = (status, okMsg) => run(status, async () => {
    // With automatic publishing on, the picture that goes out is drawn from the card now, at approval.
    // Her own post already has its picture (media_path); a template card is drawn now.
    const media_path = status === 'approved' && autoPublish && t && fill && !item.media_path ? await renderForPublishing(t, fill, settings?.tenant_id, item.id) : undefined;
    const d = await api('/api/content/items', 'PATCH', { id: item.id, status, ...(media_path ? { media_path } : {}) });
    if (d.publish) {
      onReload?.();
      if (status === 'approved') toast?.(d.publish.queued?.length ? `אושר ותוזמן לפרסום אוטומטי (${d.publish.queued.map((p) => PLATFORM_HE[p]).join(', ')})` : 'אושר. הפרסום האוטומטי לא תוזמן, נזכיר לך ביום הפרסום');
      return;
    }
    if (status === 'skipped') { onGone(); toast?.('דילגנו על הפוסט'); return; }
    onChange({ status: d.item.status, approved_at: d.item.approved_at, posted_at: d.item.posted_at });
    if (okMsg) toast?.(okMsg);
  });
  const saveText = () => run('save', async () => {
    const d = await api('/api/content/items', 'PATCH', { id: item.id, platform: tab, caption: draft, hashtags: text?.hashtags || [] });
    onChange({ platforms: { ...item.platforms, [tab]: { ...item.platforms[tab], ...d.text } } });
    toast?.('הטקסט נשמר');
  });
  const saveTime = () => run('time', async () => {
    const d = await api('/api/content/items', 'PATCH', { id: item.id, planned_for: new Date(time).toISOString() });
    onChange({ planned_for: d.item.planned_for, label: d.item.label });
    setEditTime(false);
  });
  const copy = () => run('copy', async () => {
    const full = [text?.caption || '', (text?.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(full);
    toast?.(`הטקסט ל${PLATFORM_HE[tab]} הועתק`);
    fetch('/api/content/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, platform: tab, copied: true }) }).catch(() => {});
  });

  const dirty = draft.trim() !== (text?.caption || '').trim();
  const count = draft.length + (tab === 'instagram' && text?.hashtags?.length ? text.hashtags.join(' ').length + 2 : 0);

  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }} data-testid="plan-item">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {item.media_url ? (
          <div style={{ width: 84, flexShrink: 0, borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '4 / 5', background: 'var(--surface-2)' }}>
            <img src={item.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ) : t && fill ? (
          <div style={{ width: 84, flexShrink: 0, borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '4 / 5', background: 'var(--surface-2)' }}>
            <DomPreview template={t} fill={fill} width={84} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} preferSeed />
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: st.fg, border: `1px solid ${st.fg}`, borderRadius: 'var(--r-full)', padding: '2px 8px' }}>{st.he}</span>
            <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600 }}>{item.label}</span>
          </div>
          <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px', overflowWrap: 'anywhere' }}>{item.topic}</p>
          {item.reason && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 }}>{item.reason}</p>}
          {(item.jobs || []).length > 0 && (
            <div data-testid="publish-jobs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {item.jobs.map((j) => (
                <span key={j.platform} title={j.error || ''} style={{ fontSize: 'var(--t-xs)', fontWeight: 700, borderRadius: 'var(--r-full)', padding: '2px 8px', border: '1px solid var(--line-2)', color: j.state === 'failed' ? 'var(--danger)' : j.state === 'published' ? 'var(--success)' : 'var(--ink-2)' }}>
                  {PLATFORM_HE[j.platform]}: {JOB_HE[j.state] || j.state}
                  {j.state === 'published' && j.external_url ? <> · <a href={j.external_url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>לפוסט</a></> : null}
                </span>
              ))}
            </div>
          )}
          {(item.jobs || []).filter((j) => j.state === 'failed' && j.error).map((j) => (
            <p key={j.platform} role="alert" style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)', lineHeight: 1.5, margin: '4px 0 0' }}>{PLATFORM_HE[j.platform]}: {j.error}</p>
          ))}
        </div>
      </div>

      {editTime && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} aria-label="מתי לפרסם"
            style={{ border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontFamily: 'inherit', fontSize: 'var(--t-sm)', minHeight: 40 }} />
          <button type="button" style={btn} disabled={busy === 'time'} onClick={saveTime}>{busy === 'time' ? <Spinner inline label="" /> : 'שמירת הזמן'}</button>
          <button type="button" style={btn} onClick={() => setEditTime(false)}>ביטול</button>
        </div>
      )}

      {platforms.length > 0 && (
        <div>
          <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {platforms.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => setTab(p)}
                style={{ ...btn, minHeight: 34, padding: '4px 12px', background: tab === p ? 'var(--pc-tint)' : 'var(--surface)', borderColor: tab === p ? 'var(--pc)' : 'var(--line-2)' }}>
                {PLATFORM_HE[p]}{item.platforms[p]?.copied_at ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} readOnly={readOnly || item.status === 'posted'} rows={6} aria-label={`הטקסט ל${PLATFORM_HE[tab]}`}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 'var(--t-sm)', lineHeight: 1.6, resize: 'vertical', background: 'var(--surface)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', direction: 'ltr' }}>{(text?.hashtags || []).join(' ')}</span>
            <span style={{ fontSize: 'var(--t-xs)', color: count > LIMITS[tab] ? 'var(--danger)' : 'var(--ink-3)' }}>{count} / {LIMITS[tab]}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.status === 'planned' && <button type="button" style={primary} disabled={readOnly || !!busy} onClick={() => setStatus('approved', 'אושר. נזכיר לך ביום הפרסום')}>{busy === 'approved' ? <Spinner inline label="" /> : autoPublish ? 'מאשרת ומתזמנת' : 'מאשרת'}</button>}
        {dirty && <button type="button" style={primary} disabled={readOnly || busy === 'save'} onClick={saveText}>{busy === 'save' ? <Spinner inline label="" /> : 'שמירת הטקסט'}</button>}
        <button type="button" style={btn} disabled={!text?.caption || busy === 'copy'} onClick={copy}>העתקת טקסט</button>
        {t && onCreate && <button type="button" style={btn} disabled={readOnly} onClick={() => onCreate(t, item.values || {})}>לתמונה ולהורדה</button>}
        {item.status !== 'posted' && <button type="button" style={btn} disabled={readOnly} onClick={() => setEditTime((v) => !v)}>שינוי זמן</button>}
        {item.status === 'approved' && <button type="button" style={btn} disabled={readOnly || !!busy} onClick={() => setStatus('posted', 'סומן שפורסם')}>סימנתי שפורסם</button>}
        {item.status === 'approved' && <button type="button" style={btn} disabled={readOnly || !!busy} onClick={() => setStatus('planned')}>ביטול האישור</button>}
        {item.status !== 'posted' && <button type="button" style={{ ...btn, color: 'var(--ink-3)' }} disabled={readOnly || !!busy} onClick={() => setStatus('skipped')}>דילוג</button>}
      </div>
      {err && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0 }}>{err}</p>}
    </div>
  );
}

function Preferences({ initial, readOnly, toast, onSaved }) {
  const [p, setP] = useState(initial || { posting_days: [0, 2, 4], post_hour: 19, items_per_week: 3, platforms: ['instagram', 'facebook'], reminders: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const save = async () => {
    setBusy(true); setErr('');
    try { const d = await api('/api/content/plan', 'POST', { action: 'preferences', ...p }); onSaved(d.preferences); toast?.('ההגדרות נשמרו'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const chip = (on) => ({ ...btn, minHeight: 36, padding: '4px 10px', background: on ? 'var(--pc-tint)' : 'var(--surface)', borderColor: on ? 'var(--pc)' : 'var(--line-2)' });
  return (
    <div style={{ ...card, display: 'grid', gap: 10, margin: '8px 0 12px' }} data-testid="plan-prefs">
      <div>
        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, margin: '0 0 6px' }}>באילו ימים לפרסם</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS_HE.map((d, i) => <button key={i} type="button" style={chip(p.posting_days.includes(i))} onClick={() => setP({ ...p, posting_days: toggle(p.posting_days, i) })}>{d}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>שעה
          <select value={p.post_hour} onChange={(e) => setP({ ...p, post_hour: Number(e.target.value) })} style={{ display: 'block', marginTop: 4, minHeight: 40, fontFamily: 'inherit' }}>
            {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 'var(--t-sm)', fontWeight: 700 }}>כמה פוסטים בשבוע
          <select value={p.items_per_week} onChange={(e) => setP({ ...p, items_per_week: Number(e.target.value) })} style={{ display: 'block', marginTop: 4, minHeight: 40, fontFamily: 'inherit' }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.keys(PLATFORM_HE).map((k) => <button key={k} type="button" style={chip(p.platforms.includes(k))} onClick={() => setP({ ...p, platforms: toggle(p.platforms, k) })}>{PLATFORM_HE[k]}</button>)}
        <button type="button" style={chip(p.reminders)} onClick={() => setP({ ...p, reminders: !p.reminders })}>{p.reminders ? 'תזכורת בבוקר: פעילה' : 'תזכורת בבוקר: כבויה'}</button>
      </div>
      <div><button type="button" style={primary} disabled={readOnly || busy || !p.posting_days.length || !p.platforms.length} onClick={save}>{busy ? <Spinner inline label="" /> : 'שמירה'}</button></div>
      {err && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: 0 }}>{err}</p>}
    </div>
  );
}

function PublishPanel({ publish, readOnly, toast, onPages }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const pages = publish.pages || [];
  const toggle = async (p) => {
    setBusy(p.page_id); setErr('');
    try {
      const d = await api('/api/content/plan', 'POST', { action: 'publish-page', pageId: p.page_id, enabled: !p.publish_enabled });
      onPages(d.pages || []);
      toast?.(!p.publish_enabled ? 'הפרסום האוטומטי הופעל' : 'הפרסום האוטומטי כובה');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const connect = <a href="/api/facebook/oauth/start?publish=1" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>לחבר פרסום אוטומטי</a>;
  return (
    <div data-testid="publish-panel" style={{ ...card, margin: '6px 0 12px', background: 'var(--surface-2)' }}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>פרסום אוטומטי</p>
      {publish.available === false ? (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: 0 }}>עוד לא הופעל בחשבון (חסרה הרצת SQL: kalmea-sql-content-publish).</p>
      ) : (
        <>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 8px' }}>
            פוסט שאישרת יתפרסם לבד בזמן שנקבע, בעמוד הפייסבוק ובאינסטגרם העסקי שמחובר אליו. אפשר לבטל אישור עד רגע הפרסום.
          </p>
          {pages.length === 0 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{connect}<span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>צריך עמוד פייסבוק עסקי, ואינסטגרם עסקי שמחובר אליו.</span></div>}
          {pages.map((p) => {
            const can = [p.can.facebook && 'פייסבוק', p.can.instagram && 'אינסטגרם'].filter(Boolean);
            return (
              <div key={p.page_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, flex: '1 1 160px', minWidth: 0 }}>{p.page_name}{p.has_instagram ? ' + אינסטגרם' : ''}</span>
                {can.length ? (
                  <button type="button" style={{ ...btn, background: p.publish_enabled ? 'var(--pc-tint)' : 'var(--surface)', borderColor: p.publish_enabled ? 'var(--pc)' : 'var(--line-2)' }} disabled={readOnly || busy === p.page_id} onClick={() => toggle(p)}>
                    {busy === p.page_id ? <Spinner inline label="" /> : p.publish_enabled ? `פעיל (${can.join(', ')})` : 'להפעיל'}
                  </button>
                ) : (
                  <>{connect}<span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>אין עדיין הרשאת פרסום לעמוד הזה</span></>
                )}
              </div>
            );
          })}
        </>
      )}
      {err && <p role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
