"use client";
//
// /review?id=<appointment>&t=<signature>
//
// One screen: stars, an optional sentence, done. Reached from the WhatsApp
// after a visit that smartReminders already sends.
//
// TWO STEPS when the business has them (lib/reviewRequests.ts, GET answers
// twoStep): first "איך היה?" with two big answers. "היה מעולה" offers her
// Google link first (through /api/reviews/go, which counts the tap) and these
// stars second. "משהו היה פחות טוב" opens a private note that reaches only the
// business owner. The Google link is offered after the note too: offering it
// only to happy clients would be review gating, which Google prohibits.
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
import Spinner from "../Spinner";
import { GOOGLE_REVIEW_NOTE } from "@/lib/reviewCopy";
import { ICON_QUESTION } from "@/lib/brand";
import { PublicPage, BusinessHeader, LineIcon } from "../PublicChrome";

// "2026-10-29" -> "29.10": the client reads a date, not an ISO string. Anything else is shown as it came.
const heDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${Number(m[3])}.${Number(m[2])}` : (d || ''); };

export default function ReviewPage() {
  const [state, setState] = useState("loading"); // loading | choose | happy | unhappy | noted | form | sent | already | error
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  // The Google button's href, set with the query string once it is read (a ref cannot be read during render).
  const [goGoogleHref, setGoGoogleHref] = useState("/api/reviews/go");
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
        setGoGoogleHref(`/api/reviews/go${search}`);
        // Already reviewed is not a failure and must not read like one: she
        // tapped a link she used before, which is an ordinary thing to do.
        if (d.existing) { setRating(d.existing.rating || 0); setText(d.existing.body || ""); setState("already"); }
        else if (d.twoStep && d.feedback?.mood === "unhappy" && d.feedback?.body) { setNote(d.feedback.body); setState("noted"); }
        else if (d.twoStep) setState("choose");
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

  // The answer to "איך היה?". Best effort for the tap itself: a failure never keeps her from the next step. A 503 means the
  // private notes are not switched on yet (the migration), so the stars form is the honest place to go.
  const sendFeedback = async (mood, body = "") => {
    try {
      const res = await fetch(`/api/reviews/feedback${qsRef.current}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, text: body }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 503 || d?.needsMigration) return "unavailable";
      return d?.success ? "ok" : (d?.error || "לא הצלחנו לשמור. נא לנסות שוב.");
    } catch {
      return "לא הצלחנו לשמור. נא לנסות שוב.";
    }
  };

  const chooseHappy = () => {
    setErrorMsg("");
    sendFeedback("happy"); // the Google button works whether or not the tap was stored
    setState(info?.googleReviewUrl ? "happy" : "form");
  };
  const chooseUnhappy = () => {
    setErrorMsg("");
    sendFeedback("unhappy").then((r) => { if (r === "unavailable") setState("form"); });
    setState("unhappy");
  };
  const submitNote = async () => {
    if (submitting) return;
    setSubmitting(true);
    const r = await sendFeedback("unhappy", note);
    setSubmitting(false);
    if (r === "ok") { setState("noted"); return; }
    if (r === "unavailable") { setState("form"); return; }
    setErrorMsg(r);
  };

  const pc = "var(--pc)";

  // Before the link has been checked there is no business to show: Kalmea's own frame, just the spinner.
  if (state === "loading") {
    return <PublicPage owner="kalmea"><Spinner label="טוענת" /></PublicPage>;
  }

  if (state === "error") {
    // No signature has verified yet at this point, so there is no "her" to color this with: Kalmea's frame, a line icon.
    return (
      <PublicPage owner="kalmea">
        <div className="pub-card">
          <LineIcon src={ICON_QUESTION} />
          <h1 className="pub-h1">{errorMsg}</h1>
          <p className="pub-p">אפשר לבקש קישור חדש מהעסק.</p>
        </div>
      </PublicPage>
    );
  }

  // Thanks, and then Google - shown to EVERYONE who submitted, whatever they
  // wrote. Showing it only to people who left four or five stars is review
  // gating, which Google's policy prohibits outright; it is also the kind of
  // thing that is obvious from the outside and worth nothing when it is noticed.
  if (state === "sent" || state === "already") {
    return (
      <PublicPage primary={info?.primaryColor || null}>
        <div className="pub-card">
          <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
          <svg viewBox="0 0 24 24" width="58" height="58" fill="none" stroke="var(--pc-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 14px" }}>
            <circle cx="12" cy="12" r="9.2" /><path d="M7.8 12.4l2.9 2.9 5.5-5.9" />
          </svg>
          <h1 className="pub-h1">{state === "already" ? "כבר קיבלנו את הביקורת שלך" : "תודה רבה!"}</h1>
          <p className="pub-p">
            {state === "already"
              ? "הביקורת שהשארת נשמרה, ואי אפשר לשנות אותה מכאן."
              : `הביקורת שלך תופיע בעמוד של ${info?.businessName || "העסק"}.`}
          </p>
          {info?.googleReviewUrl && (
            <div style={{ marginTop: 22 }}>
              <p style={{ fontSize: "var(--t-md)", color: "var(--ink-3)", lineHeight: 1.7, marginBottom: 12 }}>{GOOGLE_REVIEW_NOTE}</p>
              <a href={info.twoStep ? goGoogleHref : info.googleReviewUrl} target="_blank" rel="noreferrer" className="pub-pill">ביקורת בגוגל</a>
            </div>
          )}
        </div>
      </PublicPage>
    );
  }

  const biz = info?.businessName || "העסק";

  if (state === "choose") {
    return (
      <PublicPage primary={info?.primaryColor || null}>
        <div className="pub-card" style={{ textAlign: "center" }} data-testid="review-choose">
          <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
          <h1 className="pub-h1">{info?.clientName ? `${info.clientName}, איך היה?` : "איך היה?"}</h1>
          <p className="pub-p" style={{ marginBottom: 22 }}>{info?.service ? `${info.service} · ${heDate(info.date)}` : heDate(info?.date)}</p>
          {/* Two big answers, nothing else competing for the tap. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button type="button" onClick={chooseHappy} className="pub-pill" data-testid="review-happy" style={{ width: "100%", minHeight: 56 }}>היה מעולה 😍</button>
            <button type="button" onClick={chooseUnhappy} className="pub-pill pub-pill-quiet" data-testid="review-unhappy" style={{ width: "100%", minHeight: 56 }}>משהו היה פחות טוב</button>
          </div>
        </div>
      </PublicPage>
    );
  }

  if (state === "happy") {
    return (
      <PublicPage primary={info?.primaryColor || null}>
        <div className="pub-card" style={{ textAlign: "center" }} data-testid="review-happy-screen">
          <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
          <h1 className="pub-h1">איזה כיף לשמוע! 🌸</h1>
          <p className="pub-p" style={{ marginBottom: 20 }}>{GOOGLE_REVIEW_NOTE} זה לוקח פחות מדקה.</p>
          <a href={goGoogleHref} className="pub-pill" data-testid="review-google" style={{ width: "100%", minHeight: 56, boxSizing: "border-box" }}>כתיבת ביקורת בגוגל</a>
          <button type="button" onClick={() => setState("form")} style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", color: "var(--ink-2)", fontSize: "var(--t-md)", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>
            או דירוג קצר כאן, בעמוד של {biz}
          </button>
        </div>
      </PublicPage>
    );
  }

  if (state === "unhappy") {
    return (
      <PublicPage primary={info?.primaryColor || null}>
        <div className="pub-card" style={{ textAlign: "center" }} data-testid="review-unhappy-screen">
          <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
          <h1 className="pub-h1">תודה שאת מספרת</h1>
          <p className="pub-p" style={{ marginBottom: 16 }}>מה היה פחות טוב? מה שתכתבי כאן מגיע רק אל {biz}, ולא מתפרסם בשום מקום.</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={1000}
            aria-label="מה היה פחות טוב" placeholder="אפשר לכתוב בחופשיות"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--pc-tint-2)", borderRadius: "var(--r-md)",
                     padding: "12px 14px", fontSize: "var(--t-lg)", fontFamily: "inherit", outline: "none",
                     background: "var(--brand-surface, #fff)", color: "var(--ink)", resize: "vertical", marginBottom: 14 }} />
          {errorMsg && <p role="alert" style={{ fontSize: "var(--t-md)", color: "var(--danger, #E05B6F)", fontWeight: 600, marginBottom: 12 }}>{errorMsg}</p>}
          <button type="button" onClick={submitNote} disabled={!note.trim() || submitting} className="pub-pill" data-testid="review-note-send" style={{ width: "100%", minHeight: 56 }}>
            {submitting ? <Spinner inline label="שולחת" /> : `שליחה אל ${biz}`}
          </button>
          {/* Not review gating: the public review is offered right here, before and without the private note. */}
          <p data-testid="review-unhappy-public" style={{ fontSize: "var(--t-md)", color: "var(--ink-3)", lineHeight: 1.7, marginTop: 18 }}>
            מעדיפה לכתוב ביקורת פומבית?{" "}
            {info?.googleReviewUrl
              ? <a href={goGoogleHref} style={{ color: "var(--pc-deep)", fontWeight: 700 }}>אפשר בגוגל</a>
              : <button type="button" onClick={() => setState("form")} style={{ background: "none", border: "none", padding: 0, color: "var(--pc-deep)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>אפשר כאן</button>}
            {info?.googleReviewUrl && <> או <button type="button" onClick={() => setState("form")} style={{ background: "none", border: "none", padding: 0, color: "var(--pc-deep)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>כאן</button></>}
          </p>
        </div>
      </PublicPage>
    );
  }

  if (state === "noted") {
    return (
      <PublicPage primary={info?.primaryColor || null}>
        <div className="pub-card" style={{ textAlign: "center" }} data-testid="review-noted">
          <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
          <h1 className="pub-h1">תודה, זה הגיע אליה</h1>
          <p className="pub-p">מה שכתבת הגיע רק אל {biz}. חשוב לה לשמוע, גם כשמשהו לא היה מושלם.</p>
          {/* Not review gating: a public review stays one tap away for her too. */}
          <p style={{ fontSize: "var(--t-md)", color: "var(--ink-3)", lineHeight: 1.7, marginTop: 22 }}>
            רוצה לכתוב גם ביקורת פומבית?{" "}
            {info?.googleReviewUrl
              ? <a href={goGoogleHref} style={{ color: "var(--pc-deep)", fontWeight: 700 }}>אפשר בגוגל</a>
              : <button type="button" onClick={() => setState("form")} style={{ background: "none", border: "none", padding: 0, color: "var(--pc-deep)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>אפשר כאן</button>}
            {info?.googleReviewUrl && <> או <button type="button" onClick={() => setState("form")} style={{ background: "none", border: "none", padding: 0, color: "var(--pc-deep)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>כאן</button></>}
          </p>
        </div>
      </PublicPage>
    );
  }

  return (
    <PublicPage primary={info?.primaryColor || null}>
      <div className="pub-card" style={{ textAlign: "center" }}>
        {/* Her logo and name first, large: this page is hers. */}
        <BusinessHeader logoUrl={info?.logoUrl} name={info?.businessName} />
        <h1 className="pub-h1">{info?.clientName ? `${info.clientName}, איך היה?` : "איך היה?"}</h1>
        <p className="pub-p" style={{ marginBottom: 22 }}>{info?.service ? `${info.service} · ${heDate(info.date)}` : heDate(info?.date)}</p>

        {/* Big targets. This is read one-handed, on a phone, by someone who is
            doing something else - so the stars are big and there is nothing
            else on screen competing for the tap. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20, direction: "ltr" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} כוכבים`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, minWidth: 44, minHeight: 44,
                       fontSize: "var(--t-hero)", lineHeight: 1, color: pc, opacity: n <= rating ? 1 : 0.4 }}>
              {n <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>

        {/* Optional, and it says so. A rating on its own is a perfectly good
            review, and asking for words as though they were required is how a
            form gets abandoned at the last step. */}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          maxLength={2000} placeholder="משהו שתרצי להוסיף? (לא חובה)"
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--pc-tint-2)", borderRadius: "var(--r-md)",
                   padding: "12px 14px", fontSize: "var(--t-lg)", fontFamily: "inherit", outline: "none",
                   background: "var(--brand-surface, #fff)", color: "var(--ink)", resize: "vertical", marginBottom: 14 }} />

        {errorMsg && (
          <p style={{ fontSize: "var(--t-md)", color: "var(--danger, #E05B6F)", fontWeight: 600, marginBottom: 12 }}>{errorMsg}</p>
        )}

        <button onClick={submit} disabled={!rating || submitting} className="pub-pill">
          {submitting ? <Spinner inline label="שולחת" /> : "שליחת הביקורת"}
        </button>

        <p style={{ fontSize: "var(--t-md)", color: "var(--ink-3)", lineHeight: 1.6, marginTop: 12 }}>
          הביקורת תופיע בעמוד של העסק עם שמך הפרטי.
        </p>
      </div>
    </PublicPage>
  );
}
