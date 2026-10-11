'use client';

// app/GoalsEditor.jsx
//
// Settings > My business: the monthly goals and the weekly report switch. Values live in
// settings.automations.goals / automations.weekly_report (no migration). An empty field clears that goal.

import { resolveGoals, goalsForSave } from '@/lib/goals';

export default function GoalsEditor({ automations, onChange, pc, pcTint }) {
  const a = automations && typeof automations === 'object' ? automations : {};
  const goals = resolveGoals(a);
  const weekly = a.weekly_report === true;
  const inp = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: 'rtl', background: 'var(--surface-2)' };
  const setGoal = (key, raw) => {
    const next = goalsForSave({ revenue: goals.revenue, bookings: goals.bookings, [key]: raw });
    const out = { ...a };
    if (Object.keys(next).length) out.goals = next; else delete out.goals;
    onChange(out);
  };
  return (
    <div data-testid="goals-editor" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>יעדים לחודש</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 10 }}>
        יעד אופציונלי. כשהוא מוגדר, ההתקדמות מופיעה במסך הבית. השאירי ריק כדי לא להציג יעד.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 3 }}>יעד הכנסות (₪)</span>
          <input type="number" min="0" inputMode="numeric" value={goals.revenue ?? ''} onChange={(e) => setGoal('revenue', e.target.value)} placeholder="למשל: 15000" style={inp} />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 3 }}>יעד תורים</span>
          <input type="number" min="0" inputMode="numeric" value={goals.bookings ?? ''} onChange={(e) => setGoal('bookings', e.target.value)} placeholder="למשל: 60" style={inp} />
        </label>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer', background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
        <input type="checkbox" checked={weekly} onChange={(e) => onChange({ ...a, weekly_report: e.target.checked })} style={{ marginTop: 3, accentColor: pc }} />
        <span>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>דוח שבועי אליי</span>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
            בימי ראשון אחר הצהריים: הכנסות השבוע, תורים, פניות חדשות והתקדמות ליעד. נשלח רק אלייך, בהתראה באפליקציה.
          </span>
        </span>
      </label>
    </div>
  );
}
