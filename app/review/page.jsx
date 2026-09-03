"use client";
//
// /review?id=<appointment>&t=<signature>
//
// One screen: stars, an optional sentence, done. Reached from the WhatsApp two
// days after a visit that smartReminders already sends.
//
// NO ACCOUNT, no password, no app. A client who has just had a facial will not
// create a login to say it was nice, and every step between the tap and the
// stars costs a proportion of the people who would have written something. The
// signed link is the whole authentication story.
//
// The route does all the checking. This page holds no secret, verifies nothing,
// and treats every answer from /api/reviews as authoritative - which is why it
// can be a client component in the first place.

import { useState, useEffect, useRef } from "react";
import { GOOGLE_REVIEW_NOTE } from "@/lib/reviewCopy";

export default function ReviewPage() {
  const [state, setState] = useState("loading"); // loading | form | sent | already | error
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A ref, not state: the query string never changes and nothing renders from
  // it, so putting it in state would only add a render and a synchronous
  // setState inside the effect below.
  const qsRef = useRef("");

  useEffect(() => {
    let search = "";
    try { search = window.location.search || ""; } catch { /* no window, no link */ }
    qsRef.current = search;
    // Everything that sets state is inside the promise chain rather than in the
    // effect body: a synchronous setState during an effect makes React render
    // twice before paint, and on the slowest phone this page will ever load on
    // that is the difference nobody should pay for a query-string check.
    Promise.resolve()
      .then(() => {
        if (!search) throw new Error("הקישור אינו תקין");
        return fetch(`/api/reviews${search}`).then((r) => r.json());
      })
      .then((d) => {
        if (!d?.success) throw new Error(d?.error || "הקישור אינו תקין");
        setInfo(d);
        // Already reviewed is not a failure and must not read like one: she
        // tapped a link she used before, which is an ordinary thing to do.
        if (d.existing) { setRating(d.existing.rating || 0); setText(d.existing.body || ""); setState("already"); }
        else setState("form");
      })
      .catch((err) => {
        setState("error");
        setErrorMsg(err?.message || "לא הצלחנו לטעון את הפרטים");
      });
  }, []);

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews${qsRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, text }),
      });
      const d = await res.json().catch(() => ({}));
      if (d?.success) { setState(d.alreadyReviewed ? "already" : "sent"); return; }
      setErrorMsg(d?.error || "לא הצלחנו לשמור את הביקורת");
    } catch {
      setErrorMsg("לא הצלחנו לשמור את הביקורת. נא לנסות שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const ink = "var(--ink, #2A2233)";
  const muted = "var(--brand-muted, #98879B)";
  const pc = "var(--brand-accent, #4A2E5A)";
  const wrap = {
    minHeight: "100dvh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", textAlign: "center",
    padding: "0 24px", background: "var(--brand-cream, #FEFAF7)",
    fontFamily: "var(--font-assistant), sans-serif",
  };

  if (state === "loading") {
    return <div dir="rtl" style={wrap}><p style={{ fontSize: 30, color: muted }}>✦</p></div>;
  }

  if (state === "error") {
    return (
      <div dir="rtl" style={wrap}>
        <p style={{ fontSize: 30, color: muted, marginBottom: 14 }}>✦</p>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: ink, marginBottom: 10 }}>{errorMsg}</h1>
        <p style={{ fontSize: 16, color: muted, lineHeight: 1.7, maxWidth: 340 }}>
          אפשר לבקש קישור חדש מהעסק.
        </p>
      </div>
    );
  }

  // Thanks, and then Google - shown to EVERYONE who submitted, whatever they
  // wrote. Showing it only to people who left four or five stars is review
  // gating, which Google's policy prohibits outright; it is also the kind of
  // thing that is obvious from the outside and worth nothing when it is noticed.
  if (state === "sent" || state === "already") {
    return (
      <div dir="rtl" style={wrap}>
        <p style={{ fontSize: 34, color: pc, marginBottom: 14 }}>✦</p>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: ink, marginBottom: 10 }}>
          {state === "already" ? "כבר קיבלנו את הביקורת שלך" : "תודה רבה!"}
        </h1>
        <p style={{ fontSize: 16, color: muted, lineHeight: 1.7, maxWidth: 360, marginBottom: 22 }}>
          {state === "already"
            ? "הביקורת שהשארת נשמרה, ואי אפשר לשנות אותה מכאן."
            : `הביקורת שלך תופיע בעמוד של ${info?.businessName || "העסק"}.`}
        </p>
        {info?.googleReviewUrl && (
          <>
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.7, maxWidth: 360, marginBottom: 12 }}>
              {GOOGLE_REVIEW_NOTE}
            </p>
            <a href={info.googleReviewUrl} target="_blank" rel="noreferrer"
               style={{ display: "block", textDecoration: "none", background: pc, color: "#fff",
                        borderRadius: 14, padding: "14px 26px", fontSize: 16, fontWeight: 600 }}>
              ביקורת בגוגל
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ ...wrap, justifyContent: "flex-start", paddingTop: "12vh" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <p style={{ fontSize: 13, color: muted, marginBottom: 6 }}>{info?.businessName}</p>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: ink, marginBottom: 8, lineHeight: 1.3 }}>
          {info?.clientName ? `${info.clientName}, איך היה?` : "איך היה?"}
        </h1>
        <p style={{ fontSize: 16, color: muted, lineHeight: 1.7, marginBottom: 26 }}>
          {info?.service ? `${info.service} · ${info.date}` : info?.date}
        </p>

        {/* Big targets. This is read one-handed, on a phone, by someone who is
            doing something else - so the stars are 40px and there is nothing
            else on screen competing for the tap. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 22, direction: "ltr" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} כוכבים`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4,
                       fontSize: 40, lineHeight: 1, color: n <= rating ? pc : "rgba(74,46,90,0.22)" }}>
              {n <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>

        {/* Optional, and it says so. A rating on its own is a perfectly good
            review, and asking for words as though they were required is how a
            form gets abandoned at the last step. */}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          maxLength={2000} placeholder="משהו שתרצי להוסיף? (לא חובה)"
          style={{ width: "100%", border: "1px solid rgba(74,46,90,0.18)", borderRadius: 14,
                   padding: "12px 14px", fontSize: 16, fontFamily: "inherit", outline: "none",
                   background: "#fff", color: ink, resize: "vertical", marginBottom: 14 }} />

        {errorMsg && (
          <p style={{ fontSize: 14, color: "var(--danger, #E05B6F)", fontWeight: 600, marginBottom: 12 }}>{errorMsg}</p>
        )}

        <button onClick={submit} disabled={!rating || submitting}
          style={{ width: "100%", height: 52, borderRadius: 14, border: "none",
                   background: rating ? pc : "rgba(74,46,90,0.22)", color: "#fff",
                   fontSize: 16, fontWeight: 600, fontFamily: "inherit",
                   cursor: rating && !submitting ? "pointer" : "default" }}>
          {submitting ? "שולחת…" : "שליחת הביקורת"}
        </button>

        <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, marginTop: 12 }}>
          הביקורת תופיע בעמוד של העסק עם שמך הפרטי.
        </p>
      </div>
    </div>
  );
}
