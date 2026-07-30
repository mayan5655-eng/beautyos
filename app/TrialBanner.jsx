"use client";
// app/TrialBanner.jsx
// The in-app trial notice. Reads a PlanState from lib/planState and says as
// little as it can get away with.
//
// Loudness comes entirely from plan.tone, so the thresholds live in one place
// (lib/planState) rather than being re-decided here:
//   none    -> renders NOTHING. A paying tenant must never be nagged.
//   gentle  -> one slim line, most of the trial.
//   urgent  -> a real card with a way to reach a human, the final 7 days.
//   blocked -> the trial has run out, or the account is paused.
//
// On `blocked`: in Phase 2 this banner is all there is. Phase 3 replaces the
// whole dashboard with the account-hold screen, at which point a blocked tenant
// stops seeing this banner because she never reaches the dashboard shell.
//
// Colour comes from her own primary_color via the pc* props, so the notice
// belongs to her brand rather than looking like a system warning. Hebrew copy
// deliberately contains no em-dashes.

import { supportWhatsAppUrl } from "@/lib/support";

// Hebrew needs a real dual form: "יומיים", not "2 ימים".
function daysHe(n) {
  if (n === 1) return "יום אחד";
  if (n === 2) return "יומיים";
  return `${n} ימים`;
}

export default function TrialBanner({ plan, pc, pcDeep, pcTint, pcGrad, pcShadow }) {
  // Covers 'active', a tenant whose row could not be read, and a trial with no
  // end date: all of them resolve to tone 'none' and show nothing at all.
  if (!plan || plan.tone === "none") return null;

  const days = plan.daysRemaining;

  // ── GENTLE: a quiet single line for most of the trial. No button, no alarm.
  if (plan.tone === "gentle") {
    return (
      <div
        role="status"
        style={{
          maxWidth: 1180,
          margin: "0 auto 14px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: pcTint,
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "9px 15px",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <span
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: "50%", background: pcGrad, flexShrink: 0 }}
        />
        <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)" }}>
          תקופת ההתנסות שלך פעילה, נשארו עוד {daysHe(days)}
        </p>
      </div>
    );
  }

  // ── URGENT / BLOCKED: a card with a title, a reassurance, and a way to talk.
  const blocked = plan.tone === "blocked";
  const paused = blocked && plan.status === "paused";

  let title;
  let body;
  if (paused) {
    // Softer wording on purpose: a paused account is an arrangement, not a debt.
    title = "החשבון בהשהיה";
    body = "כל הנתונים שלך שמורים במלואם. כשתרצי לחזור, אני כאן.";
  } else if (blocked) {
    title = "תקופת ההתנסות הסתיימה";
    body = "כל הנתונים שלך שמורים במלואם. נסדר את ההמשך בהודעה קצרה.";
  } else {
    // days === 1 means under 24 hours are left, so "מחר" could be wrong.
    title =
      days === 1
        ? "תקופת ההתנסות מסתיימת בקרוב"
        : `תקופת ההתנסות מסתיימת בעוד ${daysHe(days)}`;
    body = "אפשר להמשיך לעבוד בלי הפסקה. כתבי לי ונסגור את זה בקלות.";
  }

  return (
    <div
      role="status"
      style={{
        position: "relative",
        overflow: "hidden",
        maxWidth: 1180,
        margin: "0 auto 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        background: "var(--surface)",
        border: `1px solid ${pc}55`,
        borderRadius: 18,
        padding: "15px 19px",
        boxShadow: `0 12px 28px -20px ${pcShadow}`,
      }}
    >
      {/* Accent on the inline-start edge. The shell is dir="rtl", so that is the right. */}
      <div
        aria-hidden
        style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 4, background: pcGrad }}
      />

      <div style={{ flex: 1, minWidth: 210 }}>
        <p
          className="serif"
          style={{ fontSize: 15, fontWeight: 600, color: pcDeep, marginBottom: 3 }}
        >
          {title}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{body}</p>
      </div>

      <a
        href={supportWhatsAppUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="primary-btn"
        style={{
          background: pcGrad,
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          padding: "10px 18px",
          borderRadius: 13,
          textDecoration: "none",
          whiteSpace: "nowrap",
          boxShadow: `0 8px 18px ${pcShadow}`,
          flexShrink: 0,
        }}
      >
        דברי איתי בוואטסאפ
      </a>
    </div>
  );
}
