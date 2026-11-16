'use client';

// app/design/FacebookGroups.jsx
//
// "הקבוצות שלי" - the Facebook groups she posts in (lib/design/facebookGroups.js for why Kalmea cannot post for her).
//   mode="share"  (inside SaveShare, under a finished post): one tap on a group opens it in Facebook and copies the
//                 post text (and on a computer downloads the picture too); then "פרסמתי" marks it for this week, so
//                 the list shows where she has not posted yet first.
//   mode="manage" (the "איפה לפרסם" card): her list with add/remove; `suggestName` opens the add form with a
//                 suggested group's name filled in.
// Hidden entirely until the SQL runs (the API answers available=false) - nothing that is not live is shown.
//
// The open happens first in the tap and the copy after it: a clipboard write before window.open can use up the
// tap on Safari (see SaveShare's header), and the text also has its own copy button in the panel.

import { useEffect, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import { postedThisWeek, sortGroups, MAX_NAME, MAX_RULE } from '@/lib/design/facebookGroups';

const small = { padding: '6px 10px', minHeight: 36, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 };
const input = { width: '100%', padding: '9px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--t-sm)', fontFamily: 'inherit', boxSizing: 'border-box' };

export default function FacebookGroups({ mode = 'share', caption = '', phone = false, onOpenGroup, toast, readOnly = false, suggestName = '', onSuggestUsed }) {
  const [state, setState] = useState({ loading: true, available: false, groups: [] });
  const [opened, setOpened] = useState({}); // id -> true after she opened it in this panel
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(null); // { name, url, rule } while adding
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/facebook-groups').then((r) => r.json()).then((d) => {
      if (alive) setState({ loading: false, available: !!d?.available, groups: Array.isArray(d?.groups) ? d.groups : [] });
    }).catch(() => { if (alive) setState({ loading: false, available: false, groups: [] }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (suggestName && state.available) { setForm({ name: suggestName.slice(0, MAX_NAME), url: '', rule: '' }); setErr(''); onSuggestUsed?.(); }
  }, [suggestName, state.available]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading || !state.available) return null;

  const put = (g) => setState((s) => ({ ...s, groups: s.groups.some((x) => x.id === g.id) ? s.groups.map((x) => (x.id === g.id ? g : x)) : [...s.groups, g] }));

  const openGroup = (g) => {
    // First thing in the tap (see the header).
    window.open(g.url, '_blank', 'noopener');
    onOpenGroup?.(g);
    setOpened((o) => ({ ...o, [g.id]: true }));
    if (caption) {
      try { navigator.clipboard?.writeText(caption).then(() => toast?.('הטקסט הועתק. בקבוצה: "כתיבת פוסט" ← הדבקה'), () => {}); } catch { /* the panel has its own copy button */ }
    }
  };

  const mark = async (g, posted) => {
    setBusy(g.id);
    try {
      const r = await fetch('/api/facebook-groups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, posted }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.group) throw new Error(d?.error || 'לא הצלחנו לסמן');
      put(d.group);
    } catch (e) { toast?.(String(e.message || e), 'error'); } finally { setBusy(''); }
  };

  const remove = async (g) => {
    if (typeof window !== 'undefined' && !window.confirm(`להסיר את "${g.name}" מהקבוצות שלך?`)) return;
    setBusy(g.id);
    try {
      const r = await fetch(`/api/facebook-groups?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('לא הצלחנו להסיר');
      setState((s) => ({ ...s, groups: s.groups.filter((x) => x.id !== g.id) }));
    } catch (e) { toast?.(String(e.message || e), 'error'); } finally { setBusy(''); }
  };

  const add = async (e) => {
    e?.preventDefault?.();
    setBusy('add'); setErr('');
    try {
      const r = await fetch('/api/facebook-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.group) throw new Error(d?.error || 'לא הצלחנו לשמור');
      put(d.group); setForm(null);
      toast?.('הקבוצה נשמרה');
    } catch (e2) { setErr(String(e2.message || e2)); } finally { setBusy(''); }
  };

  const groups = sortGroups(state.groups);
  const share = mode === 'share';
  const left = groups.filter((g) => !postedThisWeek(g.last_posted_at)).length;

  return (
    <div data-testid="fb-groups" style={{ display: 'grid', gap: 8, ...(share ? { borderTop: '1px solid var(--line)', paddingTop: 12 } : {}) }}>
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="people" size={14} /> {share ? 'פרסום בקבוצות פייסבוק' : 'הקבוצות שלי'}
        {groups.length > 0 && <span style={{ fontWeight: 400, fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>{left === 0 ? 'פרסמת בכולן השבוע' : `${left} מתוך ${groups.length} עוד לא השבוע`}</span>}
      </p>

      {share && groups.length > 0 && (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          {phone
            ? 'קודם שמרי את התמונה לגלריה בכפתור למעלה. לחיצה על קבוצה מעתיקה את הטקסט ופותחת אותה בפייסבוק: "כתיבת פוסט" ← הדבקה ← הוספת התמונה מהגלריה.'
            : 'לחיצה על קבוצה מורידה את התמונה, מעתיקה את הטקסט ופותחת את הקבוצה. שם: "כתיבת פוסט" ← הדבקה ← גרירת התמונה.'}
        </p>
      )}

      {groups.length === 0 && !form && (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          שמרי פעם אחת את הקבוצות שאת מפרסמת בהן, ומכל פוסט מוכן תגיעי לכל אחת בלחיצה. בפייסבוק נכנסים לקבוצה ← שיתוף ← העתקת קישור.
        </p>
      )}

      {groups.map((g) => {
        const done = postedThisWeek(g.last_posted_at);
        return (
          <div key={g.id} data-testid="fb-group-row" style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                {g.name} {done && <span style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', fontWeight: 600 }}><Icon name="check" size={11} /> פורסם השבוע</span>}
              </p>
              {g.rule && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', margin: 0, lineHeight: 1.4 }}>{g.rule}</p>}
            </div>
            {share && <button type="button" onClick={() => openGroup(g)} style={{ ...small, background: done ? 'var(--surface)' : 'var(--pc-grad)', color: done ? 'var(--pc-deep)' : 'var(--pc-contrast)', border: done ? small.border : 'none' }}><Icon name="share" size={12} /> {done ? 'שוב' : 'לפרסם כאן'}</button>}
            {share && opened[g.id] && !done && <button type="button" onClick={() => mark(g, true)} disabled={busy === g.id} style={small}>{busy === g.id ? <Spinner inline /> : <><Icon name="check" size={12} /> פרסמתי</>}</button>}
            {!share && <a href={g.url} target="_blank" rel="noreferrer" style={{ ...small, textDecoration: 'none' }}>פתיחה</a>}
            {!share && done && <button type="button" onClick={() => mark(g, false)} disabled={busy === g.id || readOnly} style={small}>ביטול הסימון</button>}
            {!share && <button type="button" onClick={() => remove(g)} disabled={busy === g.id || readOnly} aria-label={`הסרת ${g.name}`} style={{ ...small, color: 'var(--ink-3)' }}><Icon name="trash" size={12} /></button>}
          </div>
        );
      })}

      {form ? (
        <form onSubmit={add} data-testid="fb-group-form" style={{ display: 'grid', gap: 6, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 10 }}>
          <input style={input} placeholder="שם הקבוצה" value={form.name} maxLength={MAX_NAME} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={{ ...input, direction: 'ltr', textAlign: 'left' }} placeholder="https://www.facebook.com/groups/..." inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input style={input} placeholder="חוקי הקבוצה (לא חובה), למשל: פרסום עסקי רק ביום שלישי" value={form.rule} maxLength={MAX_RULE} onChange={(e) => setForm({ ...form, rule: e.target.value })} />
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>את הקישור מעתיקים בפייסבוק: נכנסים לקבוצה ← שיתוף ← העתקת קישור.</p>
          {err && <p role="alert" style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)', margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy === 'add' || !form.name.trim() || !form.url.trim()} style={{ ...small, background: 'var(--pc-grad)', color: 'var(--pc-contrast)', border: 'none' }}>{busy === 'add' ? <Spinner inline label="שומרת" /> : 'שמירה'}</button>
            <button type="button" onClick={() => { setForm(null); setErr(''); }} style={{ ...small, background: 'none', border: 'none', color: 'var(--ink-3)' }}>ביטול</button>
          </div>
        </form>
      ) : (
        !readOnly && <button type="button" onClick={() => { setForm({ name: '', url: '', rule: '' }); setErr(''); }} data-testid="fb-group-add" style={{ ...small, justifySelf: 'start' }}><Icon name="plus" size={12} /> הוספת קבוצה</button>
      )}
    </div>
  );
}
