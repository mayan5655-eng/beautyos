// lib/grow/adminOnboarding.ts
//
// What the admin panel's "unmatched Grow updates" list (app/dashboard/admin/GrowUnmatched.tsx) hands to the browser, and the tenant
// search it uses. Pure, so test-grow-ops-admin.ts covers it. The browser gets the business id MASKED (maskUserId), never the raw
// user_id, and never a key (none is stored with an update).

import { maskUserId } from './payload.ts';

export type AttachRow = {
  id: string;
  receivedAt: string;
  businessCode: string;
  trackingCode: string;
  businessTitle: string;
  name: string;
  packageName: string;
  statusWords: string;
  hadKey: boolean;
};

export type AttachTenant = { id: string; name: string };

export type UnmatchedRaw = {
  id: string;
  received_at: string;
  user_id: string | null;
  tracking_code: string | null;
  business_title: string | null;
  name: string | null;
  package_name: string | null;
  tracking_status_message: string | null;
  grow_status: string | null;
  grow_error: string | null;
  had_api_key: boolean | null;
};

export function formatIlTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function toAttachRow(r: UnmatchedRaw): AttachRow {
  return {
    id: r.id,
    receivedAt: formatIlTime(r.received_at),
    businessCode: r.user_id ? maskUserId(r.user_id) : '',
    trackingCode: r.tracking_code || '',
    businessTitle: r.business_title || '',
    name: r.name || '',
    packageName: r.package_name || '',
    statusWords: r.tracking_status_message || r.grow_error || r.grow_status || '',
    hadKey: r.had_api_key === true,
  };
}

/** Tenants whose name contains the query (case-insensitive), or whose id starts with it. At most `max`; an empty query finds nothing. */
export function searchTenants(tenants: AttachTenant[], q: string, max = 8): AttachTenant[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return tenants.filter((t) => t.name.toLowerCase().includes(s) || t.id.toLowerCase().startsWith(s)).slice(0, max);
}
