// lib/protocolBook/book.ts — "ספר הפרוטוקולים": who sees what, and the book's own labels. PURE: no React, no database.
//
// ── Flag ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// NEXT_PUBLIC_PROTOCOL_BOOK empty = the book does not exist: no menu entry, /dashboard/protocol-book answers 404, the
// link routes refuse, no protocol shows on an appointment or a client card.
//
// ── Free and full ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Every business with the book on sees the free protocols of her own fields (cosmetics, nails, or both). The full book is
// an upgrade at extra cost. Billing for it is NOT live: nothing here sells anything, no price and no buy button exist, and
// a protocol she has no access to is simply not listed. Access to the full book today comes only from a grant a platform
// admin sets: settings.automations.feature_flags.protocol_book_full = true (or the same key in settings.feature_flags).
// feature_flags is a protected key the settings save route never lets a tenant write (lib/settingsColumns.ts), so she
// cannot grant it to herself. automations.screens is NOT read here for the same reason: a tenant can write that one.
import type { FieldKey } from '../businessFields.ts';
import { FACIAL } from './facial.ts';
import { NAILS } from './nails.ts';
import type { BookLang, Protocol } from './types.ts';
import { businessFieldsOf, FIELD_KEYS } from '../businessFields.ts';
import { isCertified } from './certificate.ts';
import { protocolFormOf } from './questions.ts';

export * from './types.ts';

type Env = Record<string, string | undefined>;

export function protocolBookEnabled(env: Env = { NEXT_PUBLIC_PROTOCOL_BOOK: process.env.NEXT_PUBLIC_PROTOCOL_BOOK }): boolean {
  const v = String(env.NEXT_PUBLIC_PROTOCOL_BOOK || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export const ALL_PROTOCOLS: Protocol[] = [...FACIAL, ...NAILS];

export const protocolByKey = (key: unknown): Protocol | undefined =>
  typeof key === 'string' ? ALL_PROTOCOLS.find((p) => p.key === key) : undefined;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The admin grant. Only the protected flag bags count (see the header). */
export function hasFullBook(settings: { automations?: unknown; feature_flags?: unknown } | null | undefined): boolean {
  const fromAutos = obj(obj(settings?.automations).feature_flags).protocol_book_full;
  const fromColumn = obj(settings?.feature_flags).protocol_book_full;
  return fromColumn === true || (fromColumn === undefined && fromAutos === true);
}

/** certified: her cosmetician certificate is on file and not rejected (lib/protocolBook/certificate.ts). Only the facial chapters ask for it. */
export type Access = { fields: FieldKey[]; full: boolean; certified: boolean; isAdmin?: boolean };

/** Her access, from her settings row. The one place it is derived, so every reader (page, routes, appointment card, forms) agrees. */
export function accessOf(
  settings: { automations?: unknown; feature_flags?: unknown; business_fields?: unknown } | null | undefined,
  isAdmin = false,
): Access {
  return { fields: isAdmin ? [...FIELD_KEYS] : businessFieldsOf(settings), full: hasFullBook(settings), certified: isCertified(settings), isAdmin };
}

/** May she open this protocol? A platform admin sees everything, to check it. */
export function canOpen(p: Protocol, a: Access): boolean {
  if (a.isAdmin) return true;
  if (!a.fields.includes(p.field)) return false;
  if (p.field === 'cosmetics' && !a.certified) return false;
  return p.tier === 'free' || a.full;
}

/** The protocols she sees, in book order. */
export function visibleProtocols(a: Access): Protocol[] {
  return ALL_PROTOCOLS.filter((p) => canOpen(p, a));
}

/** Total time of the treatment steps, [min, max] in minutes. */
export function totalMinutes(p: Protocol): [number, number] {
  return p.steps.reduce<[number, number]>((t, s) => [t[0] + s.min[0], t[1] + s.min[1]], [0, 0]);
}

// ── Protocol attached to a service ──────────────────────────────────────────────────────────────────────────────────────
// settings.automations.protocol_links = { [service id]: protocol key }. In automations (private), never in branding
// (public, read by the booking page). Written only by /api/protocol-book/link, which checks she may open the protocol.

export const LINKS_KEY = 'protocol_links';

/** Her links, cleaned: only known protocol keys, string ids. */
export function protocolLinks(settings: { automations?: unknown } | null | undefined): Record<string, string> {
  const raw = obj(obj(settings?.automations)[LINKS_KEY]);
  const out: Record<string, string> = {};
  for (const [id, key] of Object.entries(raw)) if (id && protocolByKey(key)) out[id] = key as string;
  return out;
}

/** The protocol attached to this service, if she may still open it. */
export function protocolForService(
  settings: { automations?: unknown; feature_flags?: unknown; business_fields?: unknown } | null | undefined,
  serviceId: unknown,
): Protocol | undefined {
  if (serviceId === null || serviceId === undefined || serviceId === '') return undefined;
  const p = protocolByKey(protocolLinks(settings)[String(serviceId)]);
  return p && canOpen(p, accessOf(settings)) ? p : undefined;
}

/** Set or clear one link, returning the new map. A null key removes it. */
export function withLink(links: Record<string, string>, serviceId: string, key: string | null): Record<string, string> {
  const next = { ...links };
  if (key && protocolByKey(key)) next[serviceId] = key;
  else delete next[serviceId];
  return next;
}

/** Client questions for the protocols of these services, de-duplicated, in her language. */
export function questionsFor(protocols: Protocol[], lang: BookLang): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of protocols) for (const q of p.text[lang].ask) if (!seen.has(q)) { seen.add(q); out.push(q); }
  return out;
}

export function bookLangOf(lang: unknown): BookLang {
  return lang === 'ar' || lang === 'en' ? lang : 'he';
}

// ── The protocol questionnaires in the forms lists ─────────────────────────────────────────────────────────────────────
/**
 * May this form be OFFERED to her (client card "טפסים", a service's "טופס חובה")? Every ordinary form: yes. A protocol
 * questionnaire: only with the book on, for a protocol she may open. A form already sent stays readable either way.
 */
export function protocolFormAllowed(
  formKey: string,
  settings: { automations?: unknown; feature_flags?: unknown; business_fields?: unknown } | null | undefined,
  enabled: boolean = protocolBookEnabled(),
): boolean {
  const f = protocolFormOf(formKey);
  if (!f) return true;
  if (!enabled) return false;
  const p = protocolByKey(f.key);
  return !!p && canOpen(p, accessOf(settings));
}

/** The service row an appointment points at. Appointments store the treatment's name; a combined booking joins names with " + ". */
export function serviceIdForAppt(services: { id: unknown; name?: unknown }[] | null | undefined, serviceName: unknown): string | null {
  const name = String(serviceName || '').trim();
  if (!name) return null;
  const find = (n: string) => (services || []).find((s) => String(s.name || '').trim() === n);
  const hit = find(name) || find(name.split(' + ')[0].trim());
  return hit && hit.id !== null && hit.id !== undefined ? String(hit.id) : null;
}
