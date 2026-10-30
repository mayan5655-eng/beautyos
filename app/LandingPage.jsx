// app/LandingPage.jsx
//
// The real / for a logged-out visitor - what an ad click actually hits.
// Server component by default: everything below is static HTML on first
// paint except the small client islands (Reveal, CostTable, ClinicDay).
//
// Owner, 2026-10-30: says who it is for in the headline, sells what changes in her day, and looks like a real company. So: no AI images
// or AI faces (the photos are real, from Pexels, free for commercial use: 10600175 and 4677852), no invented testimonials or numbers,
// and every screen in public/landing/app-*.jpg is a real screenshot of the demo tenant (marketing/landing-shots.mjs).
// Reminders and messages are "ready to send", never "sent for her": platform_settings.whatsapp_auto_utility_enabled is off.

import Image from "next/image";
import Link from "next/link";
import Reveal from "./landing/Reveal";
import CostTable from "./landing/CostTable";
import BeforeAfter from "./landing/BeforeAfter";
import ClinicDay from "./landing/ClinicDay";
import DemoVideo from "./landing/DemoVideo";
import PublicFooterLinks from "./PublicFooterLinks";
import KalmeaLegalFooter from "./KalmeaLegalFooter";
import { supportWhatsAppUrl } from "@/lib/support";
import { PLAN_PRICES, priceHe } from "@/lib/pricing";

const COST_ROWS = [
  { label: "מערכת לניהול תורים", low: 99, high: 379 },
  { label: "הנהלת חשבונות / חשבוניות", low: 32, high: 89 },
  { label: "עיצוב גרפי", low: 300, high: 900 },
  { label: "ניהול רשתות חברתיות", low: 1500, high: 3500 },
  { label: "מזכירה / פקידת קבלה", low: 1500, high: 4000 },
  { label: "יועצת עסקית", low: 400, high: 1200 },
];
const TOTAL_LOW = COST_ROWS.reduce((s, r) => s + r.low, 0);
const TOTAL_HIGH = COST_ROWS.reduce((s, r) => s + r.high, 0);

const BEFORE_AFTER = [
  { icon: "chat", before: "הודעות וואטסאפ שלא נגמרות", after: "לקוחות קובעות תורים בעצמן, 24/7" },
  { icon: "clock", before: "לקוחות שלא מגיעות לתורים", after: "תזכורות מוכנות לשליחה, יום לפני כל טיפול" },
  { icon: "calendar", before: "חורים ריקים ביומן", after: "תור שהתפנה? Kalmea שואלת אם להציע אותו" },
  { icon: "heart", before: "לקוחות קבועות שנעלמות בלי ששמת לב", after: "הודעת חזרה מוכנה ללקוחה שלא הגיעה מזמן" },
  { icon: "spark", before: "שעות על יצירת פוסטים ושיווק", after: "פוסטים וקמפיינים בעזרת AI, בצבעים שלך" },
  { icon: "wallet", before: "שכחת לגבות או לתעד תשלום", after: "קופה ומעקב אחר תשלומים וחבילות" },
  { icon: "layers", before: "מעבר בין כמה מערכות ואפליקציות", after: "יומן, לקוחות ושיווק במקום אחד" },
  { icon: "chart", before: "אין לך מושג ברור כמה הרווחת", after: "דוחות שמראים לך מה קורה בעסק" },
  { icon: "person", before: "את גם המטפלת, גם המזכירה וגם מנהלת השיווק", after: "כלי AI שעוזרים לך בניהול היומיומי" },
];

