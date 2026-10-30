"use client";
// app/FeedbackBanner.jsx
// The "how is it going?" card (rules in lib/feedbackBanner). It pops up on the home screen only, asks for stars, and a tap on a star opens
// the five emoji-face questions and the free text. It is about Kalmea, not her business, so it wears Kalmea's colours, never her accent.
//
// It asks the server before it appears: until add_product_feedback_2026-10-30.sql runs, /api/feedback answers available:false and the card
// stays away, because five answers with nowhere to go would be worse than no question. It steps aside for the first-run tour and anything
// else she has open (the suppress prop). A failed save keeps the form and her words on screen and says so; only a real save thanks her.

import { useEffect, useRef, useState } from "react";
import {
  FEEDBACK_QUESTIONS, FEEDBACK_FACES, FEEDBACK_SHOW_DELAY_MS, FEEDBACK_MAX_TEXT, NOT_YET,
  feedbackEligible, feedbackStorageKey, readFeedbackState, feedbackDue, snoozeFeedback,
} from "@/lib/feedbackBanner";

const THANKS_MS = 4000;
const STORE_ERROR = "לא הצלחנו לשמור הפעם, והתשובות שלך עדיין כאן. נסי לשלוח שוב בעוד רגע.";

const readState = (key) => {
  try { return readFeedbackState(window.localStorage.getItem(key)); } catch { return readFeedbackState(null); }
};
const writeState = (key, state) => {
  try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* private window: it just comes back next time */ }
};

