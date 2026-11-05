// lib/clientPageData.ts
//
// SERVER ONLY. The database side of the client's personal results page. Runs on the service-role key (client_pages and
// treatment_results give anon nothing), so this file is the authorisation: a page is read ONLY through a token that
// verifies (lib/clientPage.parsePageToken) AND whose row is there, not revoked, not expired. Every query below is then
// scoped by the tenant and client ON THAT ROW - never by anything the visitor sent.
//
// Degrades honestly before add_client_pages.sql has been run: `needsMigration` for the owner's side, "not found" for a visitor.

import { parsePageToken, consentedResultsFor, treatmentsFrom, firstName, bookingPath, bookingHref, pageStatus, aftercareLines, type PageResult, type PageTreatment } from './clientPage.ts';
import { publicAccent } from './branding.js';
import { loyaltyConfig, loyaltyState, publicCard, type PublicLoyaltyCard } from './loyalty.js';

type Db = any; // a service-role supabase client; typed loosely like the other server libs

const isMissingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/does not exist|schema cache/i.test(String(e.message || '')) && !/column/i.test(String(e.message || ''))));
const isMissingColumn = (e: any) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(String(e.message || '')));

export const israelToday = (now: Date = new Date()): string => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

export type PublicClientPage = {
  businessName: string;
  logoUrl: string;
  accent: string;
  clientName: string;
  treatments: PageTreatment[];
  results: PageResult[];
  aftercare: string[];
  bookPath: string;
  bookHref: string;
  /** For the opened-beacon only; never rendered. */
  pageId: string;
  /** Her loyalty stamp card, or null when the business has it off. Only the card: counts and the reward text (lib/loyalty publicCard). */
  loyalty?: PublicLoyaltyCard | null;
};

export type LoadResult = { kind: 'ok'; page: PublicClientPage } | { kind: 'gone' } | { kind: 'error' };

/** Everything the public page shows for one token. 'gone' = bad/revoked/expired/unknown link (all the same to a visitor). */
export async function loadPublicClientPage(db: Db, token: string, now: Date = new Date()): Promise<LoadResult> {
  const parsed = parsePageToken(token, now.getTime());
  if (!parsed) return { kind: 'gone' };

  const { data: row, error } = await db
    .from('client_pages')
    .select('id, tenant_id, client_id, aftercare, expires_at, revoked_at')
    .eq('token_id', parsed.tokenId)
    .maybeSingle();
  if (error) return isMissingTable(error) ? { kind: 'gone' } : { kind: 'error' };
  if (!row || pageStatus(row, now.getTime()) !== 'active') return { kind: 'gone' };

  const tenantId = String(row.tenant_id);
  const clientId = String(row.client_id);
  const today = israelToday(now);

  const [clientQ, settingsQ, tenantQ, apptsQ, resultsQ] = await Promise.all([
    db.from('clients').select('name').eq('tenant_id', tenantId).eq('id', clientId).maybeSingle(),
    db.from('settings').select('business_name, branding, primary_color, automations').eq('tenant_id', tenantId).maybeSingle(),
    db.from('tenants').select('slug').eq('id', tenantId).maybeSingle(),
    db.from('appointments').select('service, date, confirmation_status, kind').eq('tenant_id', tenantId).eq('client_id', clientId).lte('date', today).order('date', { ascending: false }).limit(200),
    db.from('treatment_results')
      .select('id, client_id, service_name, before_url, after_url, caption, sessions, consent_name, consent_given_on, consent_confirmed, consent_confirmed_at')
      .eq('tenant_id', tenantId).eq('client_id', clientId).order('created_at', { ascending: false }).limit(40),
  ]);
  if (clientQ.error || settingsQ.error || apptsQ.error) return { kind: 'error' };
  if (!clientQ.data) return { kind: 'gone' }; // the client was erased: the page goes with her
  // A results read that fails (column not there yet, hiccup) shows no photos - never a photo without the consent check.
  const results = resultsQ.error ? [] : consentedResultsFor(clientId, resultsQ.data);

  const s = settingsQ.data || {};
  const branding = s.branding && typeof s.branding === 'object' ? s.branding : {};
  const treatments = treatmentsFrom(apptsQ.data, today);
  const path = bookingPath(tenantQ.data?.slug, tenantId);
  const clientName = String(clientQ.data.name || '').trim();
  const loyalty = await loadLoyaltyCard(db, tenantId, clientId, s, now);
  return {
    kind: 'ok',
    page: {
      businessName: String(s.business_name || '').trim(),
      logoUrl: String(branding.logo_url || ''),
      accent: publicAccent(s),
      clientName,
      treatments,
      results,
      aftercare: aftercareLines(String(row.aftercare || '')),
      bookPath: path,
      bookHref: bookingHref(path, clientName, treatments[0]?.service),
      pageId: String(row.id),
      loyalty,
    },
  };
}

