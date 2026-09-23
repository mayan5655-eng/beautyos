'use client';

// app/design/Archive.jsx
//
// "טקסטים ישנים": the campaigns she saved with the old generator, read
// only. Nothing she kept disappears; each post's text copies with one tap.
// New work goes through the studio, so there is no create here.

import { useEffect, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';

export default function Archive({ toast }) {
  const [campaigns, setCampaigns] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/marketing/list').then((r) => r.json()).then((d) => { if (alive) setCampaigns(Array.isArray(d?.campaigns) ? d.campaigns : []); }).catch(() => { if (alive) setCampaigns([]); });
    return () => { alive = false; };
  }, []);

  const copy = async (p) => {
    const text = [p.title, p.body, p.call_to_action, Array.isArray(p.hashtags) ? p.hashtags.join(' ') : ''].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast?.('הטקסט הועתק'); } catch { toast?.(text, 'info'); }
  };

  if (campaigns === null) return <Spinner inline label="טוענת" />;
  if (!campaigns.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <p className="serif" style={{ fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>טקסטים ישנים</p>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginBottom: 10 }}>קמפיינים ששמרת במחולל הקודם. לקריאה ולהעתקה; פוסטים חדשים נוצרים למעלה.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {campaigns.map((c) => (
          <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 12px', background: 'var(--surface)' }}>
            <button onClick={() => setOpen(open === c.id ? null : c.id)} style={{ width: '100%', textAlign: 'right', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{c.name || 'קמפיין'} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {(c.posts || []).length} פוסטים · {new Date(c.created_at).toLocaleDateString('he-IL')}</span></span>
              <Icon name={open === c.id ? 'chevron-up' : 'chevron-down'} size={14} />
            </button>
            {open === c.id && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {(c.posts || []).map((p) => (
                  <div key={p.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    {p.title && <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{p.title}</p>}
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{p.body}</p>
                    {p.call_to_action && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--pc-deep)', fontWeight: 600, marginTop: 4 }}>{p.call_to_action}</p>}
                    {Array.isArray(p.hashtags) && p.hashtags.length > 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 4 }}>{p.hashtags.join(' ')}</p>}
                    <button onClick={() => copy(p)} style={{ marginTop: 6, padding: '5px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}><Icon name="copy" size={12} /> העתקה</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
