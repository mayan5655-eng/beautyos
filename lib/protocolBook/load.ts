// lib/protocolBook/load.ts — SERVER ONLY. What the book page needs about the caller, read from HER session.
//
// The full-book protocols must never reach a browser that may not open them, so this decides access on the server and
// the page passes only the protocols she can open. Strictly tenant-scoped: the tenant comes from get_user_tenant_id() on
// her session, never from the URL.
import type { FieldKey } from '../businessFields.ts';
import { businessFieldsOf, FIELD_KEYS } from '../businessFields.ts';
import { ACTIVE_OR_NULL } from '../serviceActive.js';
import { isMissingColumnError } from '../pgError.ts';
import { langOfSettings } from '../i18n/core.ts';
import { hasFullBook, protocolLinks, visibleProtocols, bookLangOf } from './book.ts';
import type { BookLang, Protocol } from './types.ts';

type Row = Record<string, unknown>;
// The narrow slice of the Supabase client this file uses (no generated DB types in the project).
type Sb = {
  rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }>;
  from(t: string): {
    select(c: string): {
      eq(c: string, v: unknown): {
        maybeSingle(): PromiseLike<{ data: Row | null; error: { message?: string; code?: string } | null }>;
        or(f: string): PromiseLike<{ data: Row[] | null; error: unknown }>;
      };
    };
  };
};

export type BookContext = {
  tenantId: string;
  fields: FieldKey[];
  full: boolean;
  isAdmin: boolean;
  lang: BookLang;
  protocols: Protocol[];
  services: { id: string; name: string }[];
  links: Record<string, string>;
};

export async function loadBookContext(session: Sb, isAdmin: boolean): Promise<BookContext | null> {
  const { data: tenantId, error } = await session.rpc('get_user_tenant_id');
  if (error || !tenantId) return null;
  const tid = String(tenantId);

  // business_fields arrives with a hand-run migration; without it, read the rest and fall back to cosmetics.
  let res = await session.from('settings').select('automations, branding, business_fields').eq('tenant_id', tid).maybeSingle();
  if (res.error && isMissingColumnError(res.error)) res = await session.from('settings').select('automations, branding').eq('tenant_id', tid).maybeSingle();
  const settings = res.data || {};

  const fields = isAdmin ? [...FIELD_KEYS] : businessFieldsOf(settings);
  const full = hasFullBook(settings);
  const svc = await session.from('service_prices').select('id, name').eq('tenant_id', tid).or(ACTIVE_OR_NULL);
  const services = ((svc.data || []) as Row[])
    .filter((s) => s.id !== null && s.id !== undefined && typeof s.name === 'string' && s.name.trim())
    .map((s) => ({ id: String(s.id), name: String(s.name) }));

  return {
    tenantId: tid,
    fields,
    full,
    isAdmin,
    lang: bookLangOf(langOfSettings(settings)),
    protocols: visibleProtocols({ fields, full, isAdmin }),
    services,
    links: protocolLinks(settings),
  };
}
