// app/api/grow/_cancel.ts
//
// SERVER ONLY. Builds the dependencies of lib/grow/cancelFees.ts for a route: the service-role repos, the Grow operations (mock or live) and the
// charge settings for the deposit payment page. Returns null when Grow cannot work on this deployment (not configured, or mock mode refused on
// production), so a route can answer plainly instead of failing half way.
import { randomBytes } from 'node:crypto';
import { APP_URL } from '@/lib/appUrl';
import { resolveGrow } from '@/lib/grow/adapter';
import { supabaseGrowRepo } from '@/lib/grow/repo';
import { supabaseCancelRepo } from '@/lib/grow/cancelFees';
import type { Deps } from '@/lib/grow/cancelFees';
import { sanitizePolicy } from '@/lib/cancellationPolicy';
import { admin } from './_shared';

export function cancelDeps(): Deps | null {
  const grow = resolveGrow(process.env, APP_URL);
  if (!grow.configured || !grow.creds || !grow.ops) return null;
  const db = admin();
  const growRepo = supabaseGrowRepo(db);
  return {
    repo: supabaseCancelRepo(db, sanitizePolicy),
    grow: growRepo,
    ops: grow.ops,
    chargeDeps: { repo: growRepo, creds: grow.creds, fetchImpl: grow.fetchImpl, appUrl: APP_URL, newToken: () => randomBytes(24).toString('hex') },
  };
}
