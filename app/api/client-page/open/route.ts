// app/api/client-page/open/route.ts
//
// The one thing the personal page reports back: "she opened it". A beacon from the page's own script, sent after it has
// loaded - so link-preview crawlers (WhatsApp, Instagram, Facebook), which fetch the HTML but run no script, never count as
// the client. It stores a count and two times on the page's own row (client_pages) and nothing else: no IP, no device, no
// location, no history of visits. A signed-in owner of that business opening the link herself (to look at it) is not counted.
//
// POST { t: <token> } -> { success: true } always, whether or not anything was recorded: a stranger learns nothing about
// which tokens exist.

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { checkIpLimit } from '@/lib/rateLimit';
import { recordOpen } from '@/lib/clientPageData';
import { parsePageToken } from '@/lib/clientPage';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const OK = () => Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const limited = checkIpLimit(request, 'client-page-open');
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.t || '');
    const parsed = parsePageToken(token);
    if (!parsed) return OK();

    // The owner looking at her own client's page is not "the client opened it".
    try {
      const session = await createServerClient();
      const { data: { user } } = await session.auth.getUser();
      if (user) {
        const { data: mine } = await session.rpc('get_user_tenant_id');
        if (mine) {
          const { data: row } = await admin.from('client_pages').select('tenant_id').eq('token_id', parsed.tokenId).maybeSingle();
          if (row && String(row.tenant_id) === String(mine)) return OK();
        }
      }
    } catch { /* no session is the normal case */ }

    await recordOpen(admin, token);
  } catch (err) {
    console.error('[client-page/open] failed:', (err as Error)?.message);
  }
  return OK();
}
