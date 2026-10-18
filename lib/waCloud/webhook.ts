// lib/waCloud/webhook.ts
//
// Pure helpers for app/api/wa-cloud/webhook: the X-Hub-Signature-256 check and the parsing of Meta's WhatsApp
// webhook body. No database, no network - the route calls verifySignature() on the RAW body before it builds a
// database client, so a forged delivery costs nothing and reads nothing.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** True only for a body signed by this app secret: header "sha256=<hex of HMAC-SHA256(rawBody, secret)>". Never throws. */
export function verifySignature(rawBody: string, header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || typeof header !== 'string') return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const got = Buffer.from(m[1], 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** The GET subscription handshake. Returns the challenge to echo, or null to refuse. */
export function verifySubscription(params: URLSearchParams, verifyToken: string | null | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  const token = params.get('hub.verify_token') || '';
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params.get('hub.challenge');
}

export type InboundText = { from: string; text: string; id: string; name: string | null };
export type StatusUpdate = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  recipient: string | null;
  billable: boolean | null;
  pricingCategory: string | null;
  pricingModel: string | null;
  error: string | null;
};

type Value = {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from?: string; id?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[];
  statuses?: { id?: string; status?: string; recipient_id?: string; pricing?: { billable?: boolean; category?: string; pricing_model?: string }; errors?: { code?: number; title?: string; message?: string }[] }[];
};

/** Every inbound text and every status update in one webhook body. Unknown shapes are skipped, never thrown on. */
export function parseWebhook(body: unknown): { inbound: InboundText[]; statuses: StatusUpdate[] } {
  const out = { inbound: [] as InboundText[], statuses: [] as StatusUpdate[] };
  const b = body as { object?: string; entry?: { changes?: { field?: string; value?: Value }[] }[] };
  if (!b || b.object !== 'whatsapp_business_account' || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry) {
    for (const change of entry?.changes || []) {
      if (change?.field !== 'messages' || !change.value) continue;
      const v = change.value;
      const names = new Map((v.contacts || []).map((c) => [String(c.wa_id || ''), c.profile?.name || null]));
      for (const m of v.messages || []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? '';
        if (!m.from || !m.id) continue;
        out.inbound.push({ from: String(m.from), text: String(text), id: String(m.id), name: names.get(String(m.from)) ?? null });
      }
      for (const s of v.statuses || []) {
        if (!s.id || !s.status) continue;
        const e = s.errors?.[0];
        out.statuses.push({
          id: String(s.id),
          status: String(s.status),
          recipient: s.recipient_id ? String(s.recipient_id) : null,
          billable: typeof s.pricing?.billable === 'boolean' ? s.pricing.billable : null,
          pricingCategory: s.pricing?.category ?? null,
          pricingModel: s.pricing?.pricing_model ?? null,
          error: e ? `${e.code ?? ''} ${e.title || e.message || ''}`.trim() : null,
        });
      }
    }
  }
  return out;
}

/** Meta's status word -> the delivery_status the message log already uses (lib/greenApi/deliveryStatus.ts). */
export function mapCloudDeliveryStatus(status: string): 'delivered' | 'read' | 'undelivered' | null {
  if (status === 'delivered') return 'delivered';
  if (status === 'read') return 'read';
  if (status === 'failed') return 'undelivered';
  return null;
}
