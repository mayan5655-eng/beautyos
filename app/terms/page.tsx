// app/terms/page.tsx
// Public Terms of Service page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

export const metadata: Metadata = {
  title: "תנאי שימוש · BABAY",
  description: "תנאי השימוש של BABAY — Beauty Business OS",
};

const CONTACT_EMAIL = "maayanfacebook1992@gmail.com";

export default function TermsPage() {
  return (
    <main dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>BABAY</p>
          <h1 style={titleStyle}>תנאי שימוש</h1>
          <p style={enSubtitleStyle} dir="ltr">Terms of Service</p>
        </header>

        <Section heHeading="כללי" enHeading="General">
          <He>השימוש ב-BABAY כפוף לתנאים אלה. השימוש בשירות מהווה הסכמה להם.</He>
          <En>
            Use of BABAY is subject to these terms. Using the Service constitutes
            agreement to them.
          </En>
        </Section>

        <Section heHeading="השימוש בשירות" enHeading="Use of Service">
          <He>
            השירות מיועד לניהול עסק קוסמטי. אתה אחראי לנכונות המידע שאתה מזין ולשימוש
            חוקי בשירות, כולל קבלת הסכמת לקוחותיך להעלאת תמונות ומידע.
          </He>
          <En>
            The Service is intended for managing a cosmetics business. You are
            responsible for the accuracy of the information you enter and for lawful
            use, including obtaining your clients&apos; consent to upload photos and
            information.
          </En>
        </Section>

        <Section heHeading="אחריות" enHeading="Liability">
          <He>
            השירות ניתן &quot;כפי שהוא&quot;. איננו אחראים לנזקים עקיפים הנובעים
            מהשימוש. אתה אחראי לגיבוי ולציות לחוקי המס והפרטיות החלים על עסקך.
          </He>
          <En>
            The Service is provided &quot;as is&quot;. We are not liable for indirect
            damages arising from use. You are responsible for backups and compliance
            with tax and privacy laws applicable to your business.
          </En>
        </Section>

        <Section heHeading="קניין רוחני" enHeading="Intellectual Property">
          <He>כל הזכויות בשירות שמורות לנו. המידע שאתה מזין נשאר בבעלותך.</He>
          <En>
            All rights in the Service are reserved to us. The data you enter remains
            yours.
          </En>
        </Section>

        <Section heHeading="ביטול" enHeading="Termination">
          <He>ניתן להפסיק את השימוש בכל עת. אנו רשאים להשעות חשבון המפר תנאים אלה.</He>
          <En>
            You may stop using the Service at any time. We may suspend an account
            that violates these terms.
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