// The moments of the day. Made-up names; each "with" side is what the product really does, and what needs her OK waits for it.
const MOMENTS = [
  {
    id: "night", tab: "22:43 בלילה", title: "22:43. לקוחה רוצה תור, ואת כבר לא עובדת.",
    before: { screen: "whatsapp", props: { time: "22:43", text: "היי, יש לך תור לטיפול פנים השבוע?", status: "מחכה לך לבוקר" }, text: "ההודעה מחכה לבוקר, ועד אז היא אולי כבר קבעה אצל מישהי אחרת." },
    after: { shot: "/landing/app-booking.jpg", alt: "צילום מסך של דף ההזמנות של Kalmea בטלפון", text: "הלקוחה נכנסת לקישור ההזמנות האישי שלך ובוחרת תור בעצמה. בבוקר הוא כבר ביומן." },
  },
  {
    id: "gone", tab: "לקוחה נעלמה", title: "לקוחה לא חזרה כבר שלושה חודשים. שמת לב?",
    before: { screen: "client", props: { name: "נועה לוי", line: "לקוחה קבועה", last: "לפני 4 חודשים", note: "אף אחת לא שמה לב שהיא הפסיקה להגיע." }, text: "לקוחה שהגיעה במשך שנים מפסיקה להגיע, ואף אחת לא שמה לב." },
    after: { screen: "draft", props: { to: "נועה", text: "היי נועה, מזמן לא התראינו ואני חושבת עלייך. רוצה שנקבע לך טיפול?" }, text: "Kalmea מזהה לקוחה שלא חזרה אחרי 90 יום ומכינה לך הודעה אישית. את קובעת כמה ימים, ואת שולחת." },
  },
  {
    id: "gap", tab: "תור שהתפנה", title: "יש לך שעה פנויה מחר. מי דואגת למלא אותה?",
    before: { screen: "day", props: { rows: [{ time: "12:30", text: "מניקור ג'ל, דנה" }, { time: "14:00", text: "התפנה", empty: true }, { time: "15:30", text: "טיפול פנים, רונית" }], note: "ביטול ברגע האחרון." }, text: "ביטול ברגע האחרון משאיר שעה ריקה ביומן." },
    after: { screen: "offer", props: { text: "התפנה תור מחר ב-14:00. להציע אותו בוואטסאפ ללקוחות מתאימות?" }, text: "Kalmea מזהה את התור שהתפנה ושואלת אותך אם להציע אותו ללקוחות מתאימות." },
  },
];

// The five areas. Each one: a real screen, a short title, and what it changes in her day.
const AREAS = [
  { shot: "/landing/app-client.jpg", alt: "צילום מסך של כרטיס לקוחה ב-Kalmea", title: "ניהול תורים ולקוחות", text: "כל מה שחשוב לדעת על הלקוחה שלך, במקום אחד." },
  { shot: "/landing/app-content.jpg", alt: "צילום מסך של מסך התוכן והתבניות ב-Kalmea", title: "שיווק והחזרת לקוחות", text: "פוסטים בצבעים שלך, והודעה מוכנה ללקוחה שלא חזרה." },
  { shot: "/landing/app-cashier.jpg", alt: "צילום מסך של מסך התשלומים ב-Kalmea", title: "מכירות, קופה וחבילות", text: "כל תשלום במקום אחד, ואף מתעניינת לא נשכחת בין ההודעות." },
  { shot: "/landing/app-messages.jpg", alt: "צילום מסך של מרכז ההודעות ב-Kalmea", title: "הודעות ואוטומציות", text: "פחות הודעות שאת צריכה לזכור לשלוח בעצמך." },
  { shot: "/landing/app-advisor.jpg", alt: "צילום מסך של היועץ העסקי ב-Kalmea", title: "כלי AI וייעוץ עסקי", text: "תביני מה קורה בעסק שלך ומה כדאי לשפר." },
];

// Every answer below is a fact that is also stated in /terms, /privacy or the app itself. A question whose answer is
// not documented there does not belong here.
const FAQ = [
  {
    q: "צריך כרטיס אשראי כדי להתחיל?",
    a: "לא. נרשמים עם אימייל וסיסמה, והחודש הראשון חינם. בסוף החודש נסדר את ההמשך יחד. תראי הודעה בתוך האפליקציה, ואפשר לכתוב לנו בוואטסאפ.",
  },
  {
    q: "אפשר להפסיק מתי שרוצים?",
    a: "כן, אפשר להפסיק את השימוש בכל עת. כשחשבון נסגר, הנתונים נמחקים תוך 30 יום, חוץ מרשומות שחובה לשמור על פי דין.",
  },
  {
    q: "מה קורה למידע של הלקוחות שלי?",
    a: "המידע שלך נשאר שלך. כל עסק מבודד, ואת רואה רק את הלקוחות, התורים והלידים של העסק שלך. הערות בריאות מוצגות רק לך, בכרטיס הלקוחה, ואיננו מוכרים מידע. אף מערכת אינה מאובטחת ב-100%, והפרטים המלאים במדיניות הפרטיות.",
  },
  {
    q: "אפשר להשתמש בזה מהטלפון?",
    a: "כן. Kalmea בנויה לעבוד מהטלפון, ואפשר להוסיף אותה למסך הבית כמו אפליקציה.",
  },
  {
    q: "זה מתאים גם לציפורניסטיות?",
    a: "כן. יש תחום ציפורניים ודמו משלו, שאפשר לראות לפני שנרשמים.",
  },
];

