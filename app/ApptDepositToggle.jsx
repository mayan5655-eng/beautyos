'use client';

// app/ApptDepositToggle.jsx
//
// In the appointment sheet, when she books by hand: "לבקש מקדמה?", pre-set from the chosen service's "requires deposit" setting. On: the booking is held as
// pending for 30 minutes and she gets the Grow payment link to send (DepositLinkSheet). Only for a new single booking, only when connected to Grow in
// deposit mode.
import { useEffect } from 'react';
import { useGrowPolicy } from './useGrowPolicy';

export default function ApptDepositToggle({ serviceName, serviceRequires, value, onChange }) {
  const { connected, mode } = useGrowPolicy();
  const available = connected && mode === 'deposit';
  // Follows the service: choosing another one resets the switch to that service's own setting; she can still flip it.
  useEffect(() => { onChange(available && serviceRequires === true); }, [serviceName, serviceRequires, available]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!available) return null;
  return (
    <label data-testid="appt-deposit-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
      <input type="checkbox" aria-label="לבקש מקדמה" checked={value === true} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
      <span>לבקש מקדמה? <span style={{ color: 'var(--ink-3)' }}>התור יישמר 30 דקות עד התשלום</span></span>
    </label>
  );
}
