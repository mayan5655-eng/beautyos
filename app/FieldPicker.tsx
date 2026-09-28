'use client';

/**
 * FieldPicker — "what kind of business is this?"
 *
 * Multi-select, not single: a tenant who does both cosmetics and nails picks
 * both, and nothing here forces a choice between them. Used in two places —
 * onboarding step 4 (before ServiceTemplatePicker, so the picker below it
 * knows which menu to show) and Settings → כללי (changeable any time).
 *
 * Turning a field OFF here is a display filter going forward, never a
 * delete: nothing about her existing services, designs or images from that
 * field is touched. The caller does not need to do anything special to get
 * that guarantee — it falls out of business_fields only ever being read to
 * decide what to OFFER, never to filter what is already saved. See
 * lib/businessFields.ts.
 */

import { BUSINESS_FIELDS, type FieldKey } from '@/lib/businessFields';

export default function FieldPicker({
  value,
  onChange,
  accent = 'var(--pc)',
  accentTint = 'var(--pc-tint)',
}: {
  value: FieldKey[];
  onChange: (next: FieldKey[]) => void;
  accent?: string;
  accentTint?: string;
}) {
  const toggle = (key: FieldKey) => {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {BUSINESS_FIELDS.map((f) => {
        const picked = value.includes(f.key);
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => toggle(f.key)}
            aria-pressed={picked}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              width: '100%',
              // 44px+ tap target, one-handed, wet hands — same rule as
              // ServiceTemplatePicker's rows.
              minHeight: 52,
              padding: '12px 14px',
              textAlign: 'right',
              border: picked ? `2px solid ${accent}` : '1.5px solid var(--line)',
              borderRadius: 'var(--r-md)',
              background: picked ? accentTint : 'var(--surface)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                borderRadius: 'var(--r-xs)',
                border: picked ? `2px solid ${accent}` : '1.5px solid var(--line-2)',
                background: picked ? accent : 'var(--surface)',
                color: 'var(--surface)',
                fontSize: 'var(--t-md)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {picked ? '✓' : ''}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>
                {f.label}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginTop: 2 }}>
                {f.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