const DEMOS = [
  { field: "cosmetics", title: "קוסמטיקה", href: "/demo/cosmetics" },
  { field: "nails", title: "ציפורניים", href: "/demo/nails" },
];

// The wordmark file's own size, so the page keeps its space before the image arrives.
const WORDMARK_W = 600;
const WORDMARK_H = 176;

// Real recordings of the demo tenant (marketing/landing-clips.mjs). Nothing in them is sent or saved.
const IN_ACTION = [
  { id: "leads", title: "נכנסה מתעניינת", text: "היא לא נשכחת בין ההודעות." },
  { id: "booking", title: "לקוחה קובעת תור", text: "לבד, מהקישור שלך." },
  { id: "messages", title: "הודעות מוכנות", text: "את עוברת עליהן ושולחת." },
  { id: "content", title: "תוכן בצבעים שלך", text: "תבניות מוכנות לעסק שלך." },
  { id: "data", title: "מה קורה בעסק", text: "הכנסות ודוחות, בלי חישובים." },
];

const HERO_PHOTOS = [
  { src: "/landing/photo-cosmetician.jpg", alt: "קוסמטיקאית מבצעת טיפול פנים ללקוחה", position: "center 58%" },
  { src: "/landing/photo-manicure.jpg", alt: "ציפורניסטית מורחת לק על ציפורני לקוחה", position: "center 40%" },
];

const pillBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "var(--brand-accent)", color: "var(--brand-cream)",
  border: "1.5px solid var(--brand-gold-hairline)", borderRadius: "var(--r-full)",
  padding: "14px 28px", fontSize: "var(--t-lg)", fontWeight: 700,
  textDecoration: "none", fontFamily: "inherit", cursor: "pointer",
};
const quietBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "none", border: "none", color: "var(--brand-accent)",
  fontSize: "var(--t-md)", fontWeight: 600, textDecoration: "underline",
  textUnderlineOffset: 3, padding: "10px 6px", cursor: "pointer", fontFamily: "inherit",
};

