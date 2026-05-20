// app/dashboard/leads/page.tsx
// Server component - fetches leads from DB and passes to client component

import { createClient } from '../../../lib/supabase/server';
import LeadsClient, { type Lead } from './LeadsClient';

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data: tenantId, error: tenantError } = await supabase.rpc(
    'get_user_tenant_id'
  );

  if (tenantError || !tenantId) {
    return (
      <div>
        <h1 style={{ fontSize: '28px', marginBottom: '16px' }}>📋 לידים</h1>
        <p style={{ color: '#999' }}>
          לא הצלחנו לטעון את הנתונים. נסי שוב מאוחר יותר.
        </p>
      </div>
    );
  }

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('received_at', { ascending: false, nullsFirst: false });

  if (leadsError) {
    return (
      <div>
        <h1 style={{ fontSize: '28px', marginBottom: '16px' }}>📋 לידים</h1>
        <p style={{ color: '#ff4444' }}>
          שגיאה בטעינת הלידים: {leadsError.message}
        </p>
      </div>
    );
  }

  return <LeadsClient initialLeads={(leads || []) as Lead[]} />;
}