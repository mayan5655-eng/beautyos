// app/dashboard/marketing/page.tsx
// Server Component - fetches campaigns list

import { createClient } from '@/lib/supabase/server';
import MarketingClient from './MarketingClient';

export default async function MarketingPage() {
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  return <MarketingClient campaigns={campaigns || []} />;
}