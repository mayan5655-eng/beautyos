// app/dashboard/reel-studio/page.jsx
// Server Component — resolves the tenant's own business name, then hands it to
// the client-side canvas editor.
//
// This used to be a "use client" page passing businessName="Maayan Cosmetics"
// as a literal. ReelStudio paints that string onto the cover image it exports
// (ReelStudio.jsx, ctx.fillText), so every tenant who made a reel cover got
// someone else's business name burned into the artwork.
//
// primaryColor stays a CSS var so it keeps following whatever accent the
// tenant's theme has already set on the document; its fallback is now the real
// default accent (#5B3E67) rather than the older #4A2E5A, which was not a
// colour any current theme uses.

import { createClient } from '@/lib/supabase/server';
import ReelStudio from '../../ReelStudio';

export default async function ReelStudioPage() {
  const supabase = await createClient();

  // Scope to the caller's tenant explicitly. RLS already restricts settings,
  // but every other query in the app filters on tenant_id too — keeping that
  // consistent means an RLS regression cannot silently widen this page.
  const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

  let businessName = '';
  if (tenantId) {
    const { data } = await supabase
      .from('settings')
      .select('business_name')
      .eq('tenant_id', tenantId)
      .limit(1);
    businessName = data?.[0]?.business_name || '';
  }

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "linear-gradient(180deg,var(--brand-cream, #FEFAF7) 0%,#FFFFFF 420px)", padding: "28px 16px" }}>
      {/* Empty string, not a placeholder: ReelStudio already defaults
          businessName to "" and simply draws no caption line, which is the
          right outcome for a tenant who has not named her business yet. */}
      <ReelStudio primaryColor="var(--pc, #5B3E67)" businessName={businessName} />
    </div>
  );
}
