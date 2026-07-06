// app/privacy/page.tsx
// Public Privacy Policy page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

export const metadata: Metadata = {
  title: "מדיניות פרטיות · BABAY",
  description: "מדיניות הפרטיות של BABAY — Beauty Business OS",
};

const CONTACT_EMAIL = "maayanfacebook1992@gmail.com";

export default function PrivacyPage() {
  return (
    <main dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>BABAY</p>
          <h1 style={titleStyle}>מדיניות פרטיות</h1>
          <p style={enSubtitleStyle} dir="ltr">Privacy Policy</p>
        </header>

        <Section heHeading="מבוא" enHeading="Introduction">
          <He>
            BABAY (&quot;השירות&quot;, &quot;אנחנו&quot;) מכבד את פרטיותך. מדיניות זו
            מסבירה איזה מידע אנו אוספים, כיצד אנו משתמשים בו, וכיצד אנו מגנים עליו.
            השימוש בשירות מהווה הסכמה למדיניות זו.
          </He>
          <En>
            BABAY (&quot;the Service&quot;, &quot;we&quot;) respects your privacy.
            This policy explains what information we collect, how we use it, and how
            we protect it. Using the Service constitutes agreement to this policy.
          </En>
        </Section>

        <Section heHeading="איזה מידע אנחנו אוספים" enHeading="Information We Collect">
          <He>
            אנו אוספים מידע שאתה מספק: פרטי התחברות (אימייל), פרטי העסק, פרטי לקוחות
            שאתה מזין (שם, טלפון), תמונות טיפולים שאתה מעלה, ונתוני פעילות עסקית
            (תורים, קבלות, הכנסות). כמו כן נאסף מידע טכני בסיסי לתפעול השירות.
          </He>
          <En>
            We collect information you provide: login details (email), business
            details, client details you enter (name, phone), treatment photos you
            upload, and business activity data (appointments, receipts, revenue). We
            also collect basic technical information to operate the Service.
          </En>
        </Section>

        <Section heHeading="איך אנחנו משתמשים במידע" enHeading="How We Use Information">
          <He>
            אנו משתמשים במידע כדי לספק ולתפעל את השירות, לנהל את היומן והלקוחות שלך,
            לשלוח הודעות ואישורים בשמך (למשל דרך WhatsApp), ולשפר את השירות. איננו
            מוכרים את המידע שלך לצדדים שלישיים.
          </He>
          <En>
            We use the information to provide and operate the Service, manage your
            calendar and clients, send messages and confirmations on your behalf
            (e.g. via WhatsApp), and improve the Service. We do not sell your
            information to third parties.
          </En>
        </Section>

        <Section heHeading="אבטחת מידע" enHeading="Data Security">
          <He>
            אנו נוקטים באמצעים סבירים להגנה על המידע, כולל הצפנה ובקרת גישה מבוססת
            הרשאות, כך שכל משתמש ניגש רק למידע שלו. עם זאת, אף מערכת אינה מאובטחת
            ב-100%.
          </He>
          <En>
            We take reasonable measures to protect the information, including
            encryption and permission-based access control, so each user accesses
            only their own data. However, no system is 100% secure.
          </En>
        </Section>

        <Section heHeading="שיתוף עם צד שלישי" enHeading="Third-Party Sharing">
          <He>
            אנו משתמשים בספקי שירות מהימנים לתפעול (אחסון נתונים, שליחת הודעות). אנו
            משתפים מידע רק ככל הנדרש לתפעול השירות או על פי דרישת חוק.
          </He>
          <En>
            We use trusted service providers for operations (data storage,
            messaging). We share information only as needed to operate the Service or
            as required by law.
          </En>
        </Section>

        <Section heHeading="זכויות המשתמש" enHeading="User Rights">
          <He>
            יש לך זכות לגשת למידע שלך, לתקנו, או לבקש את מחיקתו. לפניות:{" "}
            <Email />
          </He>
          <En>
            You have the right to access, correct, or request deletion of your data.
            Contact: <Email />
          </En>
        </Section>

        <Section heHeading="יצירת קשר" enHeading="Contact">
          <He>
            <Email />
          </He>
        </Section>

        <footer style={footerStyle}>
          עודכן לאחרונה: יולי 2026 / Last updated: July 2026
        </footer>
      </article>
    </main>
  );
}

// === Sub-components ===
function Section({
  heHeading,
  enHeading,
  children,
}: {
  heHeading: string;
  enHeading: string;
  children: ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>{heHeading}</h2>
      <p style={enHeadingStyle} dir="ltr">{enHeading}</p>
      {children}
    </section>
  );
}

function He({ children }: { children: ReactNode }) {
  return <p style={heBodyStyle}>{children}</p>;
}

function En({ children }: { children: ReactNode }) {
  return <p style={enBodyStyle} dir="ltr">{children}</p>;
}

function Email() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={emailStyle} dir="ltr">
      {CONTACT_EMAIL}
    </a>
  );
}

// === Styles (quiet-luxury, warm neutrals, serif headings) ===
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #FAF7F5 0%, #F3EEE9 100%)",
  padding: "48px 18px",
  display: "flex",
  justifyContent: "center",
  fontFamily: "var(--font-heebo), 'Heebo', 'Assistant', sans-serif",
  color: "#2C1A1A",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  background: "#fff",
  borderRadius: 20,
  padding: "44px 40px",
  border: "1px solid #E8DED6",
  boxShadow: "0 14px 44px rgba(44,26,26,0.06), 0 2px 8px rgba(44,26,26,0.03)",
};

const brandStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 2,
  color: "#B4A79C",
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 38,
  fontWeight: 600,
  color: "#1C1C1C",
  lineHeight: 1.2,
  marginBottom: 4,
};

const enSubtitleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 17,
  color: "#9A8F86",
  letterSpacing: 0.5,
};

const sectionStyle: CSSProperties = {
  paddingTop: 24,
  marginTop: 24,
  borderTop: "1px solid #EFE7DF",
};

const h2Style: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 22,
  fontWeight: 600,
  color: "#1C1C1C",
  marginBottom: 2,
};

const enHeadingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#B4A79C",
  marginBottom: 12,
};

const heBodyStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.9,
  color: "#5C534C",
  marginBottom: 10,
};

const enBodyStyle: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.85,
  color: "#8A8079",
  textAlign: "left",
};

const emailStyle: CSSProperties = {
  color: "#C08A5E",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const footerStyle: CSSProperties = {
  marginTop: 34,
  paddingTop: 20,
  borderTop: "1px solid #EFE7DF",
  fontSize: 12,
  color: "#9A8F86",
  textAlign: "center",
};