function Stars({ value, onPick, size }) {
  return (
    <div role="radiogroup" aria-label="דירוג בכוכבים" style={{ display: "flex", justifyContent: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={n === 1 ? "כוכב אחד" : `${n} כוכבים`}
          data-testid={`feedback-star-${n}`}
          onClick={() => onPick(n)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ fill: n <= value ? "var(--k-green)" : "none", stroke: "var(--k-green)", strokeWidth: 1.5, strokeLinejoin: "round" }}>
            <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6-4.5-4.2 6.1-.8z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function Faces({ question, value, onPick }) {
  return (
    <div role="radiogroup" aria-label={question.label} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
      {FEEDBACK_FACES.map((f) => {
        const on = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={f.label}
            data-testid={`feedback-${question.id}-${f.value}`}
            onClick={() => onPick(f.value)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, minHeight: 56, padding: "4px 0",
              fontFamily: "inherit", cursor: "pointer", color: "var(--ink-2)", borderRadius: "var(--r-sm)",
              background: on ? "var(--k-petal)" : "transparent", border: `1px solid ${on ? "var(--k-green)" : "transparent"}`,
            }}
          >
            <span aria-hidden style={{ fontSize: 24, lineHeight: 1.1, filter: value && !on ? "grayscale(0.7)" : "none" }}>{f.face}</span>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 500 }}>{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FeedbackBanner({ plan, tenantId, counts, isDemo, suppress }) {
  const eligible = feedbackEligible({ status: plan?.status, trialStartedAt: plan?.trialStartedAt, isDemo, appointments: counts?.appointments || 0, clients: counts?.clients || 0 });
  const storageKey = feedbackStorageKey(tenantId);
  const [phase, setPhase] = useState("hidden"); // hidden | ask | form | thanks
  const [rating, setRating] = useState(0);
  const [answers, setAnswers] = useState({});
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Closed for this visit, even where localStorage is blocked and cannot remember it.
  const closedRef = useRef(false);

  useEffect(() => {
    if (phase !== "hidden" || !eligible || suppress || !tenantId || closedRef.current) return;
    if (!feedbackDue(readState(storageKey), Date.now())) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/feedback");
        const json = await res.json();
        if (stale) return;
        if (json?.submitted) writeState(storageKey, { ...readState(storageKey), done: true });
        else if (json?.available) setPhase("ask");
      } catch { /* no answer from the server: no question today */ }
    }, FEEDBACK_SHOW_DELAY_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [phase, eligible, suppress, tenantId, storageKey]);

  useEffect(() => {
    if (phase !== "thanks") return;
    const timer = setTimeout(() => setPhase("hidden"), THANKS_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "hidden" || (phase === "ask" && suppress)) return null;

  const snooze = () => {
    closedRef.current = true;
    writeState(storageKey, snoozeFeedback(readState(storageKey), Date.now()));
    setPhase("hidden");
  };
  const pickStars = (n) => { setRating(n); setError(""); if (phase === "ask") setPhase("form"); };
  const answer = (id, value) => setAnswers((a) => ({ ...a, [id]: a[id] === value ? undefined : value }));

  const send = async () => {
    setSaving(true);
    setError("");
    let ok = false;
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, answers, freeText }) });
      const json = await res.json().catch(() => ({}));
      ok = res.ok && json?.success === true;
      if (!ok) setError(json?.error || STORE_ERROR);
    } catch {
      setError(STORE_ERROR);
    }
    setSaving(false);
    if (!ok) return;
    closedRef.current = true;
    writeState(storageKey, { ...readState(storageKey), done: true });
    setPhase("thanks");
  };

  const closeButton = (
    <button type="button" onClick={phase === "thanks" ? () => setPhase("hidden") : snooze} aria-label="סגירה"
      style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: "none", border: "none", color: "var(--ink-2)", fontSize: "var(--t-md)", cursor: "pointer", minWidth: 44, minHeight: 44 }}>
      ✕
    </button>
  );

  if (phase !== "form") {
    return (
      <div
        role="dialog"
        aria-label="איך קלמיה אצלך"
        data-testid="feedback-banner"
        style={{
          position: "fixed", zIndex: 4600, insetInline: 12, marginInline: "auto", maxWidth: 440, bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
          background: "var(--surface)", border: "1px solid var(--k-sage)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-xl)", padding: "16px 16px 12px", textAlign: "center",
          animation: "sheet-in 0.22s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {closeButton}
        {phase === "thanks" ? (
          <p className="serif" data-testid="feedback-thanks" style={{ fontSize: "var(--t-md)", fontWeight: 600, color: "var(--ink)", padding: "12px 32px" }}>
            תודה רבה! 🌸 התשובות שלך אצלנו ועוזרות לנו לשפר את קלמיה בשבילך.
          </p>
        ) : (
          <>
            <p className="serif" style={{ fontSize: "var(--t-md)", fontWeight: 600, color: "var(--ink)", padding: "0 32px", marginBottom: 2 }}>איך קלמיה אצלך עד עכשיו?</p>
            <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", marginBottom: 6 }}>נשמח לשמוע, זה לוקח דקה ועוזר לנו מאוד 🌸</p>
            <Stars value={rating} onPick={pickStars} size={32} />
            <button type="button" onClick={snooze} style={{ background: "none", border: "none", color: "var(--ink-2)", fontFamily: "inherit", fontSize: "var(--t-sm)", textDecoration: "underline", cursor: "pointer", minHeight: 44, padding: "0 12px" }}>
              לא עכשיו
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div data-overlay="feedback" style={{ position: "fixed", inset: 0, zIndex: 4600, background: "rgba(20,38,31,0.34)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ספרי לנו איך קלמיה אצלך"
        data-testid="feedback-banner"
        style={{
          position: "relative", width: "100%", maxWidth: 560, maxHeight: "calc(100dvh - 20px)", overflowY: "auto", background: "var(--surface)",
          borderTopLeftRadius: 26, borderTopRightRadius: 26, border: "1px solid var(--line)", borderBottom: "none", boxShadow: "var(--shadow-xl)",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))", animation: "sheet-in 0.22s cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {closeButton}
        <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--ink)", textAlign: "center", padding: "0 40px", marginBottom: 6 }}>תודה שאת משתפת 🌸</p>
        <Stars value={rating} onPick={pickStars} size={28} />
        {FEEDBACK_QUESTIONS.map((q) => (
          <div key={q.id} style={{ marginTop: 14 }}>
            <p style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{q.label}</p>
            <Faces question={q} value={answers[q.id]} onPick={(v) => answer(q.id, v)} />
            {q.videos && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                <button type="button" aria-pressed={answers[q.id] === NOT_YET} data-testid="feedback-videos-not-yet" onClick={() => answer(q.id, NOT_YET)}
                  style={{ fontFamily: "inherit", fontSize: "var(--t-sm)", cursor: "pointer", minHeight: 44, padding: "0 12px", borderRadius: "var(--r-full)", color: "var(--ink-2)", background: answers[q.id] === NOT_YET ? "var(--k-petal)" : "transparent", border: `1px solid ${answers[q.id] === NOT_YET ? "var(--k-green)" : "var(--line)"}` }}>
                  עוד לא צפיתי
                </button>
                <a href="/tutorials" target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>לסרטוני ההדרכה</a>
              </div>
            )}
          </div>
        ))}
        <label style={{ display: "block", marginTop: 14 }}>
          <span style={{ display: "block", fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>רוצה לספר לנו עוד? מה אהבת, מה חסר לך, מה הציק לך</span>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            maxLength={FEEDBACK_MAX_TEXT}
            rows={3}
            data-testid="feedback-text"
            placeholder="אפשר לכתוב בחופשיות, רק בלי פרטים של לקוחות"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 16, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: "var(--r-sm)", padding: "10px 12px", resize: "vertical" }}
          />
        </label>
        {error && <p role="alert" data-testid="feedback-error" style={{ fontSize: "var(--t-sm)", color: "var(--ink)", background: "var(--k-petal)", borderRadius: "var(--r-sm)", padding: "8px 12px", marginTop: 10 }}>{error}</p>}
        <button type="button" onClick={send} disabled={saving} data-testid="feedback-send"
          style={{ width: "100%", marginTop: 12, minHeight: 48, border: "none", borderRadius: "var(--r-md)", background: "var(--k-green)", color: "#fff", fontFamily: "inherit", fontSize: "var(--t-md)", fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "שולחת..." : "שליחה"}
        </button>
      </div>
    </div>
  );
}
