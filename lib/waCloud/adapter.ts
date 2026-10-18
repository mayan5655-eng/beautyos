// lib/waCloud/adapter.ts
//
// SERVER ONLY. The one place that talks to Meta's Cloud API, behind an interface so everything above it is tested
// without a network. Chosen by WA_CLOUD_MODE (lib/waCloud/config.ts):
//
//   mock  no network at all. Returns a fake message id starting "mock." and reports delivered: false, so nothing above
//         can mistake it for a message a client received. The default.
//   live  POST https://graph.facebook.com/<version>/<phone-number-id>/messages with the System User token.
//
// "accepted" from Meta means Meta QUEUED it (it returns a wamid). Whether it reached the phone arrives later on the
// webhook as a status (sent / delivered / read / failed) - app/api/wa-cloud/webhook records it. Never report a
// message as delivered from this response alone.

import { waCloudCredentials, waCloudMode, type WaCloudEnv } from './config.ts';

export type CloudSendResult =
  | { ok: true; messageId: string; mode: 'live' | 'mock'; delivered: false }
  | { ok: false; mode: 'live' | 'mock'; error: string; httpStatus?: number; code?: number };

export interface WaCloudAdapter {
  mode: 'live' | 'mock';
  sendTemplate(toDigits: string, template: Record<string, unknown>): Promise<CloudSendResult>;
  /** Free text. Meta only allows it inside the 24-hour window after the client wrote to the number. */
  sendText(toDigits: string, text: string): Promise<CloudSendResult>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function mockAdapter(): WaCloudAdapter & { sent: { to: string; kind: 'template' | 'text'; body: unknown }[] } {
  const sent: { to: string; kind: 'template' | 'text'; body: unknown }[] = [];
  let seq = 0;
  const id = () => `mock.${Date.now().toString(36)}.${(++seq).toString(36)}`;
  return {
    mode: 'mock',
    sent,
    async sendTemplate(to, template) { sent.push({ to, kind: 'template', body: template }); return { ok: true, messageId: id(), mode: 'mock', delivered: false }; },
    async sendText(to, text) { sent.push({ to, kind: 'text', body: text }); return { ok: true, messageId: id(), mode: 'mock', delivered: false }; },
  };
}

export function liveAdapter(env: WaCloudEnv = process.env, fetchImpl: FetchLike = fetch as unknown as FetchLike): WaCloudAdapter {
  const post = async (payload: Record<string, unknown>): Promise<CloudSendResult> => {
    const cred = waCloudCredentials(env);
    if (!cred) return { ok: false, mode: 'live', error: 'not configured: WA_CLOUD_PHONE_NUMBER_ID / WA_CLOUD_ACCESS_TOKEN missing' };
    const url = `https://graph.facebook.com/${cred.apiVersion}/${encodeURIComponent(cred.phoneNumberId)}/messages`;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.accessToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
      });
      const raw = await res.text();
      let data: { messages?: { id?: string }[]; error?: { message?: string; code?: number } } = {};
      try { data = JSON.parse(raw); } catch { /* non-JSON error page */ }
      const messageId = data.messages?.[0]?.id;
      if (!res.ok || !messageId) {
        return { ok: false, mode: 'live', httpStatus: res.status, code: data.error?.code, error: (data.error?.message || raw || 'no message id').slice(0, 500) };
      }
      return { ok: true, messageId, mode: 'live', delivered: false };
    } catch (e) {
      return { ok: false, mode: 'live', error: (e as Error)?.message || String(e) };
    }
  };
  return {
    mode: 'live',
    sendTemplate: (to, template) => post({ to, type: 'template', template }),
    sendText: (to, text) => post({ to, type: 'text', text: { preview_url: false, body: text } }),
  };
}

let override: WaCloudAdapter | null = null;
/** Tests only: put an adapter in place of the env-chosen one. Pass null to restore. */
export function setWaCloudAdapterForTests(a: WaCloudAdapter | null) { override = a; }

export function resolveWaCloudAdapter(env: WaCloudEnv = process.env): WaCloudAdapter {
  if (override) return override;
  return waCloudMode(env) === 'live' ? liveAdapter(env) : mockAdapter();
}
