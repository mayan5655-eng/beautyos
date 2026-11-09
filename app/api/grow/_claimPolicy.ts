// app/api/grow/_claimPolicy.ts
//
// Her Grow cancellation / deposit policy, read EXACTLY as the public booking route reads it (app/api/book-appointment): only while
// the Grow screens are on for her business (growUiEnabled), only when Grow is configured (cancelDeps), and only an active policy
// with a connected account (activePolicy). Used by the waitlist offer and the claim link (lib/claimGuard.ts).
// One difference, on purpose: the booking route treats a policy it cannot read as "no policy" (the booking then asks nothing),
// but the claim link confirms without asking anything, so here a read that fails is { ok: false } and the callers refuse.

import { growUiEnabled } from '@/lib/grow/adapter';
import { activePolicy } from '@/lib/grow/cancelFees';
import type { CancelPolicy } from '@/lib/cancellationPolicy';
import { cancelDeps } from './_cancel';

export type PolicyRead = { ok: true; policy: CancelPolicy | null } | { ok: false };

export async function publicBookingPolicy(tenantId: string): Promise<PolicyRead> {
  try {
    if (!growUiEnabled(process.env, tenantId)) return { ok: true, policy: null };
    const deps = cancelDeps();
    if (!deps) return { ok: true, policy: null };
    return { ok: true, policy: await activePolicy(deps, tenantId) };
  } catch (e) {
    console.warn('[claimPolicy] policy unreadable, failing closed:', (e as Error)?.message || String(e));
    return { ok: false };
  }
}
