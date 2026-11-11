'use client';

// app/MembershipClientCard.jsx
//
// On the client card: her membership (status, treatments left, next charge, pause / resume / cancel) or, when she has none and there is a
// plan to sell, "צירוף למנוי". Joining makes a link to the client's own page (/pay/membership/<id>), where SHE reads the terms, ticks the
// consent (its exact words are frozen) and saves her card on Grow's page. The link is handed to the cosmetician: she opens it here with the
// client beside her, or sends it from her own WhatsApp. Nothing is sent automatically. Renders NOTHING unless the flag is on and the
// server says memberships are available for this business.

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';

const dmy = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const btn = { minHeight: 44, borderRadius: 'var(--r-lg)', padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' };

export default function MembershipClientCard({ client, pc = 'var(--pc)', pcTint = 'var(--pc-tint)', pcGrad, toast }) {
  const on = clientMembershipsEnabled();
  const clientId = client?.id ? String(client.id) : '';
  const [s, setS] = useState(null);
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null); // { link, waLink }
  const [askCancel, setAskCancel] = useState(false);

  const load = useCallback(async () => {
    if (!on || !clientId) return;
    try {
      const r = await fetch(`/api/memberships?view=client&clientId=${encodeURIComponent(clientId)}`);
      const j = await r.json().catch(() => null);
      setS(r.ok && j?.success && j.available ? j : null);
    } catch { setS(null); }
  }, [on, clientId]);
  useEffect(() => { setS(null); setMade(null); setAskCancel(false); load(); }, [load]);

  if (!on || !s) return null;
  const m = s.membership && s.membership.status !== 'cancelled' ? s.membership : null;
  const plans = s.plans || [];
  if (!m && !plans.length) return null;

  const post = async (body) => {
    setBusy(true);
    try {
      const r = await fetch('/api/memberships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'משהו נתקע, נסי שוב', 'error'); return null; }
      return j;
    } finally { setBusy(false); }
  };

  const enroll = async () => {
    const j = await post({ action: 'enroll', clientId, planId: planId || plans[0]?.id });
    if (!j) return;
    setMade({ link: j.link, waLink: j.waLink, message: j.message });
    load();
  };
  const act = async (action) => {
    setAskCancel(false);
    const j = await post({ action, membershipId: m.id });
    if (j) { toast?.({ pause: 'המנוי הושהה', resume: 'המנוי חזר לפעול', cancel: 'המנוי בוטל. לא נחייב אותה יותר.' }[action]); load(); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast?.('הקישור הועתק'); } catch { toast?.('לא הצלחנו להעתיק, אפשר לסמן ולהעתיק ידנית', 'error'); } };

  const waiting = m && (m.status === 'awaiting_consent' || m.status === 'awaiting_card');
  const link = made?.link || m?.link || null;
  const chosen = plans.find((p) => p.id === (planId || plans[0]?.id));

  return (
    <div data-testid="membership-client-card" style={{ background: pcTint, borderRadius: 'var(--r-sm)', padding: '11px 12px' }}>
      {m ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontWeight: 700, color: 'var(--ink)' }}>מנוי: {m.plan?.name}</p>
            <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: m.status === 'active' ? 'var(--ink-2)' : 'var(--danger)' }}>{m.statusHe}</span>
          </div>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 2 }}>{m.planLine}</p>
          {!waiting && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', marginTop: 4 }}>{m.credits?.label}{m.status === 'active' && m.nextChargeOn ? ` · החיוב הבא ${dmy(m.nextChargeOn)}` : ''}</p>}
          {waiting && link && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6 }}>{m.status === 'awaiting_card' ? 'היא אישרה את התנאים ועוד לא סיימה לשמור כרטיס.' : 'מחכה שהיא תאשר את התנאים ותשמור כרטיס בקישור.'}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: pcGrad || pc, color: 'var(--pc-contrast)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>פתיחה כאן</a>
                <button type="button" onClick={() => copy(link)} style={{ ...btn, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>העתקת הקישור</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {(m.status === 'active' || m.status === 'past_due' || m.status === 'attention') && <button type="button" disabled={busy} onClick={() => act('pause')} style={{ ...btn, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>השהיה</button>}
            {m.status === 'paused' && <button type="button" disabled={busy} onClick={() => act('resume')} style={{ ...btn, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>חידוש</button>}
            <button type="button" data-testid="membership-client-cancel" disabled={busy} onClick={() => (askCancel ? act('cancel') : setAskCancel(true))} style={{ ...btn, fontWeight: 600, background: askCancel ? 'var(--danger)' : 'var(--surface)', color: askCancel ? '#fff' : 'var(--ink)', border: askCancel ? 'none' : '1px solid var(--line-2)' }}>{askCancel ? 'כן, לבטל' : 'ביטול המנוי'}</button>
            {askCancel && <button type="button" onClick={() => setAskCancel(false)} style={{ ...btn, fontWeight: 600, background: 'none', border: 'none', color: 'var(--ink-2)' }}>לא עכשיו</button>}
          </div>
        </>
      ) : (
        <button type="button" data-testid="membership-enroll-open" onClick={() => { setMade(null); setPlanId(plans[0]?.id || ''); setOpen(true); }} style={{ ...btn, width: '100%', background: 'var(--surface)', color: 'var(--pc-deep)', border: '1px solid var(--line-2)' }}>✦ צירוף למנוי</button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} busy={busy} title="צירוף למנוי" subtitle={client?.name || ''} zIndex={1060}>
        {!made ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              {plans.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '8px 10px', border: `1px solid ${(planId || plans[0]?.id) === p.id ? pc : 'var(--line-2)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', background: 'var(--surface)' }}>
                  <input type="radio" name="mplan" checked={(planId || plans[0]?.id) === p.id} onChange={() => setPlanId(p.id)} style={{ width: 20, height: 20 }} />
                  <span><b style={{ color: 'var(--ink)' }}>{p.name}</b><br /><span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{p.line}{p.min_months ? ` · התחייבות ${p.min_months} חודשים` : ''}</span></span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.65 }}>
              ניצור לה קישור אישי. שם היא קוראת את התנאים, מאשרת בעצמה ושומרת כרטיס בדף המאובטח של Grow. {chosen ? `החודש הראשון (₪${chosen.price}) מחויב מיד עם שמירת הכרטיס, ואחר כך פעם בחודש.` : ''} שום הודעה לא נשלחת לבד.
            </p>
            <button type="button" data-testid="membership-enroll" disabled={busy || !plans.length} onClick={enroll} style={{ ...btn, background: pcGrad || pc, color: 'var(--pc-contrast)', border: 'none' }}>{busy ? 'יוצרת...' : 'יצירת קישור הצטרפות'}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', lineHeight: 1.65 }}>הקישור מוכן ✦ אם היא כאן לידך, פתחי אותו במכשיר ותני לה לאשר ולשמור כרטיס. אפשר גם לשלוח לה אותו מהוואטסאפ שלך.</p>
            <a href={made.link} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: pcGrad || pc, color: 'var(--pc-contrast)', textDecoration: 'none', textAlign: 'center' }}>פתיחה כאן, היא לידי</a>
            {made.waLink && <a href={made.waLink} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)', textDecoration: 'none', textAlign: 'center' }}>שליחה מהוואטסאפ שלי</a>}
            <button type="button" onClick={() => copy(made.link)} style={{ ...btn, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>העתקת הקישור</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
