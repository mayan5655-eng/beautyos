// app/LandingPage.jsx
//
// The real / for a logged-out visitor - what an ad click actually hits.
// Server component: everything below is static HTML on first paint except DemoVideo (a poster until she presses play).
//
// Less-text pass (2026-11-25): a visitor must get what Kalmea is in five seconds, from pictures, not paragraphs.
// Structure: hero (slogan, one subline, the "one question" screen, one button) -> three blocks (secretary, marketing, sales)
// -> founder strip -> price -> FAQ (closed). No block outside the FAQ is longer than 12 words. The long explanations of the
// old page (cost table, comparison list, before/after rows, "a real day", price details, founder story) now live in the FAQ,
// word for word where they were already documented; nothing that is not live today is promised anywhere.
//
// Owner, 2026-10-30: no AI images or AI faces, no invented testimonials or numbers; every screen in public/landing/app-*.jpg is a
// real screenshot of the demo tenant (marketing/landing-shots.mjs). Reminders and messages are "ready to send", never "sent for her":
// platform_settings.whatsapp_auto_utility_enabled is off.
// Owner, 2026-11-16: the launch price alone, no struck "regular" price and no end date (lib/planCopy.ts PRICE_LINE_HE).

import Image from "next/image";
import Link from "next/link";
import DemoVideo from "./landing/DemoVideo";
import PublicFooterLinks from "./PublicFooterLinks";
import KalmeaLegalFooter from "./KalmeaLegalFooter";
import { supportWhatsAppUrl } from "@/lib/support";
import { PLAN_PRICES, priceHe, annualPlanEnabled } from "@/lib/pricing";
import { annualOfferHe, daysHe } from "@/lib/planCopy";
import { publicGraceDays } from "@/lib/planState";
import PublicAnalytics from "./PublicAnalytics";
import MetaPixel from "./MetaPixel";
import Testimonials from "./landing/Testimonials";
import { landingClaims } from "@/lib/landingClaims";

// The three jobs. Each: an icon, a title (max 3 words), one line (max 6 words) and one real screen.
// Everything named here is live for every business today. Reminders are "ready to send" (automatic WhatsApp is off).
const BLOCKS = [
  {
    id: "secretary", icon: "calendar", title: "המזכירה שלך", text: "יומן, תזכורות מוכנות, וקביעת תור עצמית.",
    shot: "/landing/app-calendar.jpg", alt: "צילום מסך של היומן ב-Kalmea",
  },
  {
    id: "marketing", icon: "spark", title: "המשווקת שלך", text: "רעיונות לתוכן, עיצובים ופוסטים מוכנים.",
    shot: "/landing/app-content.jpg", alt: "צילום מסך של מסך התוכן ב-Kalmea",
  },
  {
    id: "sales", icon: "wallet", title: "מנהלת המכירות", text: "מתעניינות, מעקבים ותשלומים במקום אחד.",
    shot: "/landing/app-leads.jpg", alt: "צילום מסך של מסך הפניות ב-Kalmea",
  },
];

// The comparison list of the old page (only what every business has today), now an FAQ answer.
const COMPARE_EXTRAS = [
  "פוסטים ורילס בעזרת AI, בצבעים ובסגנון של העסק שלך",
  "הודעת חזרה מוכנה ללקוחה שלא הגיעה מזמן",
  "הצעה ללקוחות מתאימות כשמתפנה תור",
  "הצהרת בריאות דיגיטלית ותזכורת לבדיקת רגישות",
  "שוברי מתנה מעוצבים בצבעים שלך, עם קוד שנבדק בקופה",
  // On by default for every cosmetics business (lib/featureFlags.ts skinScanVisible).
  "סריקת עור עם דוח אישי ללקוחה, שמביאה אלייך פניות (לקוסמטיקאיות)",
  "יועצת עסקית שמראה לך מה קורה בעסק",
];
// Behind a deployment switch (lib/landingClaims.ts): only while it is really on for every business.
function compareExtras(claims) {
  const out = [...COMPARE_EXTRAS];
  if (claims.deposits) out.splice(3, 0, claims.depositBit ? "מקדמה בכרטיס או בביט כבר בקביעת התור" : "מקדמה בכרטיס כבר בקביעת התור");
  if (claims.receipts) out.splice(4, 0, "מסמכי מס רשמיים מחשבון מורנינג שלך, ישר מהקופה");
  return out;
}

