// lib/leads/statuses.ts
// Single source of truth for lead status keys and their Hebrew labels.
//
// These keys previously lived in three places kept in sync by hand:
//   app/dashboard/leads/LeadsClient.tsx
//   app/beautyos.jsx
//   app/api/leads/send-bulk/route.js
// When the UI offered a status the API did not allow, bulk sending for that
// status failed with "סטטוס לא תקין". Importing from here removes that risk.
//
// leads.status is a free-text column, so these keys are simply the canonical
// set the app writes and reads - there is no DB enum to keep in step.
//
// Colors are deliberately NOT here: the two screens use different palettes and
// each keeps its own. Only keys and labels are shared.

export type LeadStatusKey =
  | 'new'
  | 'no_answer'
  | 'awaiting_reply'
  | 'in_progress'
  | 'quote_sent'
  | 'scheduled'
  | 'no_show'
  | 'follow_up_later'
  | 'closed'
  | 'irrelevant';

// Canonical statuses, in the order the UI shows them - sequenced as the actual
// pipeline a lead moves through, from first contact to outcome.
export const LEAD_STATUS_KEYS: LeadStatusKey[] = [
  'new',
  'no_answer',
  'awaiting_reply',
  'in_progress',
  'quote_sent',
  'scheduled',
  'no_show',
  'follow_up_later',
  'closed',
  'irrelevant',
];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  no_answer: 'אין מענה',
  awaiting_reply: 'ממתינה לתשובה',
  in_progress: 'בטיפול',
  quote_sent: 'נשלח מחיר',
  scheduled: 'נקבע תור',
  no_show: 'לא הגיע',
  follow_up_later: 'למעקב בהמשך',
  closed: 'נסגר',
  irrelevant: 'לא רלוונטי',
};

// Legacy values that may still exist on rows created before the status model
// above. Displayed read-only so old leads never render blank; never offered as
// canonical buttons or chips.
//
// 'new' was promoted to a canonical status and removed from here: the Facebook
// webhook writes it on every incoming lead, so it needs real buttons and to be
// a valid bulk-send target.
export const LEGACY_LEAD_STATUS_LABELS: Record<string, string> = {
  contacted: 'יצרתי קשר',
  converted: 'מומר ✓',
  lost: 'לא רלוונטי',
};
