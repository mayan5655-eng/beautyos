'use client';

// app/IntakeBadge.jsx
//
// "חסר טופס" / "טופס מולא" / "בדיקת רגישות נדרשת" on the calendar card (lib/intakeGate.ts). Renders nothing for a service
// without the gate, which is every service until she turns it on.
import { useIntakeBadges, useIntakeQueueSync } from './useIntake';

const TONE = {
  form_missing: { bg: 'var(--brand-tint, #FBEDE9)', fg: 'var(--ink, #1F3A30)' },
  form_done: { bg: 'var(--k-sage, #DCE4D5)', fg: 'var(--ink, #1F3A30)' },
  patch_test: { bg: 'var(--brand-tint, #FBEDE9)', fg: 'var(--ink, #1F3A30)' },
};

export default function IntakeBadge({ appointmentId }) {
  const badges = useIntakeBadges(appointmentId);
  if (!badges.length) return null;
  return (
    <span data-testid="intake-badges" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {badges.map((b) => {
        const t = TONE[b.kind] || TONE.form_missing;
        return (
          <span key={b.kind} data-testid={`intake-badge-${b.kind}`} role="status" style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 'var(--r-full)', background: t.bg, color: t.fg,
            border: '1px solid var(--line-2)', fontSize: 'var(--t-xs)', fontWeight: 700, whiteSpace: 'nowrap',
          }}>{b.label}</span>
        );
      })}
    </span>
  );
}

/** Rendered once on her home screen: fills her manual send queue with "send the form" for the next days (app/useIntake.js). */
export function IntakeQueueSync({ onQueued }) {
  useIntakeQueueSync(onQueued);
  return null;
}
