"use client";
// app/FirstBookingCard.jsx
//
// "3 צעדים לתור הראשון" on the Today screen of a new business (logic and the
// done rules: lib/firstBooking.js). Presentational: every action is a callback
// from app/beautyos.jsx, so each button goes where the same button elsewhere
// in the app goes. Kalmea chrome (--brand-* / --ink), not her accent: this is
// product guidance, not something her clients see.

import Icon from "./Icon";
import { firstBookingProgress } from "@/lib/firstBooking";
import { tutorialHref } from "@/lib/helpSections";

const btnPrimary = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "9px 16px",
  borderRadius: "var(--r-full)", background: "var(--k-green)", color: "var(--k-cream)", border: "none",
  fontSize: "var(--t-sm)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const btnQuiet = {
  ...btnPrimary, background: "transparent", color: "var(--ink)", border: "1px solid var(--line-2)", fontWeight: 600,
};

export default function FirstBookingCard({
  view, steps, name, style,
  onAddServices, onImportClients, onNewClient, onShareWhatsApp, onCopyLink, onClose,
}) {
  if (view !== "active" && view !== "celebrate") return null;

  if (view === "celebrate") {
    return (
      <div className="glass-card card-boxed" data-testid="first-booking-done" role="status"
        style={{ maxWidth: 1180, marginInline: "auto", marginBottom: 12, padding: "16px 17px", display: "flex", alignItems: "center", gap: 12, ...style }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--k-sage)", color: "var(--k-green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="check" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="serif" style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--ink)", margin: 0 }}>הכל מוכן לתור הראשון 🌸</p>
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6, margin: "2px 0 0" }}>הטיפולים, הלקוחות והקישור במקום. כל לקוחה שתקבל ממך את הקישור יכולה לקבוע תור לבד.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", color: "var(--ink-2)", fontSize: "var(--t-md)", cursor: "pointer", minWidth: 44, minHeight: 44, flex: "none" }}>✕</button>
      </div>
    );
  }

  const progress = firstBookingProgress(steps);
  const pct = Math.round((progress.done / progress.total) * 100);
  const nextKey = (steps.find((s) => !s.done) || {}).key;
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));

  const STEP_COPY = {
    services: {
      title: "הוסיפי את הטיפולים שלך",
      hint: "שם, מחיר ומשך. בלי טיפול אחד לפחות אי אפשר לקבוע תור.",
      doneHint: (s) => (s.count === 1 ? "טיפול אחד ברשימה" : `${s.count} טיפולים ברשימה`),
      actions: (main) => <button type="button" onClick={onAddServices} style={main} data-testid="fb-services">הוספת טיפולים</button>,
    },
    clients: {
      title: "הכניסי את הלקוחות שלך",
      hint: "הדביקי רשימה מאקסל או מהטלפון, או הוסיפי לקוחה אחת ביד.",
      doneHint: (s) => (s.count === 1 ? "לקוחה אחת ברשימה" : `${s.count} לקוחות ברשימה`),
      actions: (main) => (
        <>
          <button type="button" onClick={onImportClients} style={main} data-testid="fb-import"><Icon name="upload" size={14} /> ייבוא לקוחות</button>
          <button type="button" onClick={onNewClient} style={btnQuiet} data-testid="fb-new-client">לקוחה חדשה</button>
          <a href={tutorialHref("clients")} data-testid="fb-video" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>▶ סרטון: הוספת לקוחות</a>
        </>
      ),
    },
    link: {
      title: "שלחי את הקישור שלך ללקוחה אחת",
      hint: "דרך הקישור היא בוחרת טיפול ושעה וקובעת לבד. מספיקה לקוחה אחת כדי להתחיל.",
      doneHint: () => "הקישור אצלך. כל לקוחה שתקבל אותו יכולה לקבוע תור לבד.",
      actions: (main) => (
        <>
          <button type="button" onClick={onShareWhatsApp} style={main} data-testid="fb-whatsapp"><Icon name="whatsapp" size={14} /> שליחה בוואטסאפ</button>
          <button type="button" onClick={onCopyLink} style={btnQuiet} data-testid="fb-copy"><Icon name="copy" size={14} /> העתקת הקישור</button>
        </>
      ),
    },
  };

  return (
    <section className="glass-card card-boxed card-boxed-accent" data-testid="first-booking-card" aria-labelledby="fb-title"
      style={{ maxWidth: 1180, marginInline: "auto", marginBottom: 12, padding: "16px 17px", borderInlineStart: "3px solid var(--k-green)", ...style }}>
      <p style={{ fontSize: 12.5, color: "var(--brand-muted)", margin: 0 }}>ברוכה הבאה{name ? `, ${name}` : ""}</p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 id="fb-title" style={{ fontFamily: "var(--font-frank),'Frank Ruhl Libre',serif", fontSize: "var(--t-xl)", fontWeight: 600, color: "var(--ink)", margin: "2px 0 0" }}>3 צעדים לתור הראשון</h2>
        <span data-testid="fb-progress" style={{ fontSize: "var(--t-sm)", fontWeight: 700, color: "var(--ink)" }}>{progress.line}</span>
      </div>
      <div aria-hidden style={{ height: 6, borderRadius: 999, background: "var(--k-sage)", overflow: "hidden", margin: "10px 0 12px" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--k-green)", borderRadius: 999, transition: "width 0.5s ease" }} />
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
        {["services", "clients", "link"].map((key, i) => {
          const s = byKey[key]; const c = STEP_COPY[key];
          const isNext = key === nextKey;
          return (
            <li key={key} data-testid={`fb-step-${key}`} data-done={s.done ? "1" : "0"}
              style={{ display: "flex", gap: 11, padding: "11px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", opacity: !s.done && !isNext ? 0.78 : 1 }}>
              <span aria-hidden style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--t-sm)", fontWeight: 700,
                background: s.done ? "var(--k-sage)" : isNext ? "var(--k-green)" : "transparent", color: s.done ? "var(--k-green)" : isNext ? "var(--k-cream)" : "var(--ink-2)", border: s.done || isNext ? "none" : "1.5px solid var(--line-2)" }}>
                {s.done ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "var(--t-md)", fontWeight: isNext ? 700 : 600, color: s.done ? "var(--ink-2)" : "var(--ink)", margin: 0 }}>
                  {c.title}{s.done && <span style={{ fontSize: "var(--t-sm)", color: "var(--success)", fontWeight: 700, marginInlineStart: 8 }}>✓ בוצע</span>}
                </p>
                <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.55, margin: "2px 0 0" }}>{s.done ? c.doneHint(s) : c.hint}</p>
                {!s.done && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 9 }}>{c.actions(isNext ? btnPrimary : btnQuiet)}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
