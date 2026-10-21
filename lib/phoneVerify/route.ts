// lib/phoneVerify/route.ts
//
// SERVER ONLY. What the four app/api/phone/* routes share: the service-role store, who is signed in (if anyone), and
// the caller's address as a keyed hash (the rate-limit ledger never stores a raw IP).

import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/rateLimit';
import { supabasePhoneStore } from './store.ts';
import { memoryPhoneStore, type MemoryStore } from './memoryStore.ts';
import { phoneSecret } from './service.ts';

// A local server can walk the signup screens with no database: PHONE_VERIFY_DEV_STORE=memory (with SMS_MODE=mock).
// Never on a Vercel deployment, where instances do not share memory and the database is the production one.
let devStore: MemoryStore | null = null;

export function phoneStore() {
  if (process.env.PHONE_VERIFY_DEV_STORE === 'memory' && !process.env.VERCEL_ENV) {
    return (devStore ||= memoryPhoneStore());
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabasePhoneStore(db);
}

export function ipHashOf(request: Request): string {
  return createHmac('sha256', phoneSecret()).update(`ip:${clientIp(request)}`).digest('base64url').slice(0, 22);
}

export type SessionInfo = {
  user: { id: string; created_at?: string | null; user_metadata?: Record<string, unknown> | null };
  tenantId: string | null;
} | null;

/** The signed-in user (asked of the Auth server, not just the cookie) and her tenant, or null. */
export async function sessionInfo(): Promise<SessionInfo> {
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return null;
    const { data: tenantId } = await session.rpc('get_user_tenant_id');
    return { user: { id: user.id, created_at: user.created_at, user_metadata: user.user_metadata }, tenantId: (tenantId as string) || null };
  } catch {
    return null;
  }
}
