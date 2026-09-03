// lib/seedServices.ts
//
// The one write path for services chosen from the onboarding template.
//
// Both callers — the onboarding wizard and Settings → שירותים — go through
// here, so the tenant stamping, the name dedupe and the colour cycle are
// defined once. It mirrors the safety shape of the paste import in
// app/beautyos.jsx (`importServices`): an explicit tenant_id rather than a
// reliance on the column default, a dedupe on trimmed name, and a colour cycle
// continued from the services that already exist instead of restarted.
//
// Deliberately takes the Supabase client as an argument rather than importing
// it. lib/tenantTemplate.ts is forbidden from referencing Supabase at all (see
// scripts/check-template-clean.mjs), and keeping the seam here means the data
// module and the write module stay cleanly separated.

import { serviceColorAt } from './serviceColors.ts';

export type PickedService = {
  name: string;
  price: number;
  duration: number;
  /** One-liner for the booking page; carried from the template so a new menu
   *  arrives described without typing. */
  description?: string;
};

/** A service_prices row, loosely typed — this project has no generated DB types. */
export type ServiceRow = Record<string, unknown>;

export type SeedServicesResult = {
  /** Rows as they came back from the database, ready to push into state. */
  inserted: ServiceRow[];
  /** Picks that were already on her menu under the same name. */
  skipped: number;
  /** Present only on failure; the caller decides how to surface it. */
  error: { message: string } | null;
};

/**
 * The narrow slice of the Supabase client this module actually uses.
 *
 * Structural rather than the real client type: it keeps `any` out of a file
 * that writes to the database, and it documents at a glance that the only
 * capability required here is a single insert — there is no select, and
 * nothing to point at another tenant.
 */
// PromiseLike, not Promise: supabase-js returns a query BUILDER that is
// thenable but is not a Promise (it has no .catch/.finally on its type). It is
// awaited the same way; demanding Promise here rejects the real client.
export type ServiceInsertClient = {
  from: (table: string) => {
    insert: (rows: ServiceRow[]) => {
      select: () => PromiseLike<{
        data: ServiceRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Insert the treatments she picked.
 *
 * `existingNames` are the names already on her price list. They are skipped
 * rather than rejected: re-running the picker after adding a few by hand should
 * top up the menu, not fail on the overlap.
 *
 * `tenantId` may be null only if the caller has genuinely failed to resolve it,
 * in which case the field is omitted rather than sent as null — the same
 * fallback the rest of the app uses, so this never regresses below the table's
 * own default.
 */
export async function insertPickedServices(
  supabase: ServiceInsertClient,
  tenantId: string | null,
  picked: PickedService[],
  existingNames: string[] = []
): Promise<SeedServicesResult> {
  const existing = new Set(existingNames.map((n) => String(n || '').trim()));
  const tenantField = tenantId ? { tenant_id: tenantId } : {};

  const seen = new Set<string>();
  const rows: ServiceRow[] = [];
  let skipped = 0;
  // Continue the cycle past what she already has, so a top-up does not restart
  // on colours already in use.
  let colorAt = existing.size;

  for (const p of picked) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    if (existing.has(name) || seen.has(name)) {
      skipped++;
      continue;
    }
    seen.add(name);
    rows.push({
      name,
      // Number() rather than the raw field: the price input is a text box and
      // an emptied one yields "" , which would land as 0 on her booking page
      // only if we let it through unchecked.
      price: Number.isFinite(Number(p.price)) ? Number(p.price) : 0,
      duration: Number(p.duration) > 0 ? Number(p.duration) : 60,
      description: String(p.description || '').trim() || null,
      color: serviceColorAt(colorAt++),
      active: true,
      ...tenantField,
    });
  }

  if (rows.length === 0) {
    return { inserted: [], skipped, error: null };
  }

  const { data, error } = await supabase.from('service_prices').insert(rows).select();
  if (error) {
    return { inserted: [], skipped, error };
  }
  return { inserted: data || [], skipped, error: null };
}
