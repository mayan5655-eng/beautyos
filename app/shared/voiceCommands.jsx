"use client";
// app/shared/voiceCommands.jsx — what she can say to the microphone and what the search understands, and the list that shows it.
//
// Moved out of app/beautyos.jsx by scripts/extract-module.mjs, byte for byte: nothing between the two markers below was
// rewritten. app/beautyos.jsx imports every name this file exports; scripts/check-screens.mjs holds the two lists and the
// declarations equal. When a test reads app/beautyos.jsx, scripts/test-source-view.mjs puts this body back in its place.
import { PAYMENT_NOTICES_HE } from "@/lib/legalReceipts/policy";
import { tr, trv } from "@/lib/i18n/tr";

/* @module-body */
// Beauty Voice — the full set of spoken commands the assistant understands.
// The `intent` values mirror the actions in app/api/voice-intent/route.ts; each
// row carries a friendly label + one example phrase to show users what they can
// say. Display-only: this drives the "מה אפשר לומר?" help list and does not
// affect recognition or dispatch.
const VOICE_COMMANDS = [
  { intent: "book_appointment",    icon: "✦",  label: "קביעת תור",      example: "קבעי תור לרונית מחר בעשר וחצי" },
  { intent: "show_day",            icon: "◴",  label: "התורים של היום",  example: "מה יש לי מחר?" },
  { intent: "revenue_summary",     icon: "₪",  label: "סיכום הכנסות",    example: "כמה הכנסתי החודש?" },
  { intent: "cancel_appointment",  icon: "✕",  label: "ביטול תור",       example: "בטלי את התור של דנה מחר" },
  { intent: "call_client",         icon: "✆",  label: "חיוג ללקוחה",     example: "תתקשרי לרונית" },
  { intent: "create_receipt",      icon: "🧾", label: "רישום תשלום",      example: "תרשמי תשלום של 200 שקל לרונית" },
];

// Section metadata for the global top-bar search dropdown — render order,
// Hebrew header label, and type icon. Display-only; the result objects come
// from globalResults and are routed by openSearchResult.
const SEARCH_GROUPS = [
  { type: "client",  label: "לקוחות",  icon: "♥" },
  { type: "appt",    label: "תורים",   icon: "◴" },
  { type: "lead",    label: "פניות",   icon: "✦" },
  { type: "service", label: "שירותים", icon: "✂" },
  { type: "receipt", label: PAYMENT_NOTICES_HE,   icon: "🧾" },
];

// Compact "what can I say?" list for the Beauty Voice modal. Uses runtime CSS
// vars (--pc etc.) so it needs no props. Purely presentational.
function VoiceCommandList() {
  return (
    <div style={{ marginTop: 16, textAlign: "right" }}>
      <p style={{ fontSize:"var(--t-xs)", fontWeight: 700, color: "var(--ink-2)", marginBottom: 8 }}>{tr("מה אפשר לומר?")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {VOICE_COMMANDS.map((c) => (
          <div key={c.intent} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius:"var(--r-sm)" }}>
            <span style={{ width: 27, height: 27, borderRadius:"var(--r-xs)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize:"var(--t-sm)", color: "var(--pc)", background: "var(--pc-tint)" }}>{c.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize:"var(--t-sm)", fontWeight: 700, color: "var(--ink)" }}>{trv(c.label)}</span>
              <span style={{ display: "block", fontSize:"var(--t-sm)", color: "var(--ink-2)" }}>&ldquo;{c.example}&rdquo;</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
/* @module-end */
export {
  SEARCH_GROUPS, VOICE_COMMANDS, VoiceCommandList,
};
