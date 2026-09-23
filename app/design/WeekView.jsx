'use client';

// app/design/WeekView.jsx
//
// The content door's first screen: "מה מפרסמים השבוע". Posts the app
// proposes from what it knows (an occasion in its window, a quiet day in
// her calendar, a treatment she never posted about, a saved review, the
// week's tip), each already drawn in her branding and one tap from the
// editor. Under them: what to film this week (the planning agent), and
// where to publish (the Facebook groups helper).

import { useMemo, useState } from 'react';
import Icon from '../Icon';
import Spinner from '../Spinner';
import DomPreview from './DomPreview';
import { getTemplate, TEMPLATES } from '@/lib/design/templates';
import { fillTemplate } from '@/lib/design/mapBranding';
import { suggestPosts } from '@/lib/design/suggestions';

const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 14px' };
const btn = { padding: '9px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--pc-deep)', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 };

/** occasion key -> the newest feed template that carries it. */
function holidayTemplates() {
  const out = {};
  for (const t of TEMPLATES) if (t.holiday && t.format === 'feed45' && (!out[t.holiday] || t.version > getTemplate(out[t.holiday]).version)) out[t.holiday] = t.key;
  return out;
}

export default function WeekView({ settings, appointments, services, designs, readOnly, creating, onCreate, onReel, toast }) {
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const suggestions = useMemo(() => {
    try {
      return suggestPosts({ appointments, services, designs, reviews: Array.isArray(branding.reviews) ? branding.reviews : [], holidayTemplates: holidayTemplates() });
    } catch { return []; }
  }, [appointments, services, designs, branding.reviews]);

  const [shoot, setShoot] = useState(null); // { week_note, ideas }
  const [shootBusy, setShootBusy] = useState(false);
  const [groups, setGroups] = useState(null);
  const [groupsBusy, setGroupsBusy] = useState(false);
  const [error, setError] = useState('');

  const loadShoot = async () => {
    setShootBusy(true); setError('');
    try {
      const res = await fetch('/api/marketing/shooting-list', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.ideas)) throw new Error(data?.error || 'לא הצלחנו להכין רשימה');
      setShoot(data);
    } catch (e) { setError(String(e.message || e)); } finally { setShootBusy(false); }
  };
  const loadGroups = async () => {
    setGroupsBusy(true); setError('');
    try {
      const res = await fetch('/api/marketing/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 8 }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.groups)) throw new Error(data?.error || 'לא הצלחנו להציע קבוצות');
      setGroups(data.groups);
    } catch (e) { setError(String(e.message || e)); } finally { setGroupsBusy(false); }
  };

  return (
    <>
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
        <p className="serif" style={{ fontSize: 'var(--t-xl)', fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>מה מפרסמים השבוע</p>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 }}>פוסטים שכבר מוכנים בצבעים שלך, לפי החגים, היומן והטיפולים שלך. תבחרי אחד, תשני מילה, תורידי.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {suggestions.map((s) => {
            const t = getTemplate(s.templateKey);
            if (!t) return null;
            const blocked = t.category === 'review' && !(Array.isArray(branding.reviews) && branding.reviews.length);
            const fill = fillTemplate(t, { settings, inputs: s.values });
            return (
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                {s.upcoming && <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, background: 'var(--pc)', color: 'var(--pc-contrast)', fontSize: 'var(--t-xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)' }}>{s.upcoming.daysLeft <= 0 ? 'עכשיו' : s.upcoming.daysLeft === 1 ? 'מחר' : `בעוד ${s.upcoming.daysLeft} ימים`}</span>}
                <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-xs)', aspectRatio: '4 / 5', background: 'var(--surface-2)' }}>
                  <DomPreview template={t} fill={fill} width={150} style={{ width: '100%', height: 'auto', aspectRatio: '4 / 5' }} />
                </div>
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.45 }}>{s.reason}</p>
                <button onClick={() => onCreate(t, s.values)} disabled={blocked || readOnly || creating === t.key} className="primary-btn" style={{ padding: '9px 0', background: 'var(--pc-grad)', color: 'var(--pc-contrast)', fontSize: 'var(--t-sm)', opacity: blocked || readOnly ? 0.5 : 1 }}>
                  {creating === t.key ? <Spinner inline label="פותחת" /> : 'לפתוח ולערוך'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={card}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}><Icon name="camera" size={14} /> מה לצלם השבוע</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>3 עד 5 רעיונות של עשר דקות בקליניקה, לפי השירותים והיומן שלך. כל רעיון יכול להפוך לרילס.</p>
          {!shoot && <button onClick={loadShoot} disabled={shootBusy || readOnly} style={btn}>{shootBusy ? <Spinner inline label="חושבת" /> : 'תני לי רעיונות'}</button>}
          {shoot && (
            <div style={{ display: 'grid', gap: 8 }}>
              {shoot.week_note && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--pc-deep)', fontWeight: 600 }}>{shoot.week_note}</p>}
              {shoot.ideas.map((idea, i) => (
                <div key={i} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{idea.title}</p>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5 }}>{idea.brief}{idea.film_day ? ` · ${idea.film_day}` : ''}{idea.minutes ? ` · ${idea.minutes} דק'` : ''}</p>
                  <button onClick={() => onReel(`${idea.title}${idea.brief ? ` — ${idea.brief}` : ''}`)} style={{ ...btn, minHeight: 32, padding: '4px 10px', marginTop: 4, fontSize: 'var(--t-xs)' }}><Icon name="film" size={12} /> להפוך לרילס</button>
                </div>
              ))}
              <button onClick={loadShoot} disabled={shootBusy} style={{ ...btn, minHeight: 32, padding: '4px 10px', fontSize: 'var(--t-xs)', alignSelf: 'flex-start' }}>{shootBusy ? <Spinner inline label="חושבת" /> : 'רעיונות אחרים'}</button>
            </div>
          )}
        </div>
        <div style={card}>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}><Icon name="people" size={14} /> איפה לפרסם</p>
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>קבוצות פייסבוק שכדאי להצטרף אליהן ולפרסם בהן, לפי האזור והשירותים שלך.</p>
          {!groups && <button onClick={loadGroups} disabled={groupsBusy || readOnly} style={btn}>{groupsBusy ? <Spinner inline label="מחפשת" /> : 'הציעי לי קבוצות'}</button>}
          {groups && groups.length === 0 && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>לא נמצאו קבוצות מתאימות הפעם.</p>}
          {groups && groups.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {groups.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink)' }}>{g.name} <span style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', fontWeight: 400 }}>{g.category}</span></p>
                    <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.4 }}>{g.reasoning}</p>
                  </div>
                  <a href={`https://www.facebook.com/search/groups/?q=${encodeURIComponent(g.name)}`} target="_blank" rel="noreferrer" style={{ ...btn, minHeight: 32, padding: '4px 10px', fontSize: 'var(--t-xs)', textDecoration: 'none', flexShrink: 0 }}>לחיפוש</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
      {toast ? null : null}
    </>
  );
}
