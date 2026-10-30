"use client";
// "היום שלי": the morning card at the top of the dashboard. Pure view over lib/myDay.js: who is coming today and how long she is
// free between them, then what needs her (a payment not recorded, tomorrow's client who has not confirmed, a lead nobody answered),
// each with ONE button. Nothing here sends anything by itself: "remind" is the calendar's own reminder button (it opens WhatsApp with
// the message written, from inside the tap), "pay" opens the cashier on that visit, "call" is a plain tel: link.
import { useState } from "react";
import { durationHe } from "../lib/myDay.js";

const GREEN = "var(--ink)";
const MUTED = "var(--brand-muted)";

export default function MyDayCard({ model, loading = false, brandNew = false, pc, pcTint, onRemind, onPay, onNewAppt, style }) {
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState("");
  // A tenant with nothing at all gets the welcome card the dashboard already shows; two big cards would only crowd it.
  if (brandNew || !model) return null;

  const done = model.rows.filter((r) => r.state === "done");
  const ahead = model.rows.filter((r) => r.state !== "done");
  const shown = showDone ? model.rows : ahead;

  const act = async (it, fn) => {
    if (busy) return;
    setBusy(it.key);
    try { await fn(it.appt); } finally { setBusy(""); }
  };

  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 108, padding: "0 16px", borderRadius: "var(--r-full)", border: "none", background: GREEN, color: "var(--surface)", fontFamily: "inherit", fontWeight: 700, fontSize: "var(--t-sm)", cursor: "pointer", textDecoration: "none", flex: "none", whiteSpace: "nowrap" };

  return (
    <section data-testid="my-day-card" aria-label="היום שלי" className="glass-card card-boxed" style={{ padding: "16px 17px", marginBottom: 12, maxWidth: 1180, marginInline: "auto", ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <h2 className="serif" style={{ fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontSize: 21, fontWeight: 700, color: GREEN, margin: 0 }}>היום שלי</h2>
      </div>
      <p data-testid="my-day-headline" style={{ fontSize: 13.5, color: MUTED, margin: "0 0 10px" }}>
        {loading && model.rows.length === 0 ? "בודקת מה מחכה לך…" : model.headline}
      </p>

      {shown.length > 0 && (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((r) => (
            <li key={r.id} data-testid="my-day-row" data-state={r.state} style={{ opacity: r.state === "done" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px" }}>
                <span style={{ width: 44, flex: "none", fontSize: 14, fontWeight: 700, color: r.state === "now" || r.state === "next" ? GREEN : MUTED, fontVariantNumeric: "tabular-nums" }}>{r.time}</span>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: r.state === "now" ? pc : r.confirmed || r.personal ? "#DCE4D5" : "transparent", border: r.state === "now" || r.confirmed || r.personal ? "none" : "1px solid #C07A72" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, color: GREEN, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.personal ? "🔒 " : ""}{r.title}</p>
                  <p style={{ fontSize: 12.5, color: MUTED, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[r.sub, !r.personal && !r.confirmed && r.state !== "done" ? "ממתינה לאישור" : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {(r.state === "now" || r.state === "next") && (
                  <span style={{ flex: "none", fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: "var(--r-full)", background: pcTint || "var(--pc-tint)", color: GREEN }}>{r.state === "now" ? "עכשיו" : "הבאה"}</span>
                )}
              </div>
              {r.gapAfter && (
                <p data-testid="my-day-gap" style={{ fontSize: 12.5, color: MUTED, margin: "0 0 0 0", paddingInlineStart: 61, paddingBlock: "1px 3px" }}>
                  ☕ פנויה {durationHe(r.gapAfter.minutes)}{r.gapAfter.until ? ` עד ${r.gapAfter.until}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} style={{ background: "none", border: "none", padding: "6px 2px", minHeight: 36, color: MUTED, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>
          {showDone ? "הסתרת מה שהסתיים" : `${done.length === 1 ? "תור אחד כבר הסתיים" : `${done.length} תורים כבר הסתיימו`}`}
        </button>
      )}

      {model.rows.length === 0 && (
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 4px" }}>
          זה הזמן לנשום, או להציע תור ללקוחה שהתגעגעת אליה.
          {onNewAppt && <> <button type="button" onClick={onNewAppt} data-testid="my-day-new" style={{ background: "none", border: "none", padding: 0, minHeight: 44, color: GREEN, fontWeight: 700, textDecoration: "underline", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>קביעת תור</button></>}
        </p>
      )}

      {model.needs.length > 0 && (
        <div data-testid="my-day-needs" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, margin: "0 0 6px" }}>מחכה לך</p>
          {model.needs.map((it) => (
            <div key={it.key} data-testid={`my-day-need-${it.kind}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14.5, color: GREEN, margin: 0, lineHeight: 1.35 }}>{it.text}</p>
                {it.sub && <p style={{ fontSize: 12.5, color: MUTED, margin: "2px 0 0", lineHeight: 1.35 }}>{it.sub}</p>}
              </div>
              {it.kind === "call" ? (
                <a href={it.href} data-testid="my-day-action" style={btn}>{it.action}</a>
              ) : (
                <button type="button" data-testid="my-day-action" disabled={!!busy} onClick={() => act(it, it.kind === "pay" ? onPay : onRemind)} style={{ ...btn, opacity: busy && busy !== it.key ? 0.6 : 1 }}>
                  {busy === it.key ? "רגע…" : it.action}
                </button>
              )}
            </div>
          ))}
          {model.more > 0 && (
            <p data-testid="my-day-more" style={{ fontSize: 12.5, color: MUTED, margin: "8px 0 0" }}>ועוד {model.more} ב״דורש תשומת לב״ למטה.</p>
          )}
        </div>
      )}

      {model.needs.length === 0 && model.rows.length > 0 && !loading && (
        <p data-testid="my-day-clear" style={{ fontSize: 13.5, color: MUTED, margin: "10px 0 0" }}>אין כלום שמחכה לך עכשיו 🌸</p>
      )}
    </section>
  );
}
