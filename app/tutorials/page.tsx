// app/tutorials/page.tsx
// The tutorial videos for a new cosmetician: the link in the WhatsApp welcome message (OWNER_WELCOME_TUTORIALS_URL).
// Server component, no session: any top-level single segment is public (lib/supabase/middleware.ts). "tutorials" is a
// reserved slug (lib/slug.ts + supabase/migrations/add_reserved_slug_tutorials.sql), so no business page sits under it.
//
// The videos are recorded from the demo tenant by marketing/tutorials.mjs; to update one, re-run it and copy the file over
// public/tutorials/kalmea-<id>.mp4 (and its poster .jpg). preload="none": nothing is downloaded until she presses play,
// which is why these clips have their own size limit in test-asset-budget.ts.

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, BRAND_WASH_SOFT } from "@/lib/brand";
import PublicFooterLinks from "../PublicFooterLinks";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";

export const metadata: Metadata = {
  title: "סרטוני הדרכה · Kalmea",
  description: "שלושה סרטונים קצרים: מה יש בקלמיה, סיור בכל המסכים, ואיך קובעים תור.",
  robots: { index: false },
};

const TUTORIALS = [
  { id: "welcome", title: "מה יש בקלמיה", sub: "כל העסק שלך במקום אחד, בדקה וחצי" },
  { id: "tour", title: "סיור בכל המסכים", sub: "היומן, הלקוחות, התשלומים, התוכן וההגדרות" },
  { id: "booking", title: "איך קובעים תור", sub: "ביומן שלך, ואיך הלקוחה קובעת לבד בדף שלך" },
] as const;

export default function TutorialsPage() {
  const wa = supportWhatsAppUrl("היי, יש לי שאלה על קלמיה");
  return (
    <div dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 6 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>ברוכה הבאה לקלמיה</h1>
          <p style={leadStyle}>שלושה סרטונים קצרים שיעזרו לך להתחיל.</p>
        </header>

        {TUTORIALS.map((t) => (
          <section key={t.id} style={sectionStyle} aria-labelledby={`t-${t.id}`}>
            <h2 id={`t-${t.id}`} style={h2Style}>{t.title}</h2>
            <p style={subStyle}>{t.sub}</p>
            <video
              src={`/tutorials/kalmea-${t.id}.mp4`}
              poster={`/tutorials/kalmea-${t.id}.jpg`}
              controls
              playsInline
              preload="none"
              style={videoStyle}
              aria-label={t.title}
            />
          </section>
        ))}

        <section style={sectionStyle}>
          <h2 style={h2Style}>יש שאלה?</h2>
          <p style={subStyle}>
            אנחנו כאן בוואטסאפ (הודעות בלבד):{" "}
            {wa
              ? <a href={wa} target="_blank" rel="noopener noreferrer" style={linkStyle} dir="ltr">{KALMEA_SUPPORT_WHATSAPP_DISPLAY}</a>
              : <span dir="ltr">{KALMEA_SUPPORT_WHATSAPP_DISPLAY}</span>}
          </p>
        </section>
        <PublicFooterLinks style={{ padding: "18px 0 0" }} />
      </article>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh", background: BRAND_WASH_SOFT, padding: "32px 16px", display: "flex", justifyContent: "center",
  fontFamily: "var(--font-heebo), 'Heebo', 'Assistant', sans-serif", color: DEEP,
};
const cardStyle: CSSProperties = {
  width: "100%", maxWidth: 520, background: SURFACE, borderRadius: "var(--r-lg)", padding: "30px 22px",
  border: `1px solid ${ACCENT_LINE}`, boxShadow: "var(--shadow-accent)", boxSizing: "border-box", alignSelf: "flex-start",
};
const brandStyle: CSSProperties = { fontSize: "var(--t-xs)", fontWeight: 600, letterSpacing: 2, color: MUTED, marginBottom: 8 };
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-hero)", fontWeight: 600, color: DEEP, lineHeight: 1.2, marginBottom: 6,
};
const leadStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.7, color: DEEP, margin: 0 };
const sectionStyle: CSSProperties = { paddingTop: 20, marginTop: 20, borderTop: `1px solid ${ACCENT_LINE}` };
const h2Style: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-2xl)", fontWeight: 600, color: DEEP, marginBottom: 4,
};
const subStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.7, color: DEEP, marginBottom: 12 };
const videoStyle: CSSProperties = {
  display: "block", width: "100%", maxWidth: 360, aspectRatio: "9 / 16", margin: "0 auto", borderRadius: "var(--r-md)",
  background: "#1F3A30", border: `1px solid ${ACCENT_LINE}`,
};
const linkStyle: CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: "underline" };
