// lib/waCloud/autoButtons.ts
//
// SERVER ONLY. A client's tap on a quick-reply button of an automatic message (lib/waCloud/autoTemplates.ts), as it
// arrives on the signed Cloud webhook (app/api/wa-cloud/webhook):
//
//   מאשרת הגעה / צריכה לבטל   the appointment changes EXACTLY as the confirm link would: the webhook hands the action to
//                             the /api/confirm handler itself (applyAction), with a freshly signed token, so the
//                             cancellation window, deposit holds, the owner's notice, the gap-fill question and the
//                             waitlist offer all run as they do for a tap on the link.
//   לא לשלוח לי הודעות        no more automatic messages from this business to this number (wa_auto_optouts).
//
// Two checks before anything changes: the payload carries our signature (autoTemplates.parseButtonPayload), and the tap
// comes from the very number this appointment's automatic message was sent to (the cost log keeps a hash of it). A
// forwarded message tapped from another phone does nothing.
//
// The answer to the client is free text inside the 24-hour window her tap opened (a service conversation, not billed),
// and only while the feature is on: with the kill switch off the action still happens and nothing is sent.

import { parseButtonPayload, type ButtonAction } from './autoTemplates.ts';
import { recordAutoOptOut } from './auto.ts';
import { recipientHash } from './send.ts';
import { autoConfig } from './autoConfig.ts';
import { resolveWaCloudAdapter, type WaCloudAdapter } from './adapter.ts';
import type { WaCloudEnv } from './config.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export type ActionAnswer = { success?: boolean; message?: string; error?: string; bookUrl?: string; businessName?: string };
export type ApplyAction = (appointmentId: string, action: 'confirm' | 'cancel') => Promise<ActionAnswer>;

export type ButtonResult =
  | { handled: false }
  | { handled: true; action: ButtonAction; outcome: 'applied' | 'refused' | 'opted_out' | 'unknown_sender' | 'failed'; reply: string | null };

export const OPT_OUT_BUTTON_ACK = (business: string) =>
  `קיבלנו. מעכשיו לא יישלחו אלייך הודעות אוטומטיות מ${business}. אם תרצי, אפשר תמיד לפנות לעסק ישירות.`;

/** The text she gets back after a confirm or cancel tap: the confirm handler's own words. */
export function answerText(action: 'confirm' | 'cancel', a: ActionAnswer): string {
  if (a.success) {
    const base = String(a.message || (action === 'confirm' ? 'נתראה בתור 🌸' : 'התור בוטל.'));
    return action === 'cancel' && a.bookUrl ? `${base}\nלקביעת תור חדש: ${a.bookUrl}` : base;
  }
  return String(a.error || 'לא הצלחנו לעדכן את התור. אפשר לפנות לעסק ישירות.');
}

export async function handleAutoButton(p: {
  db: Db;
  from: string;
  payload: string | null | undefined;
  applyAction: ApplyAction;
  adapter?: WaCloudAdapter;
  env?: WaCloudEnv;
}): Promise<ButtonResult> {
  const env = p.env || process.env;
  const parsed = parseButtonPayload(p.payload, env);
  if (!parsed) return { handled: false };
  const { action, appointmentId } = parsed;

  // The tap must come from the number the automatic message for this appointment went to.
  const { data: rows, error } = await p.db.from('wa_cloud_messages').select('tenant_id')
    .eq('appointment_id', appointmentId).eq('recipient_hash', recipientHash(p.from)).eq('status', 'accepted').limit(1);
  if (error || !Array.isArray(rows) || rows.length === 0) {
    console.warn(`[wa-auto-button] ignored: no automatic message for ${appointmentId} to this sender`);
    return { handled: true, action, outcome: 'unknown_sender', reply: null };
  }
  const tenantId = String(rows[0].tenant_id);

  let reply: string;
  let outcome: 'applied' | 'refused' | 'opted_out' | 'failed';
  if (action === 'optout') {
    let business = 'העסק';
    try {
      const { data: st } = await p.db.from('settings').select('business_name').eq('tenant_id', tenantId).maybeSingle();
      business = String(st?.business_name || '').trim() || business;
    } catch { /* the generic name */ }
    const ok = await recordAutoOptOut(p.db, tenantId, p.from, 'button');
    outcome = ok ? 'opted_out' : 'failed';
    reply = ok ? OPT_OUT_BUTTON_ACK(business) : 'משהו השתבש ולא הצלחנו לרשום את הבקשה. אפשר לכתוב "הסר" ונטפל בזה.';
  } else {
    let a: ActionAnswer;
    try { a = await p.applyAction(appointmentId, action); } catch (e) { a = { success: false, error: undefined }; console.error('[wa-auto-button] action threw:', (e as Error)?.message); }
    outcome = a.success ? 'applied' : a.error ? 'refused' : 'failed';
    reply = answerText(action, a);
  }

  const cfg = autoConfig(env);
  if (!cfg.enabled) return { handled: true, action, outcome, reply: null };
  const adapter = p.adapter || resolveWaCloudAdapter(env);
  const sent = await adapter.sendText(p.from, reply);
  if (!sent.ok) console.error('[wa-auto-button] reply failed:', sent.error);
  else if (cfg.active) {
    try {
      await p.db.from('whatsapp_messages').insert({
        tenant_id: tenantId, recipient_name: null, recipient_phone: p.from, message_body: reply, message_type: 'wa_auto_reply', status: 'sent', green_api_id: sent.messageId,
      });
    } catch { /* the reply went; the log is a convenience */ }
  }
  return { handled: true, action, outcome, reply };
}
