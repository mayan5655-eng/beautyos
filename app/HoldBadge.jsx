'use client';

// app/HoldBadge.jsx
//
// "ממתינה למקדמה · נשארו 22 דקות": a booking in deposit mode is held as pending for 30 minutes while the client pays; this label says so on the
// calendar card and in the appointment. Renders nothing for any other appointment, and nothing at all while the Grow screens are off.
import { useHold } from './useHolds';

export default function HoldBadge({ appointmentId, onDark = false }) {
  const hold = useHold(appointmentId);
  if (!hold) return null;
  const m = hold.minutesLeft;
  const left = m === 1 ? 'נשארה דקה' : `נשארו ${m} דקות`;
  return (
    <span
      data-testid="hold-badge"
      role="status"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '3px 10px', borderRadius: 'var(--r-full)',
        background: onDark ? 'rgba(255,255,255,0.92)' : 'var(--brand-tint, #FBEDE9)', color: 'var(--ink, #1F3A30)', border: '1px solid var(--line-2)',
        fontSize: 'var(--t-sm)', fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      ממתינה למקדמה · {left}
    </span>
  );
}