const DEMOS = [
  { field: "cosmetics", title: "קוסמטיקה", href: "/demo/cosmetics" },
  { field: "nails", title: "ציפורניים", href: "/demo/nails" },
];

const demoLinkStyle = { color: "var(--brand-accent)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 };

// The wordmark file's own size, so the page keeps its space before the image arrives.
const WORDMARK_W = 600;
const WORDMARK_H = 176;

const pillBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "var(--brand-accent)", color: "var(--brand-cream)",
  border: "1.5px solid var(--brand-gold-hairline)", borderRadius: "var(--r-full)",
  padding: "14px 28px", fontSize: "var(--t-lg)", fontWeight: 700,
  textDecoration: "none", fontFamily: "inherit", cursor: "pointer",
};

// Plain outline icons, drawn here: no icon font, no stock art.
const ICON_PATHS = {
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" /></>,
};
function BlockIcon({ name }) {
  return (
    <svg className="lp-block-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function LandingPage({ signedIn = false }) {
  const claims = landingClaims();
  const grace = publicGraceDays();
  // Every answer is a fact that is also stated in /terms, /privacy or the app itself. A question whose answer is not documented
  // there does not belong here. Closed by default (plain <details>, no JS).
  const faq = [
    {
      q: "צריך כרטיס אשראי כדי להתחיל?",
      // The grace sentence follows NEXT_PUBLIC_BOOKING_GRACE_DAYS (lib/planState publicGraceDays): her booking page stays open that long.
      a: `לא. נרשמים עם אימייל וסיסמה, והחודש הראשון חינם. בסוף החודש המערכת נסגרת עד שמצטרפים למנוי, ושום דבר לא נמחק.${grace > 0 ? ` דף ההזמנות שלך ממשיך לקבל תורים עוד ${daysHe(grace)}, כדי שאף לקוחה לא תיתקע.` : ""} לפני כן תראי הודעה בתוך האפליקציה, ואפשר לכתוב לנו בוואטסאפ.`,
    },
    {
      q: "כמה זה עולה?",
      // True in both of Kalmea's tax modes (lib/kalmeaBusiness.ts); Kalmea charges only the subscription, card fees go to Grow (lib/growPricing.ts).
      a: `מחיר השקה ${priceHe(PLAN_PRICES.launch)} לחודש. זה המחיר הסופי: אין תוספת מע״מ ואין עלויות נסתרות. Kalmea לא לוקחת אחוזים מהמכירות שלך. שניים או שלושה תורים בחודש שלא התפספסו בזכות תזכורת או קישור הזמנה, והמחיר כבר חוזר.${annualPlanEnabled() ? ` ${annualOfferHe(PLAN_PRICES.launch)}` : ""}`,
    },
    {
      q: "אפשר להפסיק מתי שרוצים?",
      a: "כן, אפשר להפסיק את השימוש בכל עת, וכל מה שיצרת נשמר אם תרצי לחזור. כשמבקשים למחוק את החשבון, הנתונים נמחקים תוך 30 יום, חוץ מרשומות שחובה לשמור על פי דין.",
    },
    {
      q: "מה Kalmea נותנת מעבר למערכת תורים?",
      list: compareExtras(claims),
      a: "מערכת תורים רגילה עולה בדרך כלל 100 עד 170 ₪ לחודש, לפני מע״מ, ונותנת יומן ותזכורות. Kalmea נותנת גם את זה, ועוד:",
      fine: "הטווח לפי מחירונים פומביים של מערכות תורים בישראל, נובמבר 2026.",
    },
    {
      q: "איך עובדות התזכורות וההודעות?",
      a: "Kalmea מכינה הודעות ותזכורות מוכנות לשליחה, יום לפני כל טיפול. את עוברת עליהן ושולחת, ואת זו שמחליטה מה יוצא. הלקוחות קובעות תורים בעצמן מהקישור האישי שלך, 24/7, ומזיזות תור לבד לפי מדיניות הביטול שלך.",
    },
    {
      q: "מה קורה ללקוחה שנעלמה או לתור שהתפנה?",
      a: "Kalmea מזהה לקוחה שלא חזרה אחרי 90 יום ומכינה לך הודעה אישית. את קובעת כמה ימים, ואת שולחת. כשמתפנה תור היא שואלת אם להציע אותו בוואטסאפ ללקוחות מתאימות.",
    },
    {
      q: "מה קורה למידע של הלקוחות שלי?",
      a: "המידע שלך נשאר שלך. כל עסק מבודד, ואת רואה רק את הלקוחות, התורים והלידים של העסק שלך. הערות בריאות מוצגות רק לך, בכרטיס הלקוחה, ואיננו מוכרים מידע. אף מערכת אינה מאובטחת ב-100%, והפרטים המלאים במדיניות הפרטיות.",
    },
    // Live for every business (the import sheet in app/beautyos.jsx): phone contacts and a pasted list. The Excel / other-system
    // file import is behind NEXT_PUBLIC_IMPORT_TOOL, so it is not promised here.
    {
      q: "יש לי כבר לקוחות. צריך להקליד את כולן מחדש?",
      a: "לא. אפשר להעביר את הלקוחות שלך מאנשי הקשר בטלפון, או להדביק רשימה, שורה לכל לקוחה.",
    },
    {
      q: "אפשר להשתמש בזה מהטלפון?",
      a: "כן. Kalmea בנויה לעבוד מהטלפון, ואפשר להוסיף אותה למסך הבית כמו אפליקציה.",
    },
    {
      q: "זה מתאים גם למניקוריסטיות?",
      a: "כן. יש תחום ציפורניים ודמו משלו, שאפשר לראות לפני שנרשמים.",
    },
    {
      q: "אפשר לנסות לפני שנרשמים?",
      demos: true,
      a: "כן. יש דמו נפרד לקוסמטיקאיות ודמו נפרד למניקוריסטיות. זה עסק לדוגמה, ולא נשלח שום דבר באמת.",
    },
    {
      q: "מי עומדת מאחורי Kalmea?",
      a: "Kalmea נבנתה על ידי קוסמטיקאית מוסמכת, שעובדת בעצמה בעסק שלה, כל יום. היא מכירה מקרוב את ההודעות בין טיפול לטיפול, את היומן שצריך למלא ואת השיווק שנדחה לסוף היום. מזה נולדה המערכת.",
    },
  ];

  return (
    <div dir="rtl" className="lp-page">
      <PublicAnalytics />
      {/* Kalmea's own Meta Pixel: renders nothing while NEXT_PUBLIC_META_PIXEL_ID is empty (lib/metaPixel.ts). */}
      <MetaPixel />
      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <header className="lp-top">
        <Image src="/kalmea-wordmark.png" alt="Kalmea" width={WORDMARK_W} height={WORDMARK_H} priority style={{ width: "auto", height: 32 }} />
        <Link href={signedIn ? "/dashboard" : "/login"} className="kl-press" style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "none" }}>
          {signedIn ? "כניסה למערכת" : "להתחבר"}
        </Link>
      </header>

      {/* ── 2. HERO: the slogan, one subline, the "one question" screen, one button. All of it above the fold at 390px. ── */}
      <section className="lp-hero2">
        <div className="lp-hero2-text">
          <h1 className="serif lp-h1">קוסמטיקאית או מניקוריסטית שעובדת לבד?</h1>
          <p className="lp-h1-sub">את מטפלת בלקוחות. Kalmea עוזרת לך לטפל בעסק.</p>
          <p className="lp-hero2-sub">מזכירה, משווקת ומנהלת מכירות, באפליקציה אחת.</p>
        </div>
        <div className="lp-hero2-phone" data-testid="hero-phone">
          <Image src="/landing/app-advisor.jpg" alt="צילום מסך של Kalmea: שאלה אחת ליועצת העסקית" width={560} height={1212} priority fetchPriority="high" sizes="200px" className="lp-shot-img" />
        </div>
        <div className="lp-hero2-cta">
          <Link href="/signup" className="kl-press" style={pillBtn}>התחילי חודש בחינם</Link>
          <p className="lp-cta-note">בלי כרטיס אשראי</p>
        </div>
      </section>

      {/* ── 3. THREE BLOCKS: secretary, marketing, sales ──────────────────── */}
      <section className="lp-sec is-white" data-testid="landing-blocks">
        <div className="lp-wrap">
          <div className="lp-trio">
            {BLOCKS.map((b) => (
              <article key={b.id} className="lp-block" data-block={b.id}>
                <div className="lp-block-shot">
                  <Image src={b.shot} alt={b.alt} width={560} height={1212} loading="lazy" sizes="(max-width: 860px) 60vw, 280px" className="lp-shot-img" />
                </div>
                <div className="lp-block-head">
                  <BlockIcon name={b.icon} />
                  <h2 className="lp-block-title">{b.title}</h2>
                </div>
                <p className="lp-block-text">{b.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. FOUNDER STRIP: her own explainer reel, one sentence. ───────── */}
      <section className="lp-sec" data-testid="landing-founder">
        <div className="lp-wrap is-narrow">
          <div className="lp-founder">
            <DemoVideo mp4="/media/landing-founder.mp4" poster="/media/landing-founder.jpg" label="מעיין, המייסדת, מסבירה למי Kalmea מתאימה" width={150} sound />
            <p className="lp-founder-line">אני קוסמטיקאית שעובדת בעצמי, ו-Kalmea נולדה מהקליניקה שלי.</p>
          </div>
        </div>
      </section>

      {/* ── 4b. TESTIMONIALS: renders nothing at all while lib/testimonials.ts is empty. */}
      <Testimonials />

      {/* ── 5. PRICE ──────────────────────────────────────────────────────── */}
      <section className="lp-sec is-white" data-testid="landing-price">
        <div className="lp-wrap is-narrow" style={{ textAlign: "center" }}>
          {/* Owner's decision 2026-11-16: the launch price only, no struck "regular" price beside it and no end date. */}
          <p className="serif lp-price">
            {priceHe(PLAN_PRICES.launch)} <span className="lp-price-unit">לחודש</span>
          </p>
          <p className="lp-price-label">מחיר השקה</p>
          <p className="lp-price-free">החודש הראשון חינם, בלי כרטיס אשראי.</p>
          <div className="lp-cta-block">
            <Link href="/signup" className="kl-press" style={pillBtn}>התחילי חודש בחינם</Link>
          </div>
          {/* A plain <a>: /demo/<field> is a route that signs into the demo account, and <Link> would prefetch it (a GET) while scrolling. */}
          <p className="lp-cta-note" data-testid="hero-demos">
            {DEMOS.map((d, i) => (
              <span key={d.field}>
                {i > 0 && " · "}
                <a href={d.href} className="kl-press" style={demoLinkStyle}>דמו {d.title}</a>
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ── 6. FAQ: closed by default. The long explanations live here. ───── */}
      <section className="lp-faq" data-testid="landing-faq">
        <h2 className="serif lp-faq-title">שאלות נפוצות</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {faq.map((f) => (
            <details key={f.q} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 18px" }}>
              <summary style={{ cursor: "pointer", fontSize: "var(--t-md)", fontWeight: 700, color: "var(--ink)" }}>{f.q}</summary>
              <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.7, marginTop: 10 }}>{f.a}</p>
              {f.list && (
                <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
                  {f.list.map((t) => (
                    <li key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "var(--t-sm)", color: "var(--ink)", lineHeight: 1.6 }}>
                      <span aria-hidden="true" style={{ color: "var(--brand-accent)", fontWeight: 700 }}>✓</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
              {f.fine && <p className="lp-fine" style={{ textAlign: "start" }}>{f.fine}</p>}
              {f.demos && (
                <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", lineHeight: 1.7, marginTop: 8 }}>
                  {DEMOS.map((d, i) => (
                    <span key={d.field}>
                      {i > 0 && " · "}
                      <a href={d.href} className="kl-press" style={demoLinkStyle}>דמו {d.title}</a>
                    </span>
                  ))}
                </p>
              )}
            </details>
          ))}
        </div>
        {claims.deposits && <p className="lp-fine" data-testid="deposit-note">מקדמה ומדיניות ביטול פועלות אחרי חיבור לסליקה של Grow.</p>}
        {supportWhatsAppUrl("היי, יש לי שאלה על Kalmea") && (
          <p style={{ textAlign: "center", marginTop: 18 }}>
            <a href={supportWhatsAppUrl("היי, יש לי שאלה על Kalmea")} target="_blank" rel="noopener noreferrer" className="kl-press" style={pillBtn}>
              יש שאלה? כתבי לנו בוואטסאפ
            </a>
          </p>
        )}
      </section>

      <footer style={{ textAlign: "center", padding: "40px 20px 30px", fontSize: "var(--t-xs)", color: "var(--ink-2)" }}>
        <PublicFooterLinks style={{ padding: "0 0 8px" }} />
        <p>© {new Date().getFullYear()} Kalmea</p>
        <KalmeaLegalFooter showBusinessLine={false} style={{ marginTop: 6 }} />
      </footer>
    </div>
  );
}
