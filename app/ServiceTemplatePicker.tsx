'use client';

/**
 * ServiceTemplatePicker — "which of these do you offer?"
 *
 * A suggested Israeli-cosmetics menu she picks from. Presentational and fully
 * controlled: it renders the list and reports the selection, so the SAME picker
 * appears in two places that write at different moments.
 *
 *   Onboarding (app/onboarding)   collects the picks and inserts them inside
 *                                 finish(), immediately after the settings row.
 *                                 Onboarding completion is "does a settings row
 *                                 exist", so writing services BEFORE that row
 *                                 would let an abandoned signup leave a tenant
 *                                 with a menu and no settings — and re-run her
 *                                 through onboarding over populated tables.
 *   Settings (app/beautyos.jsx)   inserts on confirm, in place.
 *
 * Three rules from the product brief are load-bearing here:
 *
 *   1. She PICKS. Nothing is selected when the list opens and nothing is
 *      inserted for her. A treatment she does not perform is worse than an
 *      empty screen: it reaches her public booking page and the prompts that
 *      write her marketing copy.
 *   2. Prices are SUGGESTIONS SHE EDITS. Each pick opens an editable price
 *      pre-filled with the midpoint of a generic market range, with the range
 *      itself shown beside it. She can change it here, before anything is
 *      written, not only afterwards in the price list.
 *   3. What she adds becomes HERS. These rows are ordinary service_prices rows
 *      with no link back to the template — renaming, repricing or archiving one
 *      later is just editing her own menu.
 *
 * Type sizes here start at 12.5px on purpose. The app has a known legibility
 * problem (hundreds of sub-11px nodes) and this screen is read by someone
 * deciding what her business sells; it is not the place to add more 9px text.
 *
 * FIELD-AWARE since business_fields shipped: `fields` decides which of
 * lib/tenantTemplate's per-field menus render. One field renders exactly as
 * before — no field-level heading, just her groups. More than one field adds
 * a small heading per field (lib/businessFields.ts's label) above its groups,
 * so a dual-field tenant can tell which world each group came from without
 * the picker turning into a maze. Nothing is selected when the list opens
 * here either, same rule as before, now per field.
 */

import { useMemo, useState } from 'react';
import {
  serviceTemplateGroupsFor,
  suggestedPrice,
  priceRangeLabel,
  type ServiceTemplateItem,
} from '@/lib/tenantTemplate';
import { BUSINESS_FIELDS, type FieldKey } from '@/lib/businessFields';
import type { PickedService } from '@/lib/seedServices';

