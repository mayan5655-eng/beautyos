// app/dashboard/marketing/page.tsx
// Server Component - fetches campaigns list

import { createClient } from '@/lib/supabase/server';
import MarketingClient from './MarketingClient';

export default async function MarketingPage() {
  const supabase = await createClient();

  // Scope to the caller's tenant explicitly. RLS already restricts this table,
  // but every other query in the app filters by tenant_id as well - keeping
  // that consistent means an RLS regression cannot silently widen this page.
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  return <MarketingClient campaigns={campaigns || []} />;
}