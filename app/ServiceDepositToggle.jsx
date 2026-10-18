'use client';

// app/ServiceDepositToggle.jsx
//
// In the services settings, on each service: "דורש מקדמה" (default off). In deposit mode only the services marked here ask the client for a deposit when
// she books on the public page; every other service books exactly as before. Visible only while the business is connected to Grow.
import { useGrowPolicy } from './useGrowPolicy';

export default function ServiceDepositToggle({ checked, onChange }) {
  const { connected, mode } = useGrowPolicy();
  if (!connected) return null;
  return (
    <label data-testid="service-deposit-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 4, cursor: 'pointer', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
      <input type="checkbox" aria-label="דורש מקדמה" checked={checked === true} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
      <span>
        דורש מקדמה
        {mode !== 'deposit' && <span style={{ color: 'var(--ink-3)' }}> (פעיל כשמדיניות הביטולים במצב מקדמה)</span>}
      </span>
    </label>
  );
}