/**
 * Her stamp card for the public page: computed here on the server from this client's own receipts, voids and loyalty rows (all
 * scoped by the tenant and client on the link's row), and reduced to publicCard - so no receipt, amount, date or reason leaves.
 * Before add_loyalty_2026-11-05.sql has run, the two loyalty tables read as empty: the card is still right for anything done at the
 * till. Any other failure shows no card rather than a wrong one.
 */
export async function loadLoyaltyCard(db: Db, tenantId: string, clientId: string, settingsRow: any, now: Date = new Date()): Promise<PublicLoyaltyCard | null> {
  const config = loyaltyConfig(settingsRow || {});
  if (!config.enabled) return null;
  try {
    const [rq, sq, redq, adjq] = await Promise.all([
      db.from('receipts').select('id, client_id, appointment_id, service, amount, payment_method, items, created_at').eq('tenant_id', tenantId).eq('client_id', clientId).order('created_at', { ascending: true }).limit(1000),
      db.from('service_prices').select('name').eq('tenant_id', tenantId),
      db.from('loyalty_redemptions').select('client_id, receipt_id, reward, created_at').eq('tenant_id', tenantId).eq('client_id', clientId),
      db.from('loyalty_adjustments').select('client_id, delta, reason, created_at').eq('tenant_id', tenantId).eq('client_id', clientId),
    ]);
    if (rq.error) return null;
    const receipts = rq.data || [];
    const ids = receipts.map((r: any) => r.id);
    let voids: any[] = [];
    if (ids.length) {
      const vq = await db.from('receipt_voids').select('receipt_id, credit_status').eq('tenant_id', tenantId).in('receipt_id', ids);
      if (vq.error && !isMissingTable(vq.error)) return null; // a void we cannot see could show a stamp that is not hers
      voids = vq.data || [];
    }
    const tableRows = (q: any) => (q.error ? (isMissingTable(q.error) ? [] : null) : q.data || []);
    const redemptions = tableRows(redq), adjustments = tableRows(adjq);
    if (redemptions === null || adjustments === null) return null;
    const serviceNames = sq.error ? null : (sq.data || []).map((x: any) => String(x.name || '').trim()).filter(Boolean);
    return publicCard(loyaltyState({ config, clientId, receipts, voids, redemptions, adjustments, serviceNames, now: now.getTime() }));
  } catch {
    return null;
  }
}

/** Record that the client opened her page. Counts only; returns false when nothing was recorded. */
export async function recordOpen(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  const parsed = parsePageToken(token, now.getTime());
  if (!parsed) return false;
  const { data: row, error } = await db.from('client_pages').select('id, expires_at, revoked_at, first_opened_at, open_count').eq('token_id', parsed.tokenId).maybeSingle();
  if (error || !row || pageStatus(row, now.getTime()) !== 'active') return false;
  const iso = now.toISOString();
  const { error: upErr } = await db.from('client_pages')
    .update({ first_opened_at: row.first_opened_at || iso, last_opened_at: iso, open_count: (Number(row.open_count) || 0) + 1 })
    .eq('id', row.id);
  return !upErr;
}

export { isMissingTable, isMissingColumn };
