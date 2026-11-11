'use client';
// app/ProductSettings.jsx
//
// Settings > העסק שלי: "מוצרים ומלאי בקופה". Her own switch (on by default) and the low-stock threshold new products start with.
// Stored in automations.products, a key the settings save may write and validates (lib/products.ts sanitizeProductAutomations);
// never in feature_flags, which is the platform's. Shown only when the platform did not switch products off and the migration has
// run (`api.allowed` and a loaded catalog): before that a business sees nothing about products at all.
import { productsConfig, productsStored } from '@/lib/products';
import { tr } from "@/lib/i18n/tr";

export default function ProductSettings({ api, automations, pc, onChange }) {
  if (!api?.allowed || api.status !== 'ready') return null;
  const autos = automations && typeof automations === 'object' ? automations : {};
  const cfg = productsConfig({ automations: autos });
  const set = (patch) => onChange({ ...autos, products: productsStored({ ...cfg, ...patch }) });
  const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14 };
  return (
    <div data-testid="product-settings" style={box}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', minHeight: 44 }}>
        <span>
          <span style={{ display: 'block', fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)' }}>{tr("🧴 מוצרים ומלאי בקופה")}</span>
          <span style={{ display: 'block', fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>{tr("מכירת מוצרים ליד הטיפולים, מלאי שמתעדכן בכל מכירה, והמלצות מוצרים בסריקת העור.")}</span>
        </span>
        <input type="checkbox" role="switch" aria-label={tr("מוצרים ומלאי בקופה")} checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} style={{ width: 22, height: 22, accentColor: pc, flexShrink: 0 }} />
      </label>
      {cfg.enabled && (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600 }}>{tr("התראת מלאי נמוך למוצר חדש, כשנשארות")}</span>
          <input type="number" inputMode="numeric" min={0} max={1000} aria-label={tr("סף מלאי נמוך למוצר חדש")} value={cfg.lowStockThreshold}
            onChange={(e) => set({ lowStockThreshold: e.target.value === '' ? 0 : Math.max(0, Math.min(1000, Math.round(Number(e.target.value)) || 0)) })}
            style={{ width: 72, boxSizing: 'border-box', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 16, fontFamily: 'inherit', textAlign: 'center', background: 'var(--surface-2)', color: 'var(--ink)', minHeight: 44 }} />
        </label>
      )}
      {!cfg.enabled && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', margin: '8px 0 0' }}>{tr("כבוי: הקטלוג והמלאי שלך נשמרים, ויחזרו כשתדליקי.")}</p>}
    </div>
  );
}