export default function ServiceTemplatePicker({
  value,
  onChange,
  fields,
  existingNames = [],
  accent = 'var(--pc)',
  accentTint = 'var(--pc-tint)',
}: {
  value: PickedService[];
  onChange: (next: PickedService[]) => void;
  /** Which field(s)' menus to show — the picks from onboarding step 4 or
   *  Settings → כללי. Empty shows nothing (see the caller's own empty-state
   *  copy for what to say instead of rendering a blank box). */
  fields: FieldKey[];
  /** Already on her price list — shown, but not selectable twice. */
  existingNames?: string[];
  accent?: string;
  accentTint?: string;
}) {
  const fieldGroups = useMemo(() => serviceTemplateGroupsFor(fields), [fields]);
  const showFieldHeadings = fieldGroups.length > 1;

  // Only the very first group across every field starts open. Thirty rows at
  // once is a wall; a handful of headings with one open is a list.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const firstKey = fieldGroups[0]?.groups[0]?.key;
    return firstKey ? { [firstKey]: true } : {};
  });

  const existing = useMemo(
    () => new Set(existingNames.map((n) => String(n || '').trim())),
    [existingNames]
  );
  const byName = useMemo(() => {
    const m = new Map<string, PickedService>();
    for (const p of value) m.set(p.name, p);
    return m;
  }, [value]);

  const toggleGroup = (key: string) =>
    setOpenGroups((g) => ({ ...g, [key]: !g[key] }));

  const toggleItem = (item: ServiceTemplateItem, field: FieldKey) => {
    if (existing.has(item.name)) return;
    if (byName.has(item.name)) {
      onChange(value.filter((p) => p.name !== item.name));
    } else {
      onChange([
        ...value,
        { name: item.name, price: suggestedPrice(item), duration: item.duration, description: item.description, field },
      ]);
    }
  };

  const patch = (name: string, field: 'price' | 'duration', raw: string) => {
    // Kept as a number in state but allowed to pass through empty: Number("")
    // is 0, which is a real answer for the free consultation and a visible one
    // everywhere else, so there is nothing to guess at.
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(value.map((p) => (p.name === name ? { ...p, [field]: n } : p)));
  };

  if (fieldGroups.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {fieldGroups.map(({ field, groups }) => (
        <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showFieldHeadings && (
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: accent, margin: 0 }}>
              {BUSINESS_FIELDS.find((f) => f.key === field)?.label ?? field}
            </p>
          )}
          {groups.map((group) => {
        const open = !!openGroups[group.key];
        const chosenHere = group.items.filter((i) => byName.has(i.name)).length;
        return (
          <div
            key={group.key}
            style={{
              border: '1px solid var(--line)',
              borderRadius:"var(--r-md)",
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={open}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '14px 15px',
                background: open ? accentTint : 'var(--surface)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'right',
              }}
            >
              <span style={{ flex: 1, fontSize:"var(--t-md)", fontWeight: 700, color: 'var(--ink)' }}>
                {group.label}
              </span>
              {chosenHere > 0 && (
                <span
                  style={{
                    fontSize:"var(--t-sm)",
                    fontWeight: 700,
                    color: accent,
                    background: 'var(--surface)',
                    borderRadius:"var(--r-full)",
                    padding: '3px 10px',
                  }}
                >
                  {chosenHere} נבחרו
                </span>
              )}
              <span aria-hidden style={{ fontSize:"var(--t-md)", color: 'var(--ink-3)' }}>
                {open ? '▲' : '▼'}
              </span>
            </button>

            {open && (
              <div style={{ padding: '4px 10px 10px' }}>
                {group.items.map((item) => {
                  const already = existing.has(item.name);
                  const picked = byName.get(item.name);
                  const isPicked = !!picked;
                  return (
                    <div
                      key={item.name}
                      style={{
                        borderTop: '1px solid var(--line-2)',
                        padding: '4px 0',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(item, field)}
                        disabled={already}
                        aria-pressed={isPicked}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          width: '100%',
                          // 44px minimum tap target, one-handed, wet hands.
                          minHeight: 44,
                          padding: '8px 5px',
                          background: 'transparent',
                          border: 'none',
                          cursor: already ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'right',
                          opacity: already ? 0.55 : 1,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 22,
                            height: 22,
                            flexShrink: 0,
                            borderRadius:"var(--r-xs)",
                            border: isPicked ? `2px solid ${accent}` : '1.5px solid var(--line-2)',
                            background: isPicked ? accent : 'var(--surface)',
                            color: 'var(--surface)',
                            fontSize:"var(--t-md)",
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1,
                          }}
                        >
                          {isPicked ? '✓' : ''}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize:"var(--t-md)",
                              fontWeight: 600,
                              color: 'var(--ink)',
                              lineHeight: 1.4,
                            }}
                          >
                            {item.name}
                          </span>
                          <span
                            style={{ display: 'block', fontSize:"var(--t-sm)", color: 'var(--ink-3)', marginTop: 2 }}
                          >
                            {already
                              ? 'כבר ברשימה שלך'
                              : `${item.duration} דקות · מקובל בשוק: ${priceRangeLabel(item)}`}
                          </span>
                          {/* A reminder, never a gate — she knows what she's
                              certified for. Shown regardless of pick state,
                              same as the duration/price line above it. */}
                          {item.licenceNote && (
                            <span
                              style={{ display: 'block', fontSize:"var(--t-sm)", color: 'var(--warning)', marginTop: 2, fontWeight: 600 }}
                            >
                              ⚠️ {item.licenceNote}
                            </span>
                          )}
                        </span>
                      </button>

                      {isPicked && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                            padding: '2px 38px 10px 5px',
                          }}
                        >
                          <label style={fieldLabel}>
                            מחיר ₪
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={String(picked.price)}
                              onChange={(e) => patch(item.name, 'price', e.target.value)}
                              style={numInput}
                            />
                          </label>
                          <label style={fieldLabel}>
                            דקות
                            <input
                              type="number"
                              min={5}
                              step={5}
                              inputMode="numeric"
                              value={String(picked.duration)}
                              onChange={(e) => patch(item.name, 'duration', e.target.value)}
                              style={numInput}
                            />
                          </label>
                          <span style={{ fontSize:"var(--t-sm)", color: 'var(--ink-3)' }}>
                            הצעה בלבד — אפשר לשנות
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize:"var(--t-sm)",
  color: 'var(--ink-2)',
  fontWeight: 600,
};

const numInput: React.CSSProperties = {
  width: 74,
  // 16px so iOS Safari does not zoom the page on focus — the rule the mobile
  // work established for every form field.
  fontSize:"var(--t-lg)",
  fontFamily: 'inherit',
  border: '1px solid var(--line-2)',
  borderRadius:"var(--r-xs)",
  padding: '7px 9px',
  textAlign: 'center',
  background: 'var(--surface)',
  color: 'var(--ink)',
  outline: 'none',
  direction: 'ltr',
};
