// app/accessibility/page.tsx
// The public accessibility statement (הצהרת נגישות), required for public websites by Israeli accessibility regulations
// (Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 2013; Israeli Standard 5568 / WCAG 2.0 AA).
// Server component, no session: any top-level single segment is public (lib/supabase/middleware.ts).
//
// The coordinator's name, phone and email are NOT written here: they live in lib/accessibilityContact.ts (placeholders to fill in).
// Every claim in "מה עשינו" is something the audit of 2026-10-09 actually checked: add a line only after the thing is true, and
// remove it when it stops being true. test-accessibility.ts pins the wiring behind the claims.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, BRAND_WASH_SOFT } from "@/lib/brand";
import { ACCESSIBILITY_COORDINATOR as C, ACCESSIBILITY_UPDATED } from "@/lib/accessibilityContact";
import PublicFooterLinks from "../PublicFooterLinks";

export const metadata: Metadata = {
  title: "הצהרת נגישות · Kalmea",
  description: "הצהרת הנגישות של Kalmea: מה עשינו כדי שהאתר יהיה נגיש, מגבלות ידועות, ואיך לפנות אלינו.",
};

const DID = [
  "האתר כתוב בעברית, מימין לשמאל, ושפת הדף מוגדרת כעברית כדי שתוכנות הקראה יקראו אותו נכון.",
  "בכל עמוד יש כותרת ראשית, ומבנה כותרות ואזורים שמאפשר לדלג בין חלקים. בראש כל עמוד יש קישור \"דלגי לתוכן הראשי\" שמופיע כשלוחצים על מקש Tab.",
  "אפשר להשתמש בעמודי ההרשמה וההזמנה במקלדת בלבד, כולל בחירת יום ושעה. המיקוד במקלדת מסומן בבירור במסגרת כהה.",
  "לכל שדה בטופס יש תווית, והדפדפן יכול להשלים אוטומטית שם, טלפון ואימייל. הודעות שגיאה מוקראות בתוכנות הקראה כשהן מופיעות.",
  "לתמונות עם משמעות יש טקסט חלופי, ותמונות קישוט מוסתרות מתוכנות הקראה.",
  "ניגודיות הצבעים בעמודי ההרשמה, ההזמנה, התנאים והפרטיות נבדקה, וטקסט רגיל עומד ביחס ניגודיות של 4.5 ל-1 לפחות.",
  "אפשר להגדיל את הדף והטקסט בדפדפן, והעמודים מותאמים למסכי טלפון.",
  "אין באתר תוכן מהבהב, ואין השמעת קול אוטומטית.",
];

const LIMITS = [
  "טופס ההצהרה שהלקוחה חותמת עליו מחייב חתימה באצבע או בעכבר, ואין בו כרגע חלופה במקלדת. מי שמתקשה לחתום מוזמנת לפנות לעסק, והוא יסדיר את החתימה בדרך אחרת.",
  "אזור הניהול של בעלות העסקים (היומן, הקופה, סטודיו העיצוב) נבדק רק באופן חלקי, ויש בו רכיבים שעדיין לא נגישים במלואם.",
  "כל עסק בוחר צבע מיתוג לעמוד שלו, וצבע בהיר מאוד עלול להקטין את הניגודיות באותו עמוד.",
  "תמונות, לוגו וגלריות שהעסקים מעלים בעצמם עלולות להיות בלי טקסט חלופי.",
  "בורר התאריך בחלק מהמכשירים הוא רכיב של מערכת ההפעלה, והנגישות שלו נקבעת על ידיה.",
  "האתר עבר בדיקה פנימית, אך עדיין לא עבר בדיקה של מורשה נגישות חיצוני.",
];

