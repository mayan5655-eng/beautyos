'use client';

// app/GoalsEditor.jsx
//
// Settings > My business: the monthly goals and the weekly report switch. Values live in
// settings.automations.goals / automations.weekly_report (no migration). An empty field clears that goal.

import { resolveGoals, goalsForSave } from '@/lib/goals';
import { monthlyPageOn } from '@/lib/monthlyFull';
import { tr, uiDir } from "@/lib/i18n/tr";

export default function GoalsEditor({ automations, onChange, pc, pcTint }) {
  const a = automations && typeof automations === 'object' ? automations : {};
  const goals = resolveGoals(a);
  const weekly = a.weekly_report === true;
  // The note on the 1st (app/api/send-monthly-report): ON unless she switches it off. Hidden with the platform flag.
  const monthlyShown = monthlyPageOn({ automations: a });
  const monthly = a.monthly_report !== false;
  const inp = { width: '100%', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', outline: 'none', direction: uiDir(), background: 'var(--surface-2)' };
  const setGoal = (key, raw) => {
    const next = goalsForSave({ revenue: goals.revenue, bookings: goals.bookings, [key]: raw });
    const out = { ...a };
    if (Object.keys(next).length) out.goals = next; else delete out.goals;
    onChange(out);
  };
  return (
    <div data-testid="goals-editor" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{tr("יעדים לחודש")}</p>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 10 }}>
        {tr("יעד אופציונלי. כשהוא מוגדר, ההתקדמות מופיעה במסך הבית. השאירי ריק כדי לא להציג יעד.")}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 3 }}>{tr("יעד הכנסות (₪)")}</span>
          <input type="number" min="0" inputMode="numeric" value={goals.revenue ?? ''} onChange={(e) => setGoal('revenue', e.target.value)} placeholder={tr("למשל: 15000")} style={inp} />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginBottom: 3 }}>{tr("יעד תורים")}</span>
          <input type="number" min="0" inputMode="numeric" value={goals.bookings ?? ''} onChange={(e) => setGoal('bookings', e.target.value)} placeholder={tr("למשל: 60")} style={inp} />
        </label>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer', background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
        <input type="checkbox" checked={weekly} onChange={(e) => onChange({ ...a, weekly_report: e.target.checked })} style={{ marginTop: 3, accentColor: pc }} />
        <span>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{tr("הסיכום השבועי שלי")}</span>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
            {tr("בימי ראשון אחר הצהריים: הכנסות, ביקורים, לקוחות חדשות ומי שלא הגיעה, לעומת השבוע שלפניו, ועד שלושה דברים שכדאי לעשות השבוע. נשלח רק אלייך, בהתראה באפליקציה. לא בשבת ולא בחג.")}
          </span>
        </span>
      </label>
      {monthlyShown && (
        <label data-testid="monthly-report-switch" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer', background: pcTint, borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          <input type="checkbox" checked={monthly} onChange={(e) => onChange({ ...a, monthly_report: e.target.checked })} style={{ marginTop: 3, accentColor: pc }} />
          <span>
            <span style={{ display: 'block', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{tr("הדוח החודשי שלי")}</span>
            <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
              {tr("בתחילת כל חודש: הכנסות לעומת החודש שעבר, ביקורים, לקוחות חדשות וחוזרות, הטיפולים שהכניסו הכי הרבה ומי שלא חזרה. נשלח רק אלייך, בהתראה באפליקציה. לא בשבת ולא בחג.")}
            </span>
            <a href="/dashboard/monthly" style={{ display: 'inline-block', marginTop: 4, fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 700 }}>{tr("לדוח החודשי ←")}</a>
          </span>
        </label>
      )}
    </div>
  );
}
