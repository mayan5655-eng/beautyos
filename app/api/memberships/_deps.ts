// app/api/memberships/_deps.ts
//
// SERVER ONLY. Builds the dependencies of lib/memberships.ts for a route, and decides whether memberships exist for a business at all.
// Hidden (null / false) unless: NEXT_PUBLIC_CLIENT_MEMBERSHIPS is on, the Grow screens are on for her (GROW_UI_ENABLED and
// GROW_ALLOWED_TENANTS), the saved-card flows are configured on this deployment (live: tokenCredentials(), i.e. GROW_TOKEN_*; mock:
// only where mock Grow is allowed, never on Vercel production), her Grow account is connected and switched on, and she is not a demo.
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow, growUiEnabled } from '@/lib/grow/adapter';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { encryptToken, decryptToken } from '@/lib/facebook/encryption';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';
import { membershipsReady, onPaymentRefunded } from '@/lib/memberships';
import { moneyAlert } from '@/lib/moneyAlert.js';
import type { MembershipDeps } from '@/lib/memberships';
import { supabaseMembershipRepo } from '@/lib/membershipsRepo';
import { isDemoTenantId } from '@/lib/demoTenants';
import { notifyOwner } from '@/lib/ownerNotify.js';
import { admin, tableMissing } from '../grow/_shared';

/** The saved-card flows can run here: the live token credentials, or the in-memory mock where mock Grow is allowed. */
export function tokenFlowsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const g = resolveGrow(env, APP_URL);
  if (!g.configured || !g.ops) return false;
  return g.mode === 'live' ? !!g.tokenCreds : true;
}

export function membershipDeps(): MembershipDeps | null {
  if (!clientMembershipsEnabled()) return null;
  const grow = resolveGrow(process.env, APP_URL);
  if (!tokenFlowsConfigured() || !grow.ops) return null;
  const db = admin();
  return {
    repo: supabaseMembershipRepo(db),
    grow: supabaseGrowRepo(db),
    ops: grow.ops,
    seal: { encrypt: encryptToken, decrypt: decryptToken },
    notifyUrl: `${APP_URL.replace(/\/+$/, '')}/api/grow/webhook`,
    newToken: () => randomBytes(24).toString('hex'),
    // In the app and push only, to HER. whatsapp: false: not even the opt-in copy to her own number. Nothing ever goes to a client.
    notify: async (n) => { await notifyOwner({ tenantId: n.tenantId, kind: 'membership', title: n.title, body: n.body, whatsapp: false }); },
  };
}

/** Whether this business sees memberships. A missing table (the migration has not run) reads as "not available". */
export async function readyFor(d: MembershipDeps | null, tenantId: string): Promise<{ ready: boolean; migration: boolean }> {
  if (!d) return { ready: false, migration: true };
  try {
    const account = await d.repo.getAccount(tenantId);
    const ok = membershipsReady({ flag: clientMembershipsEnabled(), growUi: growUiEnabled(process.env, tenantId), tokenFlows: tokenFlowsConfigured(), account, demo: isDemoTenantId(tenantId) });
    if (!ok) return { ready: false, migration: true };
    await d.repo.listPlans(tenantId);
    return { ready: true, migration: true };
  } catch (e) {
    if (tableMissing(e as { code?: string; message?: string }) || /membership_plans|does not exist|schema cache/i.test((e as Error)?.message || '')) return { ready: false, migration: false };
    throw e;
  }
}

export const membershipLinkUrl = (linkId: string) => `${APP_URL.replace(/\/+$/, '')}/pay/membership/${linkId}`;

/**
 * A Grow payment was refunded (the refund route, refund on void): if it charged a membership month, that month becomes 'refunded'
 * (lib/memberships.ts onPaymentRefunded). Never fails the refund that already happened; a failure is said to the operator.
 */
export async function membershipRefunded(tenantId: string, paymentId: string): Promise<void> {
  const d = membershipDeps();
  if (!d) return;
  try {
    await onPaymentRefunded(d, { tenantId, paymentId });
  } catch (e) {
    if (/does not exist|schema cache/i.test((e as Error)?.message || '')) return;
    console.error('[memberships] marking a refunded month failed for payment', paymentId, (e as Error)?.message);
    await moneyAlert('memberships:refund', 'a refunded Grow payment charged a membership month that could not be marked refunded (its credits may still show)', { paymentId, tenantId }, { key: paymentId });
  }
}