function SectionEyebrow({ children }) {
  return <p style={{ textAlign: "center", fontSize: "var(--t-sm)", color: "var(--brand-sage-text)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8 }}>{children}</p>;
}

export default function LandingPage({ signedIn = false }) {
  return (
    <div dir="rtl" className="lp-page">
      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <header className="lp-top">
        <Image src="/kalmea-wordmark.png" alt="Kalmea" width={WORDMARK_W} height={WORDMARK_H} priority style={{ width: "auto", height: 32 }} />
        <Link href={signedIn ? "/dashboard" : "/login"} className="kl-press" style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "none" }}>
          {signedIn ? "כניסה למערכת" : "להתחבר"}
        </Link>
      </header>

      {/* ── 2. HERO: who it is for, in the headline, before any scroll. ───── */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <h1 className="serif lp-h1">קוסמטיקאית או מניקוריסטית שעובדת לבד?</h1>
          <p className="lp-h1-sub">את מטפלת בלקוחות. Kalmea עוזרת לך לטפל בעסק.</p>
          <p className="lp-hero-desc">שיווק, ניהול ומכירות, הכול במערכת חכמה אחת. יומן תורים, ניהול לקוחות, הודעות, קמפיינים וכלי AI שעוזרים לך לעשות יותר, בפחות התעסקות.</p>
          <div className="lp-hero-cta">
            <Link href="/signup" className="kl-press" style={pillBtn}>התחילי חודש בחינם</Link>
            <p className="lp-cta-note">בלי כרטיס אשראי ובלי התחייבות</p>
            <a href="#how" className="kl-press lp-quiet">תראי איך זה עובד</a>
          </div>
        </div>
        <div className="lp-hero-visual">
          {HERO_PHOTOS.map((photo) => (
            <div key={photo.src} className="lp-hero-photo">
              <Image src={photo.src} alt={photo.alt} fill priority fetchPriority="high" sizes="(max-width: 860px) 50vw, 280px" style={{ objectFit: "cover", objectPosition: photo.position }} />
            </div>
          ))}
          <div className="lp-hero-phone">
            <Image src="/landing/app-home.jpg" alt="צילום מסך אמיתי של מסך הבית של Kalmea" width={560} height={1212} priority sizes="180px" className="lp-shot-img" />
          </div>
        </div>
      </section>

      {/* ── 3. BEFORE AND AFTER ───────────────────────────────────────────── */}
      <section className="lp-sec is-white">
        <div className="lp-wrap">
          <Reveal as="h2" className="serif lp-h2">אותו עסק. יום עבודה אחר לגמרי.</Reveal>
          <Reveal delay={60} className="lp-lead"><p>את לא צריכה לעבוד יותר קשה. את צריכה מערכת שתעזור לך לעבוד חכם יותר.</p></Reveal>
          <BeforeAfter rows={BEFORE_AFTER} />
          <div className="lp-cta-block">
            <Link href="/signup" className="kl-press" style={pillBtn}>התחילי חודש בחינם</Link>
            <p className="lp-cta-note">בלי כרטיס אשראי</p>
          </div>
        </div>
      </section>

      {/* ── 4. A REAL DAY ─────────────────────────────────────────────────── */}
      <section id="how" className="lp-sec">
        <div className="lp-wrap is-narrow">
          <Reveal as="h2" className="serif lp-h2">סיימת טיפול? מחכות לך עוד 12 הודעות?</Reveal>
          <Reveal delay={60} className="lp-lead"><p>ככה זה נראה ביום רגיל בקליניקה. בחרי רגע, ותראי מה משתנה.</p></Reveal>
          <ClinicDay moments={MOMENTS} />
          <p className="lp-fine">השמות בדוגמאות בדויים. ההודעות מוכנות בשבילך, ואת זו ששולחת.</p>
        </div>
      </section>

      {/* ── 5. FIVE AREAS: more than a calendar ───────────────────────────── */}
      <section className="lp-sec is-white">
        <div className="lp-wrap">
          <Reveal as="h2" className="serif lp-h2">הרבה מעבר ליומן</Reveal>
          <Reveal delay={60} className="lp-lead"><p>את טובה במה שאת עושה. עכשיו תני למערכת לעזור לך לנהל את כל השאר.</p></Reveal>
          <div className="lp-areas">
            {AREAS.map((a, i) => (
              <Reveal key={a.title} delay={Math.min(i, 3) * 50} className="lp-area">
                <div className="lp-area-shot"><Image src={a.shot} alt={a.alt} width={560} height={1212} loading="lazy" sizes="(max-width: 640px) 70vw, 240px" className="lp-shot-img" /></div>
                <h3 className="lp-area-title">{a.title}</h3>
                <p className="lp-area-text">{a.text}</p>
              </Reveal>
            ))}
          </div>
          <p className="lp-fine">צילומי מסך אמיתיים מתוך Kalmea, על עסק לדוגמה.</p>
        </div>
      </section>

      {/* ── 5c. IN ACTION ─────────────────────────────────────────────────── */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <Reveal as="h2" className="serif lp-h2">ככה זה נראה במערכת</Reveal>
          <Reveal delay={60} className="lp-lead"><p>הקלטות קצרות מתוך Kalmea, על עסק לדוגמה.</p></Reveal>
          <div className="lp-areas" data-testid="landing-videos">
            {IN_ACTION.map((v) => (
              <div key={v.id} className="lp-area">
                <DemoVideo mp4={`/media/landing-${v.id}.mp4`} poster={`/media/landing-${v.id}.jpg`} label={v.title} width={220} />
                <h3 className="lp-area-title">{v.title}</h3>
                <p className="lp-area-text">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5b. PRICE ─────────────────────────────────────────────────────── */}
      <section className="lp-sec is-white">
        <div className="lp-wrap is-narrow">
          <SectionEyebrow>כמה עולה לנהל עסק בלי Kalmea</SectionEyebrow>
          <CostTable rows={COST_ROWS} totalLow={TOTAL_LOW} totalHigh={TOTAL_HIGH} closingLine="Kalmea מרכזת את הכלים האלה במקום אחד." />
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textAlign: "center", marginTop: 10 }}>הסכומים הם הערכה לפי מחירי שוק.</p>
          <div style={{ textAlign: "center", marginTop: 34 }}>
            <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", fontWeight: 600, marginBottom: 6 }}>ו-Kalmea</p>
            <p className="serif" style={{ fontSize: "var(--t-hero)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 6 }}>
              {priceHe(PLAN_PRICES.regular)} <span style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>לחודש</span>
            </p>
            {/* No end date and no automatic expiry: the launch price stays on the page until the owner removes it by hand. */}
            <p style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>מחיר היכרות {priceHe(PLAN_PRICES.launch)} לזמן מוגבל</p>
            <p style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--brand-accent)" }}>החודש הראשון עלינו, בלי כרטיס אשראי.</p>
            <p data-testid="price-payback" style={{ fontSize: "var(--t-md)", color: "var(--ink)", lineHeight: 1.6, margin: "14px auto 0", maxWidth: 380, padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--brand-cream)", border: "1px solid var(--line)" }}>
              שניים או שלושה תורים בחודש שלא התפספסו בזכות תזכורת או קישור הזמנה, והמחיר כבר חוזר.
            </p>
          </div>
        </div>
      </section>

      {/* ── 8b. WHO IS BEHIND KALMEA ─────────────────────────────────────── */}
      <section className="lp-sec">
        <div className="lp-wrap is-narrow" style={{ textAlign: "center" }}>
          <Reveal as="h2" className="serif lp-h2">נולדה מתוך הקליניקה. נבנתה בשביל העסק שלך.</Reveal>
          <Reveal delay={60} className="lp-lead">
            <p>Kalmea נבנתה על ידי קוסמטיקאית מוסמכת, שעובדת בעצמה בעסק שלה, כל יום. היא מכירה מקרוב את ההודעות בין טיפול לטיפול, את היומן שצריך למלא ואת השיווק שנדחה לסוף היום. מזה נולדה המערכת.</p>
          </Reveal>
        </div>
      </section>

      {/* ── 9. DEMO ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>נסי לפני שנרשמים</SectionEyebrow>
        <p style={{ textAlign: "center", fontSize: "var(--t-md)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 4 }}>
          יש דמו נפרד לקוסמטיקאיות ודמו נפרד לציפורניסטיות.
        </p>
        <p style={{ textAlign: "center", fontSize: "var(--t-md)", color: "var(--ink-2)", lineHeight: 1.7, marginTop: 6 }}>
          אפשר להיכנס לדמו של{" "}
          {DEMOS.map((d, i) => (
            <span key={d.field}>
              {/* A plain <a>: /demo/<field> is a route that signs into the demo account, and <Link> would prefetch it (a GET) while scrolling. */}
              {i > 0 && " או של "}
              <a href={d.href} className="kl-press" style={{ color: "var(--brand-accent)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>{d.title}</a>
            </span>
          ))}
          . עסק לדוגמה, ולא נשלח שום דבר באמת.
        </p>
      </section>

      {/* ── 9b. FAQ ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 620, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>שאלות נפוצות</SectionEyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {FAQ.map((f) => (
            <details key={f.q} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 18px" }}>
              <summary style={{ cursor: "pointer", fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)" }}>{f.q}</summary>
              <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.7, marginTop: 10 }}>{f.a}</p>
            </details>
          ))}
        </div>
        {supportWhatsAppUrl("היי, יש לי שאלה על Kalmea") && (
          <p style={{ textAlign: "center", marginTop: 18 }}>
            <a href={supportWhatsAppUrl("היי, יש לי שאלה על Kalmea")} target="_blank" rel="noopener noreferrer" className="kl-press" style={pillBtn}>
              יש שאלה? כתבי לנו בוואטסאפ
            </a>
          </p>
        )}
      </section>

      {/* ── 10. FINAL CTA ─────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "60px 20px 70px" }}>
        <Reveal as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 18 }}>
          החודש הראשון עלינו, כל מה שנשאר זה להתחיל
        </Reveal>
        <Reveal delay={120}>
          <Link href="/signup" className="kl-press" style={pillBtn}>
            התחילי חודש בחינם
          </Link>
        </Reveal>
        <Reveal delay={180} style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginTop: 12 }}>
          <p>בלי כרטיס אשראי ובלי התחייבות</p>
        </Reveal>
      </section>

      <footer style={{ textAlign: "center", padding: "0 20px 30px", fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>
        <PublicFooterLinks style={{ padding: "0 0 8px" }} />
        <p>© {new Date().getFullYear()} Kalmea</p>
        <KalmeaLegalFooter showBusinessLine={false} style={{ marginTop: 6 }} />
      </footer>
    </div>
  );
}
