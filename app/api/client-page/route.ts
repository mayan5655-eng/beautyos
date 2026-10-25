// app/api/client-page/route.ts
//
// The owner's side of the client's personal results page ("שליחת הדף שלה").
//
// POST { clientId, action: 'status' | 'save' | 'revoke', aftercare? }
//   status  reads: is there a link, has she opened it, how many photos would show. Creates nothing.
//   save    makes the link when there is none (or it is revoked/expired/about to expire), stores the aftercare text, and
//           returns the link, the ready WhatsApp text and a wa.me link. The link is fetched BEFORE the tap and rendered as a
//           real <a>, because Safari and the Instagram browser block a window opened after an await (phone review 2026-10-24).
//   revoke  cancels the link at once: the page answers "not found" from then on.
// Nothing is ever sent from here: the owner opens WhatsApp herself.
//
// SECURITY: tenant from the session, never the body; the client must be hers. Writes go through the service role because
// client_pages gives `authenticated` read access only (one writer, this route). Before add_client_pages.sql is run every
// action answers needsMigration instead of failing.

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireActiveTenant } from '@/lib/planGuard';
import { checkTenantLimit } from '@/lib/rateLimit';
import { APP_URL } from '@/lib/appUrl';
import { waMsgLink } from '@/lib/whatsappLink';
import { clientPageMessage } from '@/lib/clientPageMessage.js';
import {
  newTokenId, pageExpiry, buildPageToken, clientPageUrl, cleanAftercare, pageStatus, rowConsented,
  CLIENT_PAGE_RENEW_MS, type ResultRow,
} from '@/lib/clientPage';
import { isMissingTable, isMissingColumn } from '@/lib/clientPageData';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEEDS_MIGRATION = {
  success: false,
  needsMigration: true,
  error: 'הדף האישי עוד לא הופעל: חסר עדכון אחד במסד הנתונים (kalmea-sql-client-results.txt). אחרי שירוץ הכפתור יעבוד.',
};
const fail = (where: string, err: unknown) => {
  console.error(`[client-page] ${where} failed:`, (err as { message?: string })?.message || err);
  return Response.json({ success: false, error: 'משהו נתקע אצלנו, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
};

type PageRow = {
  id: string; token_id: string; aftercare: string | null; created_at: string; expires_at: string;
  revoked_at: string | null; first_opened_at: string | null; last_opened_at: string | null; open_count: number | null;
};
const PAGE_COLS = 'id, token_id, aftercare, created_at, expires_at, revoked_at, first_opened_at, last_opened_at, open_count';

/** The newest row for this client (active first, else the latest revoked/expired one, so "נפתח" survives a revoke). */
async function currentRow(tenantId: string, clientId: string) {
  const { data, error } = await admin.from('client_pages').select(PAGE_COLS).eq('tenant_id', tenantId).eq('client_id', clientId).order('created_at', { ascending: false }).limit(1);
  if (error) return { error, row: null as PageRow | null };
  return { error: null, row: ((data || [])[0] as PageRow) || null };
}

async function photoCounts(tenantId: string, clientId: string) {
  const { data, error } = await admin
    .from('treatment_results')
    .select('id, client_id, after_url, consent_name, consent_given_on, consent_confirmed, consent_confirmed_at')
    .eq('tenant_id', tenantId).eq('client_id', clientId);
  if (error) return { shown: 0, waiting: 0, needsColumn: isMissingColumn(error) };
  const rows = (data || []) as ResultRow[];
  const shown = rows.filter((r) => rowConsented(r) && String(r.after_url || '').trim()).length;
  return { shown, waiting: rows.length - shown, needsColumn: false };
}

export async function POST(request: Request) {
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return Response.json({ success: false, error: 'לא מחוברת' }, { status: 401 });
    const { data: tenantIdRaw } = await session.rpc('get_user_tenant_id');
    if (!tenantIdRaw) return Response.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    const tenantId = String(tenantIdRaw);
    const limited = checkTenantLimit(tenantId, 'client-page');
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'status');
    const clientId = String(body?.clientId || '');
    if (!['status', 'save', 'revoke'].includes(action)) return Response.json({ success: false, error: 'בקשה לא מוכרת' }, { status: 400 });
    if (!UUID.test(clientId)) return Response.json({ success: false, error: 'חסרה לקוחה' }, { status: 400 });

    if (action !== 'status') {
      const guard = await requireActiveTenant(session);
      if (!guard.ok) return guard.response;
    }

    const { data: client, error: cErr } = await admin.from('clients').select('id, name, phone').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle();
    if (cErr) return fail('read client', cErr);
    if (!client) return Response.json({ success: false, error: 'הלקוחה לא נמצאה' }, { status: 404 });

    let { error: rErr, row } = await currentRow(tenantId, clientId);
    if (rErr) return isMissingTable(rErr) ? Response.json(NEEDS_MIGRATION) : fail('read page', rErr);

    if (action === 'revoke') {
      if (row && pageStatus(row) === 'active') {
        const { error } = await admin.from('client_pages').update({ revoked_at: new Date().toISOString() }).eq('id', row.id).eq('tenant_id', tenantId);
        if (error) return fail('revoke', error);
      }
      ({ row } = await currentRow(tenantId, clientId));
    }

    if (action === 'save') {
      const aftercare = cleanAftercare(body?.aftercare);
      const st = pageStatus(row);
      const renew = st !== 'active' || (row && new Date(row.expires_at).getTime() - Date.now() < CLIENT_PAGE_RENEW_MS);
      if (renew) {
        // Any link not yet revoked (an expired one included) is retired first: the database allows one open link per client.
        if (row && !row.revoked_at) {
          const { error } = await admin.from('client_pages').update({ revoked_at: new Date().toISOString() }).eq('id', row.id).eq('tenant_id', tenantId);
          if (error) return fail('retire old link', error);
        }
        const { error } = await admin.from('client_pages').insert({
          tenant_id: tenantId, client_id: clientId, token_id: newTokenId(), aftercare,
          expires_at: new Date(pageExpiry()).toISOString(),
        });
        if (error) return fail('create', error);
      } else if (row) {
        const { error } = await admin.from('client_pages').update({ aftercare }).eq('id', row.id).eq('tenant_id', tenantId);
        if (error) return fail('save aftercare', error);
      }
      ({ row } = await currentRow(tenantId, clientId));
    }

    const status = pageStatus(row);
    const photos = await photoCounts(tenantId, clientId);
    let url = '';
    let waLink: string | null = null;
    let text = '';
    if (row && status === 'active') {
      const token = buildPageToken(row.token_id, new Date(row.expires_at).getTime());
      url = clientPageUrl(APP_URL, token);
      const { data: st } = await admin.from('settings').select('business_name').eq('tenant_id', tenantId).maybeSingle();
      text = clientPageMessage({ name: client.name, businessName: st?.business_name || '', url, hasPhotos: photos.shown > 0 });
      waLink = waMsgLink(client.phone, text);
    }
    return Response.json({
      success: true,
      state: status,
      url, text, waLink,
      hasPhone: !!String(client.phone || '').replace(/\D/g, ''),
      aftercare: row?.aftercare || '',
      expiresAt: row?.expires_at || null,
      opened: { count: row?.open_count || 0, first: row?.first_opened_at || null, last: row?.last_opened_at || null },
      photos,
    });
  } catch (err) {
    return fail('route', err);
  }
}
