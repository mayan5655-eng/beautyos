// app/terms/page.tsx
// Public Terms of Service page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

// Legal pages are BloomOS documents, not a tenant's: brand tier, never --pc-*.
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, DEEP_SHADOW, BRAND_WASH_SOFT } from '@/lib/brand';

export const metadata: Metadata = {
  title: "תנאי שימוש · BloomOS",
  description: "תנאי השימוש של BloomOS — Beauty Business OS",
};

const CONTACT_EMAIL = "maayanfacebook1992@gmail.com";

export default function TermsPage() {
  return (
    <main dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>BloomOS</p>
          <h1 style={titleStyle}>תנאי שימוש</h1>
          <p style={enSubtitleStyle} dir="ltr">Terms of Service</p>
        </header>

        <Section heHeading="כללי" enHeading="General">
          <He>השימוש ב-BloomOS כפוף לתנאים אלה. השימוש בשירות מהווה הסכמה להם.</He>
          <En>
            Use of BloomOS is subject to these terms. Using the Service constitutes
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

        <Section heHeading="מידע על לקוחותיך" enHeading="Your Clients' Data">
          <He>
            המידע על לקוחותיך — כולל הערות בריאות, אלרגיות ותמונות — מוזן על ידך
            ובאחריותך. את בעלת המידע; אנו מעבדים אותו עבורך בלבד, בהתאם{" "}
            <a href="/privacy" style={{ color: "inherit" }}>למדיניות הפרטיות</a>.
            באחריותך ליידע את לקוחותיך שפרטיהם נשמרים במערכת ולקבל את הסכמתם ככל
            שנדרש, בפרט למידע בריאותי ולתמונות.
          </He>
          <En>
            Your clients&apos; data — including health notes, allergies and photos —
            is entered by you and under your responsibility. You own it; we process
            it solely for you, per the <a href="/privacy" style={{ color: "inherit" }}>Privacy
            Policy</a>. It is your responsibility to inform your clients that their
            details are stored in the system and to obtain consent where required,
            particularly for health information and photos.
          </En>
        </Section>

        <Section heHeading="הודעות ולידים" enHeading="Messaging and Leads">
          <He>
            המערכת שולחת הודעות WhatsApp בשמך (תזכורות, אישורים, הודעות ללידים).
            את אחראית לתוכן ההודעות ולעמידה בדיני הספאם והפרטיות, כולל כיבוד בקשות
            הסרה. חיבור דף פייסבוק וקליטת לידים כפופים גם לתנאי Meta.
          </He>
          <En>
            The system sends WhatsApp messages on your behalf (reminders,
            confirmations, lead follow-ups). You are responsible for their content
            and for compliance with spam and privacy laws, including honoring
            opt-out requests. Connecting a Facebook page and receiving leads is
            additionally subject to Meta&apos;s terms.
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
          <He>
            ניתן להפסיק את השימוש בכל עת. אנו רשאים להשעות חשבון המפר תנאים אלה.
            עם סגירת חשבון, הנתונים נמחקים תוך 30 יום כמפורט במדיניות הפרטיות.
          </He>
          <En>
            You may stop using the Service at any time. We may suspend an account
            that violates these terms. When an account is closed, data is deleted
            within 30 days as described in the Privacy Policy.
          </En>
        </Section>

        <Section heHeading="יצירת קשר" enHeading="Contact">
          <He>
            <Email />
          </He>
        </Section>

        <footer style={footerStyle}>
          עודכן לאחרונה: ספטמבר 2026 / Last updated: September 2026
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
  minHeight: "100dvh",
  background: BRAND_WASH_SOFT,
  padding: "48px 18px",
  display: "flex",
  justifyContent: "center",
  fontFamily: "var(--font-heebo), 'Heebo', 'Assistant', sans-serif",
  color: DEEP,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  background: SURFACE,
  borderRadius: 20,
  padding: "44px 40px",
  border: `1px solid ${ACCENT_LINE}`,
  boxShadow: `0 14px 44px ${DEEP_SHADOW}, 0 2px 8px rgba(48,24,72,0.04)`,
};

const brandStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 2,
  color: MUTED,
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 38,
  fontWeight: 600,
  color: DEEP,
  lineHeight: 1.2,
  marginBottom: 4,
};

const enSubtitleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 17,
  color: MUTED,
  letterSpacing: 0.5,
};

const sectionStyle: CSSProperties = {
  paddingTop: 24,
  marginTop: 24,
  borderTop: `1px solid ${ACCENT_LINE}`,
};

const h2Style: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: 22,
  fontWeight: 600,
  color: DEEP,
  marginBottom: 2,
};

const enHeadingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: MUTED,
  marginBottom: 12,
};

const heBodyStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.9,
  color: DEEP,
  marginBottom: 10,
};

const enBodyStyle: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.85,
  color: MUTED,
  textAlign: "left",
};

const emailStyle: CSSProperties = {
  color: ACCENT,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const footerStyle: CSSProperties = {
  marginTop: 34,
  paddingTop: 20,
  borderTop: `1px solid ${ACCENT_LINE}`,
  fontSize: 12,
  color: MUTED,
  textAlign: "center",
};
