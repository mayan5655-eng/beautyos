'use client';

// app/GrowCostNote.jsx
//
// The cost of card clearing through Grow, said up front wherever Kalmea offers it to her: one short line, and "מה זה כולל?"
// for the whole track. The numbers live in lib/growPricing.ts only.

import { growCostLineHe, growCostDetailsHe } from '@/lib/growPricing';

export default function GrowCostNote({ style }) {
  return (
    <div data-testid="grow-cost" style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', lineHeight: 1.6, ...style }}>
      <p style={{ margin: 0 }}>{growCostLineHe()}</p>
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--pc-deep, var(--ink))', fontWeight: 700, padding: '6px 0' }}>מה זה כולל?</summary>
        <ul style={{ margin: '2px 0 0', paddingInlineStart: 18 }}>
          {growCostDetailsHe().map((l) => <li key={l}>{l}</li>)}
        </ul>
      </details>
    </div>
  );
}