export default function AccessibilityPage() {
  return (
    <div dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>הצהרת נגישות</h1>
        </header>

        <Section heading="המחויבות שלנו">
          <P>
            קלמיה רוצה שכל אדם יוכל להשתמש באתר ובעמודי ההזמנה שלנו בנוחות ובעצמאות, כולל אנשים עם מוגבלות.
            אנחנו פועלים כדי שהאתר יתאים לתקן הישראלי ת&quot;י 5568, המבוסס על הנחיות WCAG 2.0 ברמה AA, ולתקנות שוויון זכויות
            לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע&quot;ג-2013.
          </P>
        </Section>

        <Section heading="מה עשינו">
          <List items={DID} />
        </Section>

        <Section heading="מגבלות ידועות">
          <P>אנחנו ממשיכים לשפר, ואלה המגבלות שאנחנו מכירים:</P>
          <List items={LIMITS} />
        </Section>

        <Section heading="פניות בנושא נגישות">
          <P>
            נתקלת בבעיה, חסר משהו או שיש לך הצעה לשיפור? נשמח לשמוע ולתקן. אפשר לפנות לרכז/ת הנגישות שלנו:
          </P>
          <dl style={dlStyle} data-testid="accessibility-contact">
            <dt style={dtStyle}>שם</dt>
            <dd style={ddStyle}>{C.name}</dd>
            <dt style={dtStyle}>טלפון</dt>
            <dd style={ddStyle} dir="ltr"><a href={`tel:${C.phone.replace(/[^\d+]/g, "")}`} style={linkStyle}>{C.phone}</a></dd>
            <dt style={dtStyle}>אימייל</dt>
            <dd style={ddStyle} dir="ltr"><a href={`mailto:${C.email}`} style={linkStyle}>{C.email}</a></dd>
          </dl>
          <P>
            כדי שנוכל לטפל מהר, כדאי לכתוב באיזה עמוד נתקלת בבעיה, באיזה דפדפן או מכשיר, ובאיזו תוכנת עזר את משתמשת (אם יש).
            נחזור אליך בהקדם, ואם אפשר, נציע חלופה עד שהתקלה תתוקן.
          </P>
        </Section>

        <footer style={footerStyle}>
          עודכן לאחרונה: {ACCESSIBILITY_UPDATED}
        </footer>
        <PublicFooterLinks style={{ padding: "6px 0 0" }} />
      </article>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>{heading}</h2>
      {children}
    </section>
  );
}
function P({ children }: { children: ReactNode }) { return <p style={bodyStyle}>{children}</p>; }
function List({ items }: { items: string[] }) {
  return <ul style={listStyle}>{items.map((t) => <li key={t} style={{ marginBottom: 8 }}>{t}</li>)}</ul>;
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh", background: BRAND_WASH_SOFT, padding: "48px 18px", display: "flex", justifyContent: "center",
  fontFamily: "var(--font-heebo), 'Heebo', 'Assistant', sans-serif", color: DEEP,
};
const cardStyle: CSSProperties = {
  width: "100%", maxWidth: 760, background: SURFACE, borderRadius: "var(--r-lg)", padding: "44px 40px",
  border: `1px solid ${ACCENT_LINE}`, boxShadow: "var(--shadow-accent)", boxSizing: "border-box", alignSelf: "flex-start",
};
const brandStyle: CSSProperties = { fontSize: "var(--t-xs)", fontWeight: 600, letterSpacing: 2, color: MUTED, marginBottom: 10 };
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-hero)", fontWeight: 600, color: DEEP, lineHeight: 1.2, marginBottom: 4,
};
const sectionStyle: CSSProperties = { paddingTop: 24, marginTop: 24, borderTop: `1px solid ${ACCENT_LINE}` };
const h2Style: CSSProperties = {
  fontFamily: "var(--font-frank), 'Frank Ruhl Libre', serif", fontSize: "var(--t-2xl)", fontWeight: 600, color: DEEP, marginBottom: 10,
};
const bodyStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.85, color: DEEP, marginBottom: 12 };
const listStyle: CSSProperties = { fontSize: "var(--t-md)", lineHeight: 1.8, color: DEEP, paddingInlineStart: 22, margin: "0 0 12px" };
const dlStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 18px", margin: "6px 0 16px", padding: "14px 16px",
  background: "var(--brand-cream, #FBF8F1)", borderRadius: "var(--r-md)", border: `1px solid ${ACCENT_LINE}`,
};
const dtStyle: CSSProperties = { fontWeight: 700, color: DEEP };
const ddStyle: CSSProperties = { margin: 0, color: DEEP, textAlign: "start" };
const linkStyle: CSSProperties = { color: ACCENT, fontWeight: 600, textDecoration: "underline" };
const footerStyle: CSSProperties = { marginTop: 30, paddingTop: 18, borderTop: `1px solid ${ACCENT_LINE}`, fontSize: "var(--t-sm)", color: MUTED, textAlign: "center" };
