'use client';

// app/LeadSourcesEditor.jsx
//
// Settings > Clients and leads: the list of places her leads come from, as she names them. The list is what the
// "new lead" form offers. Removing a name here never touches leads that already carry it - the report groups by
// what each lead stores - so the note says so, because "delete" otherwise sounds destructive.

import { useState } from 'react';
import { cleanSourceName, MAX_LEAD_SOURCES, DEFAULT_LEAD_SOURCES } from '@/lib/leadSources';

export default function LeadSourcesEditor({ sources, onChange, pc, pcTint }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(sources) ? sources : [];
  const add = () => {
    const name = cleanSourceName(draft);
    if (!name) return;
    if (list.some((s) => s.toLowerCase() === name.toLowerCase())) { setDraft(''); return; }
    if (list.length >= MAX_LEAD_SOURCES) return;
    onChange([...list, name]);
    setDraft('');
  };
  const full = list.length >= MAX_LEAD_SOURCES;
  const addOff = !cleanSourceName(draft) || full;
  const isDefault = list.length === DEFAULT_LEAD_SOURCES.length && list.every((s, i) => s === DEFAULT_LEAD_SOURCES[i]);
  return (
    <div data-testid="lead-sources-editor" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>מאיפה מגיעות הפניות</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 10 }}>
        הרשימה הזו מופיעה כשאת מוסיפה פנייה ידנית, והיא הבסיס לדוח &quot;הכנסות לפי מקור&quot;. אפשר להוסיף מקורות משלך (תערוכה, קופון, שיתוף פעולה).
        הסרת מקור מהרשימה לא משנה פניות שכבר נרשמו איתו.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {list.map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: pcTint, border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '5px 8px 5px 12px', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
            {s}
            <button type="button" onClick={() => onChange(list.filter((x) => x !== s))} aria-label={`הסרת ${s}`} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 'var(--t-sm)', padding: '0 2px' }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="למשל: תערוכת כלות"
          aria-label="שם מקור חדש"
          maxLength={30}
          style={{ flex: 1, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: 'rtl', background: 'var(--surface-2)' }}
        />
        <button type="button" onClick={add} disabled={addOff} style={{ background: pcTint, border: `1px dashed ${pc}`, borderRadius: 'var(--r-sm)', padding: '0 14px', fontSize: 'var(--t-sm)', color: pc, cursor: addOff ? 'not-allowed' : 'pointer', opacity: addOff ? 0.55 : 1, fontFamily: 'inherit', fontWeight: 700 }}>הוספה</button>
      </div>
      {full && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 6 }}>אפשר עד {MAX_LEAD_SOURCES} מקורות. כדי להוסיף חדש, הסירי אחד מהרשימה.</p>}
      {!isDefault && (
        <button type="button" onClick={() => onChange([...DEFAULT_LEAD_SOURCES])} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>חזרה לרשימה המקורית</button>
      )}
    </div>
  );
}
