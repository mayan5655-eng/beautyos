// app/tutorials/page.tsx
// The tutorial videos for a new cosmetician: the link in the WhatsApp welcome message (OWNER_WELCOME_TUTORIALS_URL).
// Server component, no session: any top-level single segment is public (lib/supabase/middleware.ts). "tutorials" is a
// reserved slug (lib/slug.ts + supabase/migrations/add_reserved_slug_tutorials.sql), so no business page sits under it.
//
// Grouped by topic (2026-11-04), so she finds the one she needs now instead of scrolling through every video. Where each comes from:
//   tour, booking            recorded from the demo tenant by marketing/tutorials.mjs
//   welcome                  marketing/welcome-motion.mjs
//   home                     marketing/home-icon-motion.mjs
//   morning                  marketing/morning-motion.mjs
//   appointment-actions, clients, till, reminders, my-page, services-hours, ai, skin-scan
//                            marketing/topics-motion.mjs (drawn screens, every label copied from the app's code;
//                            skin-scan is its "skin" mode, published as kalmea-skin-scan.mp4)
// To update one, re-run its script and copy the file over public/tutorials/kalmea-<id>.mp4 (and its poster .jpg). preload="none":
// nothing is downloaded until she presses play, which is why these clips have their own size limit in test-asset-budget.ts.
//
// Owner, 2026-11-01: no AI figures. The last seconds of the older files were covered with the Kalmea flower, because the scripts
// there still draw the AI presenter on their end cards: a new render must drop it (marketing/motion-lib.mjs endCard,
// marketing/tutorials.mjs). The topic videos end on the flower card already.

import PublicAnalytics from "../PublicAnalytics";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, BRAND_WASH_SOFT } from "@/lib/brand";
import PublicFooterLinks from "../PublicFooterLinks";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";

export const metadata: Metadata = {
  title: "סרטוני הדרכה · Kalmea",
  description: "סרטוני הדרכה קצרים לקלמיה, לפי נושא: איך מתחילים, היומן והתורים, הלקוחות, התשלומים והקבלות, ה-AI בעסק, הדף שלך וההגדרות.",
  robots: { index: false },
};

const TOPICS = [
  {
    key: "start",
    title: "להתחיל",
    videos: [
      { id: "welcome", title: "מה מיוחד בקלמיה", sub: "כל מה שקלמיה עושה בשבילך, בדקה אחת" },
      { id: "tour", title: "סיור בכל המסכים", sub: "היומן, הלקוחות, התשלומים, התוכן וההגדרות" },
      { id: "home", title: "קלמיה על מסך הבית", sub: "איך מוסיפים אותה לטלפון, באייפון ובאנדרואיד" },
    ],
  },
  {
    key: "calendar",
    title: "יומן ותורים",
    videos: [
      { id: "booking", title: "איך קובעים תור", sub: "ביומן שלך, ואיך הלקוחה קובעת לבד בדף שלך" },
      { id: "appointment-actions", title: "מה עושים עם תור", sub: "פותחים תור מ״היום שלי״: תשלום, תזכורת, כרטיס הלקוחה או ביטול" },
      { id: "reminders", title: "תזכורות לתורים", sub: "את שולחת כל תזכורת בלחיצה מהוואטסאפ שלך, והלקוחה מאשרת או מבטלת מהקישור" },
    ],
  },
  {
    key: "clients",
    title: "לקוחות",
    videos: [
      { id: "clients", title: "הוספת לקוחות", sub: "לקוחה אחת ביד, או כל הרשימה בבת אחת, ומה יש בכרטיס שלה" },
    ],
  },
  {
    key: "payments",
    title: "תשלומים וקבלות",
    videos: [
      { id: "till", title: "תשלום בקופה", sub: "לקוחה וטיפול, הנחה או טיפ, איך שילמה, ואישור התשלום" },
      { id: "morning", title: "קבלות חוקיות ממורנינג", sub: "מחברים את חשבון מורנינג פעם אחת, וכל תשלום בקופה מקבל קבלה" },
    ],
  },
  {
    key: "ai",
    title: "AI בעסק",
    videos: [
      { id: "ai", title: "היועצת, הפוסטים והרילסים", sub: "שואלים את היועצת העסקית, ומקבלים פוסט, רעיונות לצילום ותסריט לרילס. את מאשרת כל דבר לפני שמפרסמים" },
      { id: "skin-scan", title: "סריקת עור AI", sub: "הלקוחה מצלמת את הפנים מהקישור שלך, ומקבלת דוח עור והמלצה לטיפול מהשירותים שלך. הכוונה קוסמטית, לא אבחון" },
    ],
  },
  {
    key: "settings",
    title: "הדף שלי והגדרות",
    videos: [
      { id: "my-page", title: "הדף שלך ללקוחות", sub: "מעתיקים את הקישור לאינסטגרם ולוואטסאפ, ומה הלקוחה רואה כשהיא קובעת" },
      { id: "services-hours", title: "טיפולים ושעות פעילות", sub: "מחיר ומשך לכל טיפול, והימים והשעות שאת עובדת" },
    ],
  },
] as const;

