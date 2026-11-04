// lib/skinScanOwnerMessage.ts
//
// The hot-lead note the owner gets (in-app + push, kind "skin_hot_lead") after a visitor asks for her skin report.
// Lives here, not in app/api/skin-scan/send/route.js, so it can be unit-tested (a route file may only export handlers).
//
// The closing line follows what sendWhatsApp() actually did with the CLIENT's report. Until 2026-11-04 it always said
// "היא קיבלה את הדוח המלא לוואטסאפ", even when the report had only been queued (utility auto-send off, the central
// number down): the client had received nothing and the report was waiting for the owner to send. Never claim sent
// when only queued. (tested in test-skin-scan-owner-message.ts)

export type ClientSendOutcome = { ok?: boolean; queued?: boolean } | null | undefined;

export const OWNER_LINE_DELIVERED = "היא קיבלה את הדוח המלא לוואטסאפ. זה זמן מצוין ליצור קשר! 💗";
export const OWNER_LINE_QUEUED =
  "הדוח שלה עוד לא נשלח: הוא מחכה לך ב\"הודעות מוכנות לשליחה\". שלחי לה אותו כשנוח לך, זה זמן מצוין ליצור קשר! 💗";
export const OWNER_LINE_FAILED = "לא הצלחנו לשלוח לה את הדוח לוואטסאפ. כדאי ליצור איתה קשר ישירות 💗";

export function ownerClosingLine(outcome: ClientSendOutcome): string {
  if (outcome?.queued) return OWNER_LINE_QUEUED;
  if (outcome?.ok) return OWNER_LINE_DELIVERED;
  return OWNER_LINE_FAILED;
}

export function buildOwnerMessage(
  report: { score?: unknown; skin_type?: unknown; clinical_treatment?: unknown },
  clientName: string,
  clientPhone: string,
  outcome: ClientSendOutcome
): string {
  const lines: string[] = [];
  lines.push(`🔥 ליד חדש מסורק העור!`);
  lines.push("");
  if (clientName) lines.push(`👤 שם: ${clientName}`);
  lines.push(`📞 טלפון: ${clientPhone}`);
  lines.push(`💯 ציון עור: ${report.score}/100`);
  lines.push(`🧴 סוג עור: ${report.skin_type}`);
  if (report.clinical_treatment) lines.push(`💉 טיפול מומלץ: ${report.clinical_treatment}`);
  lines.push("");
  lines.push(ownerClosingLine(outcome));
  return lines.join("\n");
}
