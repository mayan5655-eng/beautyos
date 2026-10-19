// lib/autoSlug.ts
//
// Her first booking link, from her business name instead of her email.
//
// The signup trigger gives every new business a placeholder address made of the
// email's local part plus the first 8 characters of her USER id (auth.users.id, not the tenant id - checked on
// three smoke signups): "dana.cohen1987@..." -> danacohen1987-1a2b3c4d. That is the link her very
// first clients see, in her WhatsApp messages and on the dashboard's "copy your
// booking link" card, and it shows a stranger her email handle. Found in the
// 2026-10-20 new-tenant walk: onboarding asked for the business name and never
// used it for the address.
//
// So at the end of onboarding, IF the address is still the placeholder, we try
// her business name (then name-2 ... name-5 when it is taken). An address she
// chose herself in Settings > הדף שלי is never touched. Best-effort: any refusal
// leaves the placeholder, which still works.

import { slugify, slugError } from './slug.ts';

/**
 * True when this is the signup trigger's placeholder (or nothing at all), not an address she chose.
 * `ids`: her user id (what the trigger uses) and, defensively, the tenant id.
 */
export function isPlaceholderSlug(slug: string | null | undefined, ids: Array<string | null | undefined>): boolean {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return true;
  return ids.some((id) => {
    const short = String(id || '').slice(0, 8).toLowerCase();
    return short.length === 8 && s.endsWith(`-${short}`);
  });
}

/** Addresses to try, best first. Empty when the name gives nothing usable. */
export function slugCandidates(businessName: string | null | undefined, max = 5): string[] {
  const base = slugify(String(businessName || ''));
  if (!base || slugError(base)) return [];
  const out = [base];
  for (let i = 2; i <= max; i++) {
    const room = 40 - String(i).length - 1;
    const c = `${base.slice(0, room).replace(/-+$/, '')}-${i}`;
    if (!slugError(c)) out.push(c);
  }
  return out;
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Claim the first free candidate through claim_tenant_slug (add_slug_claim_rpc.sql). Returns the slug it
 * got, or null. Only a "taken" (23505) moves on to the next candidate; anything else stops.
 */
export async function claimNameSlug(rpc: Rpc, businessName: string): Promise<string | null> {
  for (const want of slugCandidates(businessName)) {
    const { error } = await rpc('claim_tenant_slug', { p_slug: want });
    if (!error) return want;
    if (error.code !== '23505') return null;
  }
  return null;
}