export default function TutorialsPage() {
  const wa = supportWhatsAppUrl("היי, יש לי שאלה על קלמיה");
  return (
    <div dir="rtl" style={pageStyle}>
      <PublicAnalytics />
      <article style={cardStyle}>
        <header style={{ marginBottom: 6 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>ברוכה הבאה לקלמיה</h1>
          <p style={leadStyle}>סרטונים קצרים לפי נושא, כדי שתמצאי מהר את מה שצריך לך עכשיו.</p>
          <nav aria-label="נושאים" style={navStyle}>
            {TOPICS.map((g) => (
              <a key={g.key} href={`#topic-${g.key}`} style={chipStyle}>{g.title}</a>
            ))}
          </nav>
        </header>

        {TOPICS.map((g) => (
          <section key={g.key} id={`topic-${g.key}`} style={topicStyle} aria-labelledby={`topic-${g.key}-h`}>
            <h2 id={`topic-${g.key}-h`} style={topicTitleStyle}>{g.title}</h2>
            {g.videos.map((t, i) => (
              <div key={t.id} style={i === 0 ? videoBlockFirst : videoBlock}>
                <h3 id={`t-${t.id}`} style={h3Style}>{t.title}</h3>
                <p style={subStyle}>{t.sub}</p>
                <video
                  src={`/tutorials/kalmea-${t.id}.mp4`}
                  poster={`/tutorials/kalmea-${t.id}.jpg`}
                  controls
                  playsInline
                  preload="none"
                  style={videoStyle}
                  aria-labelledby={`t-${t.id}`}
                />
              </div>
            ))}
          </section>
        ))}

        <section style={topicStyle}>
          <h2 style={topicTitleStyle}>יש שאלה?</h2>
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
// The topics as a row of links to their sections: on a phone the page is long, and this is the way straight to the one she needs.
const navStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 };
const chipStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", borderRadius: "var(--r-full)",
  border: `1px solid ${ACCENT_LINE}`, color: DEEP, fontSize: "var(--t-sm)", fontWeight: 600, textDecoration: "none", background: BRAND_WASH_SOFT,
};
const topicStyle: CSSProperties = { paddingTop: 22, marginTop: 24, borderTop: `1px solid ${ACCENT_LINE}`, scrollMarginTop: 16 };
const topicTitleStyle: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-2xl)", fontWeight: 700, color: DEEP, marginBottom: 4,
};
const videoBlockFirst: CSSProperties = { paddingTop: 10 };
const videoBlock: CSSProperties = { paddingTop: 22 };
const h3Style: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-xl)", fontWeight: 600, color: DEEP, marginBottom: 4,
};
const subStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.7, color: DEEP, marginBottom: 12 };
const videoStyle: CSSProperties = {
  display: "block", width: "100%", maxWidth: 360, aspectRatio: "9 / 16", margin: "0 auto", borderRadius: "var(--r-md)",
  background: "#1F3A30", border: `1px solid ${ACCENT_LINE}`,
};
const linkStyle: CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: "underline" };
