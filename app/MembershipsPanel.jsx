'use client';

// app/MembershipsPanel.jsx
//
// The till's "מנויים" tab (lib/memberships.ts): her numbers (active members, monthly recurring income, charges that did not go
// through), the memberships she sells, and every member with what she can do (pause, resume, cancel, try a failed charge again).
// Renders NOTHING unless NEXT_PUBLIC_CLIENT_MEMBERSHIPS is on AND the server says memberships are available for her (Grow connected,
// saved-card credentials configured, the migration run). onAvailable tells the till whether to show the tab at all.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';

const money = (n) => `₪${(Math.round(Number(n) * 100) / 100).toLocaleString('he-IL')}`;
const dmy = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', boxShadow: 'var(--shadow-xs)', marginBottom: 12 };
const label = { display: 'block', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 };
const input = { width: '100%', minHeight: 44, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' };
const EMPTY = { name: '', price: '', credits: 2, rollover: false, min_months: 0, services: [] };

export default function MembershipsPanel({ services = [], pc = 'var(--pc)', pcTint = 'var(--pc-tint)', pcGrad, toast, onAvailable }) {
  const on = clientMembershipsEnabled();
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null); // null | { planId?, ...fields }
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // { id, action }
  const [showEnded, setShowEnded] = useState(false);

  const load = useCallback(async () => {
    if (!on) return;
    try {
      const r = await fetch('/api/memberships?view=dashboard');
      const j = await r.json().catch(() => null);
      setS(r.ok && j?.success && j.available ? j : { available: false });
    } catch { setS({ available: false }); }
  }, [on]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { onAvailable?.(!!s?.available); }, [s?.available]); // eslint-disable-line react-hooks/exhaustive-deps

  const serviceNames = useMemo(() => [...new Set((services || []).filter((sv) => sv && sv.active !== false).map((sv) => String(sv.name || '').trim()).filter(Boolean))], [services]);
  const members = s?.members || [];
  const live = members.filter((m) => m.status !== 'cancelled');
  const ended = members.filter((m) => m.status === 'cancelled');

  if (!on || !s?.available) return null;

  const post = async (body, key) => {
    setBusy(key);
    try {
      const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'משהו נתקע, נסי שוב', 'error'); return null; }
      return j;
    } finally { setBusy(''); }
  };

  const savePlan = async () => {
    const j = await post({ action: 'save-plan', planId: form.planId || undefined, plan: { ...form, price: Number(form.price), credits: Number(form.credits), min_months: Number(form.min_months) || 0 } }, 'plan');
    if (!j) return;
    toast?.(form.planId ? 'המנוי עודכן. מי שכבר הצטרפה ממשיכה בתנאים שאישרה ✦' : 'המנוי נשמר ✦');
    setForm(null); load();
  };
  const togglePlan = async (p) => { if (await post({ action: 'plan-active', planId: p.id, active: !p.active }, `plan:${p.id}`)) load(); };

  const act = async (m, action) => {
    setConfirm(null);
    const j = await post({ action, membershipId: m.id }, `${action}:${m.id}`);
    if (!j) return;
    const charged = j.charge === 'paid' ? ' החיוב עבר ✓' : j.charge === 'failed' ? ' החיוב לא עבר.' : j.charge === 'unknown' ? ' לא הצלחנו לוודא את החיוב, בדקי ב-Grow.' : '';
    toast?.({ pause: 'המנוי הושהה. לא נחייב עד שתחזירי אותו.', resume: 'המנוי חזר לפעול.', cancel: 'המנוי בוטל. לא נחייב אותה יותר.', retry: 'ניסינו לחייב שוב.' }[action] + charged, j.charge === 'failed' || j.charge === 'unknown' ? 'error' : undefined);
    load();
  };

  const st = s.stats || {};
  const stat = (title, value, tone) => (
    <div style={{ flex: '1 1 140px', background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
      <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600 }}>{title}</p>
      <p style={{ fontFamily: 'var(--font-display, inherit)', fontSize: 'var(--t-xl, 22px)', fontWeight: 700, color: tone || 'var(--ink)' }}>{value}</p>
    </div>
  );

  return (
    <div data-testid="memberships-panel">
      <div style={box}>
        <p style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>המנויים שלך</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stat('מנויות פעילות', st.active || 0)}
          {stat('הכנסה חודשית קבועה', money(st.mrr || 0))}
          {stat('חיובים שלא עברו', st.failedCharges || 0, st.failedCharges ? 'var(--danger)' : undefined)}
          {stat('נגבה החודש', money(st.collectedThisMonth || 0))}
        </div>
        {(st.waiting > 0 || st.paused > 0) && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 8 }}>{[st.waiting ? `${st.waiting} ממתינות להצטרפות` : '', st.paused ? `${st.paused} מושהות` : ''].filter(Boolean).join(' · ')}</p>}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <p style={{ fontWeight: 700, color: 'var(--ink)' }}>מה את מוכרת</p>
          {!form && <button type="button" data-testid="membership-plan-new" onClick={() => setForm({ ...EMPTY })} style={{ minHeight: 40, background: pcGrad || pc, color: 'var(--pc-contrast)', border: 'none', borderRadius: 'var(--r-lg)', padding: '8px 14px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>+ מנוי חדש</button>}
        </div>
        {!s.plans?.length && !form && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>עוד לא הגדרת מנוי. למשל "מניקור קבוע: 2 טיפולים בחודש ב-₪260". הלקוחה משלמת כל חודש בכרטיס ששמרה, ובקופה רואים כמה טיפולים נשארו לה.</p>}
        {(s.plans || []).map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid var(--line)', opacity: p.active ? 1 : 0.6 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.name}</p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{p.line}{p.rollover ? ' · טיפול שלא נוצל עובר חודש' : ''}{p.min_months ? ` · התחייבות ${p.min_months} חודשים` : ''}{p.services?.length ? ` · ${p.services.join(', ')}` : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => setForm({ planId: p.id, name: p.name, price: p.price, credits: p.credits, rollover: p.rollover, min_months: p.min_months, services: p.services || [] })} style={{ minHeight: 40, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', padding: '6px 12px', fontFamily: 'inherit', color: 'var(--ink)', cursor: 'pointer' }}>עריכה</button>
              <button type="button" disabled={busy === `plan:${p.id}`} onClick={() => togglePlan(p)} style={{ minHeight: 40, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', padding: '6px 12px', fontFamily: 'inherit', color: 'var(--ink)', cursor: 'pointer' }}>{p.active ? 'הפסקת מכירה' : 'חידוש מכירה'}</button>
            </div>
          </div>
        ))}
        {form && (
          <div data-testid="membership-plan-form" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 10 }}>
            <div><label style={label} htmlFor="mp-name">שם המנוי</label><input id="mp-name" style={input} maxLength={60} value={form.name} placeholder="מניקור קבוע" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><label style={label} htmlFor="mp-price">מחיר לחודש (₪)</label><input id="mp-price" style={input} type="number" inputMode="decimal" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label style={label} htmlFor="mp-credits">טיפולים בחודש</label><input id="mp-credits" style={input} type="number" inputMode="numeric" min={1} max={31} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></div>
            </div>
            <div><label style={label} htmlFor="mp-min">התחייבות מינימלית (חודשים, 0 = בלי)</label><input id="mp-min" style={input} type="number" inputMode="numeric" min={0} max={24} value={form.min_months} onChange={(e) => setForm({ ...form, min_months: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', color: 'var(--ink)', fontSize: 'var(--t-sm)' }}>
              <input type="checkbox" checked={!!form.rollover} onChange={(e) => setForm({ ...form, rollover: e.target.checked })} style={{ width: 20, height: 20 }} />
              <span>טיפול שלא נוצל עובר לחודש הבא (לחודש אחד בלבד)</span>
            </label>
            {serviceNames.length > 0 && (
              <div>
                <p style={label}>על אילו טיפולים המנוי חל? (בלי בחירה: כל טיפול)</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {serviceNames.map((n) => {
                    const sel = form.services.includes(n);
                    return <button key={n} type="button" aria-pressed={sel} onClick={() => setForm({ ...form, services: sel ? form.services.filter((x) => x !== n) : [...form.services, n] })} style={{ minHeight: 36, borderRadius: 'var(--r-lg)', padding: '5px 12px', fontFamily: 'inherit', cursor: 'pointer', border: sel ? 'none' : '1px solid var(--line-2)', background: sel ? pcGrad || pc : 'var(--surface)', color: sel ? 'var(--pc-contrast)' : 'var(--ink)', fontSize: 'var(--t-sm)' }}>{n}</button>;
                  })}
                </div>
              </div>
            )}
            {form.planId && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)' }}>שינוי חל רק על הצטרפויות חדשות. מי שכבר במנוי ממשיכה בדיוק בתנאים שאישרה.</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" data-testid="membership-plan-save" disabled={busy === 'plan'} onClick={savePlan} style={{ flex: 2, minHeight: 44, background: pcGrad || pc, color: 'var(--pc-contrast)', border: 'none', borderRadius: 'var(--r-lg)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>{busy === 'plan' ? 'שומרת...' : 'שמירה'}</button>
              <button type="button" onClick={() => setForm(null)} style={{ flex: 1, minHeight: 44, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', fontFamily: 'inherit', color: 'var(--ink)', cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      <div style={box}>
        <p style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>המנויות</p>
        {!live.length && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>עוד אין מנויות. מצרפים לקוחה מהכרטיס שלה, בכפתור "צירוף למנוי".</p>}
        {[...live, ...(showEnded ? ended : [])].map((m) => {
          const alert = m.status === 'past_due' || m.status === 'attention' || (m.status === 'paused' && m.pauseReason !== 'owner');
          const ask = confirm && confirm.id === m.id ? confirm.action : null;
          const btn = (action, text) => <button type="button" key={action} data-testid={`membership-${action}`} disabled={!!busy} onClick={() => (action === 'cancel' || action === 'retry') && ask !== action ? setConfirm({ id: m.id, action }) : act(m, action)} style={{ minHeight: 40, background: ask === action ? 'var(--danger)' : 'var(--surface)', color: ask === action ? '#fff' : 'var(--ink)', border: ask === action ? 'none' : '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', padding: '6px 12px', fontFamily: 'inherit', cursor: 'pointer', fontSize: 'var(--t-sm)' }}>{ask === action ? (action === 'cancel' ? 'כן, לבטל' : 'בדקתי, לנסות שוב') : text}</button>;
          return (
            <div key={m.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <p style={{ fontWeight: 700, color: 'var(--ink)' }}>{m.clientName || 'לקוחה'}</p>
                <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: alert ? 'var(--danger)' : 'var(--ink-2)' }}>{m.statusHe}</span>
              </div>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{m.plan?.name} · {m.planLine}</p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
                {[m.credits?.available > 0 || m.status === 'active' ? m.credits?.label : '', m.status === 'active' && m.nextChargeOn ? `החיוב הבא ${dmy(m.nextChargeOn)}` : '', m.status === 'past_due' && m.nextRetryOn ? `ניסיון חוזר ${dmy(m.nextRetryOn)}` : ''].filter(Boolean).join(' · ')}
              </p>
              {m.status === 'attention' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 4 }}>לא הצלחנו לוודא אם החיוב האחרון עבר. בדקי ב-Grow לפני ניסיון נוסף, כדי שלא תחויב פעמיים.</p>}
              {m.status === 'paused' && m.pauseReason !== 'owner' && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)', marginTop: 4 }}>החיוב לא עבר{m.pauseReason === 'card_refused' ? ' והכרטיס סורב' : ' כמה פעמים'}. לא נחייב שוב עד שתחליטי.</p>}
              {ask && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 4 }}>{ask === 'cancel' ? 'אחרי ביטול לא נחייב אותה יותר. הטיפולים ששולמו נשארים לה עד סוף החודש.' : 'ננסה לחייב את הכרטיס השמור עכשיו.'}</p>}
              {m.status !== 'cancelled' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {(m.status === 'active' || m.status === 'past_due' || m.status === 'attention') && btn('pause', 'השהיה')}
                  {m.status === 'paused' && btn('resume', 'חידוש')}
                  {(m.status === 'past_due' || m.status === 'attention') && btn('retry', 'ניסיון חיוב עכשיו')}
                  {btn('cancel', 'ביטול המנוי')}
                  {ask && <button type="button" onClick={() => setConfirm(null)} style={{ minHeight: 40, background: 'none', border: 'none', color: 'var(--ink-2)', fontFamily: 'inherit', cursor: 'pointer' }}>לא עכשיו</button>}
                </div>
              )}
            </div>
          );
        })}
        {ended.length > 0 && <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ minHeight: 40, background: 'none', border: 'none', color: 'var(--pc-deep)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>{showEnded ? 'הסתרת מנויים שבוטלו' : `מנויים שבוטלו (${ended.length})`}</button>}
      </div>
    </div>
  );
}
