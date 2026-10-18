'use client';

// app/CancelPolicyCard.jsx
//
// Settings > connections > Grow card, shown only while she is connected to Grow: her cancellation policy.
//   off          nothing changes (the booking page and the cancel link behave as before)
//   saved_card   the client saves a card when booking (no charge); a late cancel or no-show becomes a question she answers with one tap
//   deposit      the client pays a deposit when booking; it is deducted at the cashier, kept, or returned
// Saved through /api/grow/policy into its own table, so the dashboard's whole-settings save can never overwrite it.

import { useCallback, useEffect, useState } from 'react';
import { defaultPolicyText, describeFee } from '@/lib/cancellationPolicy';

const MODES = [
  { k: 'off', l: 'כבויה' },
  { k: 'saved_card', l: 'שמירת כרטיס אשראי, חיוב רק באישור שלי' },
  { k: 'deposit', l: 'מקדמה בקביעת התור' },
];

function FeeInput({ label, spec, onChange, ids }) {
  const inp = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44, width: 84, direction: 'ltr' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', minWidth: 110 }}>{label}</span>
      <input aria-label={label} data-testid={ids} inputMode="decimal" value={spec.value} onChange={(e) => onChange({ ...spec, value: e.target.value.replace(/[^\d.]/g, '') })} style={inp} />
      <span style={{ display: 'inline-flex', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {[['fixed', '₪'], ['percent', '%']].map(([t, sym]) => (
          <button key={t} type="button" aria-pressed={spec.type === t} onClick={() => onChange({ ...spec, type: t })} style={{ minWidth: 44, minHeight: 44, border: 'none', background: spec.type === t ? 'var(--ink)' : 'var(--surface)', color: spec.type === t ? 'var(--surface)' : 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{sym}</button>
        ))}
      </span>
    </div>
  );
}

export default function CancelPolicyCard({ pc, pcTint, toast, isDemo }) {
  const [state, setState] = useState(null);
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/grow/policy');
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { setState({ hidden: true }); return; }
      setState(j);
      setP({ ...j.policy, lateFee: { ...j.policy.lateFee, value: String(j.policy.lateFee.value) }, noShowFee: { ...j.policy.noShowFee, value: String(j.policy.noShowFee.value) }, deposit: { ...j.policy.deposit, value: String(j.policy.deposit.value) } });
    } catch { setState({ hidden: true }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!state || state.hidden || !state.connected || !p) return null;

  const set = (patch) => { setP((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const numeric = (spec) => ({ ...spec, value: Number(spec.value) || 0 });
  const payload = () => ({ ...p, lateFee: numeric(p.lateFee), noShowFee: numeric(p.noShowFee), deposit: numeric(p.deposit), windowHours: Number(p.windowHours) || 0 });

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/grow/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy: payload() }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) { toast?.(j?.error || 'השמירה נכשלה, נסי שוב', 'error'); return; }
      toast?.('מדיניות הביטולים נשמרה');
      setDirty(false);
      await load();
    } finally { setBusy(false); }
  };

  const resetText = () => { const q = payload(); set({ text: defaultPolicyText(q) }); };

  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginTop: 12 };
  const lbl = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)' };
  const inp = { border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--t-md)', fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 };
  const ghost = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };
  const primary = { background: pcTint, border: `1px dashed ${pc}`, borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--pc-text, var(--ink))', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 };

  return (
    <div data-testid="cancel-policy-card" style={box}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>מדיניות ביטולים</p>
      {state.tableReady === false ? (
        <p style={lbl}>מדיניות ביטולים עוד לא הופעלה בחשבון. נעדכן כשהיא זמינה.</p>
      ) : (
        <>
          <p style={{ ...lbl, lineHeight: 1.7, marginBottom: 10 }}>אפשר להגן על התורים שלך בדמי ביטול או במקדמה. הלקוחה מאשרת את המדיניות כשהיא קובעת תור, ואת מחליטה בכל מקרה אם לגבות.</p>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={lbl}>מצב</span>
            <select aria-label="מצב מדיניות ביטולים" data-testid="policy-mode" value={p.mode} onChange={(e) => set({ mode: e.target.value })} style={{ ...inp, display: 'block', width: '100%', marginTop: 4 }}>
              {MODES.map((m) => <option key={m.k} value={m.k}>{m.l}</option>)}
            </select>
          </label>

          {p.mode !== 'off' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', minWidth: 110 }}>ביטול חינם עד</span>
                <input aria-label="שעות לפני התור" data-testid="policy-window" inputMode="numeric" value={p.windowHours} onChange={(e) => set({ windowHours: e.target.value.replace(/\D/g, '') })} style={{ ...inp, width: 84, direction: 'ltr' }} />
                <span style={lbl}>שעות לפני התור</span>
              </label>

              {p.mode === 'saved_card' && (
                <>
                  <FeeInput label="ביטול מאוחר" ids="policy-late" spec={p.lateFee} onChange={(v) => set({ lateFee: v })} />
                  <FeeInput label="אי הגעה" ids="policy-noshow" spec={p.noShowFee} onChange={(v) => set({ noShowFee: v })} />
                </>
              )}
              {p.mode === 'deposit' && (
                <>
                  <FeeInput label="מקדמה" ids="policy-deposit" spec={p.deposit} onChange={(v) => set({ deposit: v })} />
                  <div style={{ marginBottom: 10 }}>
                    <span style={lbl}>ביטול בזמן: מה קורה למקדמה</span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {[['refund', 'מחזירים ללקוחה בכרטיס'], ['credit', 'נשמרת כקרדיט לתור הבא']].map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={p.timelyCancel === k} onClick={() => set({ timelyCancel: k })} style={{ ...ghost, background: p.timelyCancel === k ? 'var(--ink)' : 'var(--surface)', color: p.timelyCancel === k ? 'var(--surface)' : 'var(--ink)' }}>{l}</button>
                      ))}
                    </div>
                    <p style={{ ...lbl, marginTop: 6 }}>ביטול מאוחר או אי הגעה: המקדמה נשארת אצלך. כשאת מבטלת בעצמך, היא חוזרת ללקוחה.</p>
                  </div>
                </>
              )}

              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={lbl}>הנוסח שהלקוחה רואה ומאשרת</span>
                <textarea aria-label="נוסח המדיניות" data-testid="policy-text" rows={6} maxLength={1200} value={p.text} onChange={(e) => set({ text: e.target.value })} style={{ ...inp, display: 'block', width: '100%', marginTop: 4, lineHeight: 1.6, resize: 'vertical' }} />
              </label>
              <button type="button" style={{ ...ghost, marginBottom: 10 }} onClick={resetText}>נוסח ברירת מחדל לפי המספרים</button>
              {p.mode === 'saved_card' && <p style={{ ...lbl, marginBottom: 8 }}>למשל: ביטול מאוחר {describeFee(numeric(p.lateFee))}, אי הגעה {describeFee(numeric(p.noShowFee))}.</p>}
            </>
          )}

          {!isDemo && <button type="button" style={primary} disabled={busy || !dirty} onClick={save}>{busy ? 'שומרת…' : 'שמירת המדיניות'}</button>}
        </>
      )}
    </div>
  );
}
