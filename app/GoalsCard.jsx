'use client';

// app/GoalsCard.jsx
//
// This month's goals on the home screen: a quiet progress line per goal (revenue, bookings), with where she
// stands against the calendar. Shown only when she has set a goal; without one it is a single small link, because
// a bar stuck at 0% on a day-one account is noise.
//
// Her colours, not Kalmea's chrome: the bar uses the tenant accent passed in as `accent`.

import { goalProgress, pace, PACE_LABEL } from '@/lib/goals';

const money = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;

function Row({ label, p, value, target, accent, pctLabel }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: '#5C6B63' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{value} <span style={{ fontWeight: 400, color: '#8CA096' }}>מתוך {target}</span></span>
      </div>
      <div style={{ background: 'var(--line)', borderRadius: 999, height: 8, marginTop: 5, overflow: 'hidden' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label={label}>
        <div style={{ background: accent, height: 8, width: `${Math.max(p.pct > 0 ? 3 : 0, p.pct)}%`, borderRadius: 999 }} />
      </div>
      <p style={{ fontSize: 12, color: '#8CA096', marginTop: 3 }}>{pctLabel}</p>
    </div>
  );
}

export default function GoalsCard({ goals, revenue, bookings, now, accent, onSetGoals }) {
  const rev = goalProgress(revenue, goals.revenue);
  const bok = goalProgress(bookings, goals.bookings);
  if (!rev && !bok) {
    return (
      <div style={{ maxWidth: 1180, marginInline: 'auto', marginBottom: 12, textAlign: 'start' }}>
        <button type="button" onClick={onSetGoals} style={{ background: 'none', border: 'none', color: '#8CA096', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
          להגדיר יעד חודשי
        </button>
      </div>
    );
  }
  const status = (p) => (p.reached ? 'היעד הושג' : `${p.pct}% · ${PACE_LABEL[pace(p, now)]}`);
  return (
    <div className="glass-card card-boxed" data-testid="goals-card" style={{ padding: '14px 17px', marginBottom: 12, maxWidth: 1180, marginInline: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 12.5, color: '#8CA096' }}>היעדים של החודש</p>
        <button type="button" onClick={onSetGoals} style={{ background: 'none', border: 'none', color: '#8CA096', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>עריכה</button>
      </div>
      {rev && <Row label="הכנסות" p={rev} value={money(rev.actual)} target={money(rev.target)} accent={accent} pctLabel={status(rev)} />}
      {bok && <Row label="תורים" p={bok} value={String(bok.actual)} target={String(bok.target)} accent={accent} pctLabel={status(bok)} />}
    </div>
  );
}
