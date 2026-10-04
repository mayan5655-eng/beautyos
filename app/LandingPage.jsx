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
import {
  BANNER_WIDE, BANNER_WIDE_W, BANNER_WIDE_H,
  ICON_CALENDAR, ICON_FRAME, ICON_WALLET, ICON_MICROPHONE, ICON_FLOWER,
} from "@/lib/brand";

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
  { before: "מחברת תורים שמתבלבלת", after: "יומן דיגיטלי שמזכיר לבד" },
  { before: "וואטסאפים שנשכחים בלי מענה", after: "תזכורות מוכנות לשליחה, יום לפני" },
  { before: "לקוחה כותבת ואת בטיפול", after: "בוט שעונה גם כשהידיים שלך תפוסות" },
  { before: "פנקס תשלומים ביד", after: "קופה שרושמת הכל אוטומטית" },
  { before: "שעות על עיצוב פוסט אחד", after: "פוסט מוכן בלחיצה, בצבעים שלך" },
  { before: "לקוחות שנעלמות ולא חוזרות", after: "הודעת חזרה מוכנה אחרי 60 יום" },
];

const PILLARS = [
  { icon: ICON_CALENDAR, title: "ניהול", text: "יומן, לקוחות ותשלומים, תמיד מסודרים במקום אחד." },
  { icon: ICON_FRAME, title: "שיווק", text: "פוסטים ורילסים מוכנים, כבר בצבעים ובלוגו שלך." },
  { icon: ICON_WALLET, title: "מכירות", text: "מהתור הראשון ועד התזכורת שמחזירה אותה." },
];

const VOICE_LINES = [
  "קבעי תור לרונית מחר בעשר וחצי",
  "מה יש לי מחר?",
  "כמה הכנסתי החודש?",
  "תרשמי תשלום של 200 שקל לרונית",
];

const DEMOS = [
  { field: "cosmetics", title: "קוסמטיקה", href: "/demo/cosmetics" },
  { field: "nails", title: "ציפורניים", href: "/demo/nails" },
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }} />
          <Link href="/login" className="kl-press" style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", textDecoration: "none" }}>
            להתחבר
          </Link>
        </div>
        <Image
          src={BANNER_WIDE}
          alt="קלמיה — עסק שפורח. חיים עם יותר שקט."
          width={BANNER_WIDE_W}
          height={BANNER_WIDE_H}
          priority
          fetchPriority="high"
          sizes="(max-width: 1100px) 100vw, 1100px"
          style={{ width: "100%", height: "auto", borderRadius: "var(--r-lg)" }}
        />
      </header>

      {/* ── 2. HERO ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "34px 20px 10px", textAlign: "center" }}>
        <Reveal as="h1" className="serif" style={{ fontSize: "var(--t-display, 40px)", fontWeight: 900, color: "var(--brand-accent)", lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 14 }}>
          במקום הקמפיינרית, המזכירה ומנהלת הסושיאל
        </Reveal>
        <Reveal delay={80} style={{ fontSize: "var(--t-lg)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 26 }}>
          <p>קלמיה עושה את זה בשבילך — תורים, תשלומים ותוכן שיווקי, במקום אחד.</p>
        </Reveal>
        <Reveal delay={160} style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/demo" className="kl-press" style={pillBtn}>
            להיכנס ולראות <span aria-hidden>←</span>
          </Link>
          <Link href="/signup" className="kl-press" style={quietBtn}>
            חודש ראשון חינם
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
          נבנתה למי שעובדת לבד
        </Reveal>
        <Reveal delay={80} style={{ fontSize: "var(--t-md)", color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 16 }}>
          <p>בלי צוות שיווק, בלי מזכירה, בלי מנהלת חשבונות. את קובעת תורים, עונה להודעות, מתכננת פוסטים, עוקבת אחרי ההכנסות — הכל לבד, בין לקוחה ללקוחה.</p>
        </Reveal>
        <Reveal delay={160} style={{ fontFamily: "var(--font-hand), cursive", fontSize: "var(--t-2xl)", color: "var(--brand-highlight)" }}>
          ומשלמת על כל אחד מהם בנפרד.
        </Reveal>
      </section>

      {/* ── 5. COST TABLE ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 560, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>כמה זה עולה בלי קלמיה</SectionEyebrow>
        <CostTable rows={COST_ROWS} totalLow={TOTAL_LOW} totalHigh={TOTAL_HIGH} closingLine="הכל נכנס למערכת אחת." />
      </section>

      {/* ── 6. לפני / אחרי ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>לפני ואחרי</SectionEyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18 }}>
          {BEFORE_AFTER.map((pair, i) => (
            <Reveal key={pair.before} delay={(i % 3) * 80} style={{ background: "var(--surface)", borderRadius: "var(--r-md)", border: "1px solid var(--line)", padding: "16px 18px" }}>
              <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-3)", textDecoration: "line-through", marginBottom: 6 }}>{pair.before}</p>
              <p style={{ fontSize: "var(--t-md)", color: "var(--ink)", fontWeight: 600 }}>{pair.after}</p>
            </Reveal>
          ))}
        </div>
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
          <img alt="" src={ICON_MICROPHONE} className="kl-flower-in" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        </Reveal>
        <Reveal delay={60} as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 18 }}>
          פשוט תגידי לה
        </Reveal>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {VOICE_LINES.map((line, i) => (
            <Reveal key={line} delay={i * 80 + 100} style={{ fontFamily: "var(--font-hand), cursive", fontSize: "var(--t-xl)", color: "var(--ink-2)" }}>
              “{line}”
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 9. DEMO ───────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 10px" }}>
        <SectionEyebrow>רוצה לראות קודם?</SectionEyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 10 }}>
          {DEMOS.map((d, i) => (
            <Reveal key={d.field} delay={i * 80}>
              <Link
                href={d.href}
                className="kl-press"
                style={{
                  display: "block", textAlign: "center", textDecoration: "none",
                  background: "var(--surface)", borderRadius: "var(--r-lg)", border: "1px solid var(--line)",
                  padding: "28px 18px", boxShadow: "var(--shadow-sm)",
                }}
              >
                <p className="serif" style={{ fontSize: "var(--t-xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 6 }}>{d.title}</p>
                <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)" }}>עסק אמיתי, נתונים לדוגמה. לא נשלח שום דבר באמת.</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 10. FINAL CTA ─────────────────────────────────────────────────── */}
      <section style={{ textAlign: "center", padding: "60px 20px 70px" }}>
        <Reveal>
          <img alt="" src={ICON_FLOWER} className="kl-flower-in" style={{ width: 48, height: 48, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        </Reveal>
        <Reveal delay={60} as="h2" className="serif" style={{ fontSize: "var(--t-2xl)", fontWeight: 700, color: "var(--brand-accent)", marginBottom: 18 }}>
          חודש ראשון חינם
        </Reveal>
        <Reveal delay={120}>
          <Link href="/signup" className="kl-press" style={pillBtn}>
            להתחיל עכשיו <span aria-hidden>←</span>
          </Link>
        </Reveal>
      </section>

      <footer style={{ textAlign: "center", padding: "0 20px 30px", fontSize: "var(--t-xs)", color: "var(--ink-3)" }}>
        <p>© {new Date().getFullYear()} קלמיה</p>
      </footer>
    </div>
  );
}
