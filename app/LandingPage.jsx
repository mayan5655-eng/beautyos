// app/LandingPage.jsx
//
// The real / for a logged-out visitor - what an ad click actually hits.
// Server component by default: everything below is static HTML on first
// paint except the two small client islands (Reveal, CostTable) that do
// the scroll-in and count-up. Same brand language as the ads: light,
// airy, no dark sections, deep green on text/buttons/marks only.

import Image from "next/image";
import Link from "next/link";
import Reveal from "./landing/Reveal";
import CostTable from "./landing/CostTable";
import PhoneMock from "./landing/PhoneMock";
import DemoVideo from "./landing/DemoVideo";
import {
  ICON_CALENDAR, ICON_FRAME, ICON_WALLET, ICON_MICROPHONE, ICON_FLOWER,
} from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
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
  { before: "מחברת תורים שמתבלבלת", after: "יומן דיגיטלי שמכין לך את התזכורות" },
  { before: "וואטסאפים שנשכחים בלי מענה", after: "תזכורות מוכנות לשליחה, יום לפני" },
  { before: "לקוחה כותבת ואת בטיפול", after: "היא קובעת תור לבד, מהדף שלך, גם בלילה" },
  { before: "פנקס תשלומים ביד", after: "קופה שמסדרת את כל התשלומים במקום אחד" },
  { before: "שעות על עיצוב פוסט אחד", after: "פוסט מוכן בלחיצה, בצבעים שלך" },
  { before: "לקוחות שנעלמות ולא חוזרות", after: "הודעת חזרה מוכנה אחרי 90 יום, ואת קובעת את מספר הימים" },
];

const PILLARS = [
  { icon: ICON_CALENDAR, title: "יומן מלא", text: "לקוחה קובעת תור לבד מהקישור שלך, ואת רואה הכל במקום אחד." },
  { icon: ICON_FRAME, title: "נוכחות ברשתות", text: "פוסטים ורילסים מוכנים, כבר בצבעים ובלוגו שלך." },
  { icon: ICON_WALLET, title: "לקוחות שחוזרות", text: "תזכורת מוכנה ללקוחה שלא הגיעה מזמן, כדי שהיא תקבע שוב." },
];

const VOICE_LINES = [
  "קבעי תור לרונית מחר בעשר וחצי",
  "מה יש לי מחר?",
  "כמה הכנסתי החודש?",
  "תרשמי תשלום של 200 שקל לרונית",
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
    a: "כן. קלמיה בנויה לעבוד מהטלפון, ואפשר להוסיף אותה למסך הבית כמו אפליקציה.",
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

const HERO_PHOTOS = [
  { src: "/defaults/facial-classic.jpg", alt: "קוסמטיקאית מורחת מסכה על פני לקוחה בטיפול פנים", position: "center 35%" },
  { src: "/defaults/nails-manicure.jpg", alt: "ציפורניסטית עובדת על הציפורניים של לקוחה", position: "center 45%" },
];

// The videos from /tutorials. The files stay where the tutorials page reads them; demo-20s stays in public/media.
const VIDEOS = [
  { id: "welcome", title: "מה קלמיה עושה בשבילך" },
  { id: "booking", title: "איך לקוחה קובעת תור לבד" },
  { id: "tour", title: "סיור בכל המסכים" },
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

export default function LandingPage() {
  return (
    <div dir="rtl" style={{ background: "var(--brand-cream, #F0EADE)", fontFamily: "var(--sans)", overflowX: "hidden" }}>
      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <header style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <Image src="/kalmea-wordmark.png" alt="קלמיה" width={WORDMARK_W} height={WORDMARK_H} priority style={{ width: "auto", height: 34 }} />
          <Link href="/login" className="kl-press" style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "none" }}>
            להתחבר
          </Link>
        </div>
        {/* Two photos so both audiences see their own work in the first second. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, height: "clamp(190px, 31vw, 340px)" }}>
          {HERO_PHOTOS.map((photo) => (
            <div key={photo.src} style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r-lg)" }}>
              <Image src={photo.src} alt={photo.alt} fill priority fetchPriority="high" sizes="(max-width: 1100px) 50vw, 550px" style={{ objectFit: "cover", objectPosition: photo.position }} />
            </div>
          ))}
        </div>
      </header>

      {/* ── 2. HERO ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "34px 20px 10px", textAlign: "center" }}>
        <Reveal immediate style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--brand-sage-text)", marginBottom: 8 }}>
          <p>לקוסמטיקאיות ולציפורניסטיות עצמאיות</p>
        </Reveal>
        <Reveal immediate as="h1" className="serif" style={{ fontSize: "var(--t-display, 40px)", fontWeight: 900, color: "var(--brand-accent)", lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 14 }}>
          עונה לוואטסאפים באמצע טיפול?
        </Reveal>
        <Reveal immediate delay={80} style={{ fontSize: "var(--t-lg)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 26 }}>
          <p>מהיום הלקוחות קובעות תור לבד, גם בלילה, ואת רואה הכל בטלפון אחד.<br />בנתה אותה קוסמטיקאית שעובדת בזה כל יום.</p>
        </Reveal>
        <Reveal immediate delay={160} style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="kl-press" style={pillBtn}>
            בואי נתחיל, חודש ראשון חינם
          </Link>
        </Reveal>
        <Reveal immediate delay={200} style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginTop: 12 }}>
          <p>בלי כרטיס אשראי ובלי התחייבות</p>
        </Reveal>
        <Reveal immediate delay={240} style={{ marginTop: 6 }}>
          <Link href="/demo" className="kl-press" style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            רוצה להציץ קודם? כניסה לדמו
          </Link>
        </Reveal>
      </section>

      {/* ── 3. PHONE MOCK ─────────────────────────────────────────────────── */}
      <Reveal as="section" delay={100} style={{ display: "flex", justifyContent: "center", padding: "26px 20px 10px" }}>
        <PhoneMock />
      </Reveal>

      {/* ── 4. "נבנתה למי שעובדת לבד" ─────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "56px 24px 10px", textAlign: "center" }}>
        <Reveal as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 14 }}>
          עובדת לבד? זה בדיוק בשבילך
        </Reveal>
        <Reveal delay={80} style={{ fontSize: "var(--t-md)", color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 16 }}>
          <p>בין לקוחה ללקוחה את קובעת תורים, עונה להודעות, מתכננת פוסטים ובודקת כמה הכנסת. את עושה הכל לבד.</p>
        </Reveal>
        <Reveal delay={160} style={{ fontFamily: "var(--font-hand), cursive", fontSize: "var(--t-2xl)", color: "var(--brand-highlight)" }}>
          ומשלמת על כל כלי בנפרד.
        </Reveal>
      </section>

      {/* ── 5. COST TABLE ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>כמה עולה לנהל עסק בלי קלמיה</SectionEyebrow>
        <CostTable rows={COST_ROWS} totalLow={TOTAL_LOW} totalHigh={TOTAL_HIGH} closingLine="קלמיה מרכזת את הכלים האלה במקום אחד." />
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textAlign: "center", marginTop: 10 }}>הסכומים הם הערכה לפי מחירי שוק.</p>
      </section>

      {/* ── 5b. KALMEA'S OWN PRICE ───────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "36px 20px 10px", textAlign: "center" }}>
        <Reveal>
          <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", fontWeight: 600, marginBottom: 6 }}>וקלמיה</p>
          <p className="serif" style={{ fontSize: "var(--t-hero)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 6 }}>
            {priceHe(PLAN_PRICES.regular)} <span style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>לחודש</span>
          </p>
          {/* No end date and no automatic expiry: the launch price stays on the page until the owner removes it by hand. */}
          <p style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>מחיר היכרות {priceHe(PLAN_PRICES.launch)} לזמן מוגבל</p>
          <p style={{ fontSize: "var(--t-lg)", fontWeight: 700, color: "var(--brand-accent)" }}>החודש הראשון עלינו, בלי כרטיס אשראי.</p>
          {/* The value in her own terms, next to the price: what one month has to save for the price to pay itself back. */}
          <p data-testid="price-payback" style={{ fontSize: "var(--t-md)", color: "var(--ink)", lineHeight: 1.6, margin: "14px auto 0", maxWidth: 380, padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--line)" }}>
            שניים או שלושה תורים בחודש שלא התפספסו בזכות תזכורת או קישור הזמנה, וקלמיה כבר מחזירה את עצמה.
          </p>
        </Reveal>
      </section>

      {/* ── 6. לפני / אחרי ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>מה משתנה ביום יום שלך</SectionEyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18 }}>
          {BEFORE_AFTER.map((pair, i) => (
            <Reveal key={pair.before} delay={(i % 3) * 80} style={{ background: "var(--surface)", borderRadius: "var(--r-md)", border: "1px solid var(--line)", padding: "16px 18px" }}>
              <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "line-through", marginBottom: 6 }}>{pair.before}</p>
              <p style={{ fontSize: "var(--t-md)", color: "var(--ink)", fontWeight: 600 }}>{pair.after}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 6b. DEMO VIDEO ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 800, margin: "0 auto", padding: "56px 0 10px", textAlign: "center" }}>
        <Reveal as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 6 }}>
          תראי בעצמך, זה לוקח דקה
        </Reveal>
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 18 }}>
          הסרטונים צולמו על עסק לדוגמה, אלה נתוני דמו.
        </p>
        {/* A row wider than a phone scrolls inside itself, so the next video peeks in; on a desktop all three sit side by side. */}
        <div data-testid="landing-videos" style={{ overflowX: "auto", scrollSnapType: "x mandatory", padding: "4px 20px 16px" }}>
          <div style={{ display: "flex", gap: 18, width: "max-content", margin: "0 auto" }}>
            {VIDEOS.map((v) => (
              <div key={v.id} style={{ width: 230, scrollSnapAlign: "center" }}>
                <p style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>{v.title}</p>
                <DemoVideo mp4={`/tutorials/kalmea-${v.id}.mp4`} poster={`/tutorials/kalmea-${v.id}.jpg`} label={v.title} width={230} sound />
              </div>
            ))}
          </div>
        </div>
        <noscript>
          <p style={{ marginTop: 8 }}><a href="/tutorials" style={{ color: "var(--brand-accent)" }}>לצפייה בסרטונים</a></p>
        </noscript>
      </section>

      {/* ── 6c. CALL AFTER THE VIDEOS ─────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "34px 20px 10px", textAlign: "center" }}>
        <Reveal as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 16 }}>
          נראה לך? עכשיו תורך
        </Reveal>
        <Reveal delay={80}>
          <Link href="/signup" className="kl-press" style={pillBtn}>
            בואי נתחיל, חודש ראשון חינם
          </Link>
        </Reveal>
        <Reveal delay={140} style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginTop: 12 }}>
          <p>בלי כרטיס אשראי</p>
        </Reveal>
      </section>

      {/* ── 7. THREE PILLARS ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 80} style={{ textAlign: "center", padding: "10px 14px" }}>
              <img alt="" src={p.icon} className="kl-flower-in" style={{ width: 52, height: 52, objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
              <p className="serif" style={{ fontSize: "var(--t-xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 6 }}>{p.title}</p>
              <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.6 }}>{p.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 8. VOICE ──────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "56px 20px 10px", textAlign: "center" }}>
        <Reveal>
          <BrandImage width={56} height={56} alt="" src={ICON_MICROPHONE} className="kl-flower-in" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        </Reveal>
        <Reveal delay={60} as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 18 }}>
          הידיים עסוקות? פשוט תגידי לה
        </Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {VOICE_LINES.map((line, i) => (
            <Reveal key={line} delay={i * 80 + 100} style={{ fontFamily: "var(--font-hand), cursive", fontSize: "var(--t-xl)", color: "var(--ink-2)" }}>
              {line}
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 8b. WHO IS BEHIND KALMEA ─────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "56px 24px 10px", textAlign: "center" }}>
        <Reveal as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 14 }}>
          מי בנתה את קלמיה
        </Reveal>
        <Reveal delay={80} style={{ fontSize: "var(--t-md)", color: "var(--ink-2)", lineHeight: 1.7 }}>
          <p>קלמיה נבנתה על ידי קוסמטיקאית מוסמכת, שעובדת בעצמה בעסק שלה, כל יום. היא נולדה מהעבודה האמיתית, מהדברים הקטנים שחסרו בין טיפול לטיפול.</p>
        </Reveal>
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
        {supportWhatsAppUrl("היי, יש לי שאלה על קלמיה") && (
          <p style={{ textAlign: "center", marginTop: 18 }}>
            <a href={supportWhatsAppUrl("היי, יש לי שאלה על קלמיה")} target="_blank" rel="noopener noreferrer" className="kl-press" style={pillBtn}>
              יש שאלה? כתבי לנו בוואטסאפ
            </a>
          </p>
        )}
      </section>

      {/* ── 10. FINAL CTA ─────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "60px 20px 70px" }}>
        <Reveal>
          <BrandImage width={48} height={48} alt="" src={ICON_FLOWER} className="kl-flower-in" style={{ width: 48, height: 48, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        </Reveal>
        <Reveal delay={60} as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 18 }}>
          החודש הראשון עלינו, כל מה שנשאר זה להתחיל
        </Reveal>
        <Reveal delay={120}>
          <Link href="/signup" className="kl-press" style={pillBtn}>
            בואי נתחיל
          </Link>
        </Reveal>
        <Reveal delay={180} style={{ fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)", marginTop: 12 }}>
          <p>בלי כרטיס אשראי ובלי התחייבות</p>
        </Reveal>
      </section>

      <footer style={{ textAlign: "center", padding: "0 20px 30px", fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>
        <PublicFooterLinks style={{ padding: "0 0 8px" }} />
        <p>© {new Date().getFullYear()} קלמיה</p>
        <KalmeaLegalFooter style={{ marginTop: 6 }} />
      </footer>
    </div>
  );
}
