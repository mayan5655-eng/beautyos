// app/privacy/page.tsx
// Public Privacy Policy page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

// Legal pages are BloomOS documents, not a tenant's: brand tier, never --pc-*.
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, DEEP_SHADOW, BRAND_WASH_SOFT } from '@/lib/brand';

export const metadata: Metadata = {
  title: "מדיניות פרטיות · BloomOS",
  description: "מדיניות הפרטיות של BloomOS — Beauty Business OS",
};

const CONTACT_EMAIL = "maayanfacebook1992@gmail.com";

export default function PrivacyPage() {
  return (
    <main dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>BloomOS</p>
          <h1 style={titleStyle}>מדיניות פרטיות</h1>
          <p style={enSubtitleStyle} dir="ltr">Privacy Policy</p>
        </header>

        <Section heHeading="מבוא" enHeading="Introduction">
          <He>
            BloomOS (&quot;השירות&quot;, &quot;אנחנו&quot;) מכבד את פרטיותך. מדיניות זו
            מסבירה איזה מידע אנו אוספים, כיצד אנו משתמשים בו, וכיצד אנו מגנים עליו.
            השימוש בשירות מהווה הסכמה למדיניות זו.
          </He>
          <En>
            BloomOS (&quot;the Service&quot;, &quot;we&quot;) respects your privacy.
            This policy explains what information we collect, how we use it, and how
            we protect it. Using the Service constitutes agreement to this policy.
          </En>
        </Section>

        <Section heHeading="איזה מידע אנחנו אוספים" enHeading="Information We Collect">
          <He>
            <strong>ממך, בעלת העסק:</strong> פרטי התחברות (אימייל), פרטי העסק (שם,
            טלפון, כתובת, מיתוג), ונתוני פעילות עסקית — יומן תורים, קבלות, הכנסות,
            חבילות טיפולים.
          </He>
          <He>
            <strong>על הלקוחות שלך, כפי שאת מזינה או שהם ממלאים:</strong> שם, טלפון,
            אימייל, תאריך יום הולדת, סוג עור, אלרגיות, מצב רפואי והצהרות בריאות,
            הערות טיפול, תמונות טיפולים שאת מעלה, היסטוריית תורים ותשלומים, וחוות
            דעת שלקוחות כותבים לאחר ביקור.
          </He>
          <He>
            <strong>מפייסבוק:</strong> כאשר את מחברת דף פייסבוק ומריצה קמפיין לידים,
            אנו מקבלים ממטא את הפרטים שהליד מילא בטופס (שם, טלפון, אימייל ושדות
            נוספים שהגדרת בטופס), יחד עם מזהי הטופס והמודעה. איננו ניגשים לפרופיל
            הפייסבוק של הליד מעבר למה שמולא בטופס.
          </He>
          <He>
            כמו כן נאסף מידע טכני בסיסי (לוגים של שרת) הדרוש לתפעול ולאבטחה.
          </He>
          <En>
            From you, the business owner: login details (email), business details
            (name, phone, address, branding), and business activity data —
            appointments, receipts, revenue, treatment packages. About your clients,
            as you enter it or as they fill it in: name, phone, email, birthday,
            skin type, allergies, medical conditions and health declarations,
            treatment notes, treatment photos you upload, appointment and payment
            history, and reviews clients write after a visit. From Facebook: when
            you connect a page and run a lead campaign, we receive from Meta the
            details the lead filled in the form (name, phone, email and any custom
            fields), with the form and ad identifiers. We do not access the
            lead&apos;s Facebook profile beyond the form. We also collect basic
            technical information (server logs) needed for operations and security.
          </En>
        </Section>

        <Section heHeading="הערות בריאות — מידע רגיש" enHeading="Health Notes — Sensitive Data">
          <He>
            אלרגיות, מצב רפואי והצהרות בריאות הם מידע רגיש. הם נשמרים אך ורק כדי
            שתוכלי לתת טיפול בטוח, מוצגים רק לך בתוך כרטיס הלקוחה, ולעולם אינם
            נשלחים בהודעות, אינם משמשים לשיווק, ואינם משותפים עם אף גורם — למעט
            ספקי האחסון המאובטחים שמפעילים את המערכת.
          </He>
          <En>
            Allergies, medical conditions and health declarations are sensitive
            data. They are stored solely so you can treat safely, are shown only to
            you inside the client&apos;s card, and are never sent in messages, never
            used for marketing, and never shared with anyone — except the secure
            hosting providers that run the system.
          </En>
        </Section>

        <Section heHeading="איך אנחנו משתמשים במידע" enHeading="How We Use Information">
          <He>
            אנו משתמשים במידע כדי לספק ולתפעל את השירות: ניהול היומן והלקוחות שלך,
            שליחת תזכורות ואישורי תור בשמך דרך WhatsApp, קליטת לידים מקמפיינים,
            והפקת תוכן ותובנות בעזרת בינה מלאכותית (למשל דירוג לידים וניסוח
            הודעות). מידע שנשלח לעיבוד AI נשלח לספק המודל לצורך המענה בלבד ואינו
            משמש לאימון מודלים. איננו מוכרים את המידע שלך או של לקוחותיך לאף אחד.
          </He>
          <En>
            We use the information to provide and operate the Service: managing your
            calendar and clients, sending reminders and confirmations on your behalf
            via WhatsApp, receiving leads from campaigns, and generating content and
            insights with AI (e.g. lead scoring and message drafting). Data sent for
            AI processing goes to the model provider solely to produce the response
            and is not used for model training. We do not sell your data or your
            clients&apos; data to anyone.
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

        <Section heHeading="מי רואה את המידע" enHeading="Who Sees the Data">
          <He>
            כל עסק במערכת מבודד: את רואה רק את הלקוחות, התורים והלידים של העסק שלך,
            והבידוד נאכף ברמת בסיס הנתונים. אנו נעזרים בספקי משנה לתפעול: אחסון
            ובסיס נתונים (Supabase), אירוח (Vercel), שליחת הודעות WhatsApp
            (Green API), קבלת לידים (Meta) ועיבוד AI (Anthropic). כל ספק מקבל רק את
            המידע הדרוש לתפקידו. מעבר לכך נשתף מידע רק על פי דרישת חוק.
          </He>
          <En>
            Every business in the system is isolated: you see only your own clients,
            appointments and leads, enforced at the database level. We use
            sub-processors for operations: storage and database (Supabase), hosting
            (Vercel), WhatsApp messaging (Green API), lead delivery (Meta) and AI
            processing (Anthropic). Each provider receives only what its role
            requires. Beyond that, we share data only when required by law.
          </En>
        </Section>

        <Section heHeading="כמה זמן נשמר המידע" enHeading="Data Retention">
          <He>
            המידע נשמר כל עוד החשבון שלך פעיל, כדי שההיסטוריה העסקית שלך תישאר
            זמינה לך. עם סגירת חשבון, המידע נמחק תוך 30 יום, למעט רשומות שאנו
            מחויבים לשמור על פי דין (למשל תיעוד חשבונאי).
          </He>
          <En>
            Data is kept while your account is active, so your business history
            remains available to you. When an account is closed, data is deleted
            within 30 days, except records we are legally required to keep (e.g.
            accounting records).
          </En>
        </Section>

        <Section
          id="data-deletion"
          heHeading="מחיקת מידע"
          enHeading="Data Deletion"
        >
          <He>
            <strong>בעלת עסק</strong> יכולה לבקש מחיקה מלאה של החשבון וכל הנתונים —
            שלחי בקשה מהאימייל שאיתו נרשמת אל <Email /> עם הנושא &quot;מחיקת
            חשבון&quot;. המחיקה תבוצע ותאושר בחזרה תוך 30 יום.
          </He>
          <He>
            <strong>לקוחה של עסק</strong> (כולל מי שהשאירה פרטים בטופס לידים
            בפייסבוק) יכולה לפנות ישירות לעסק שבו טופלה, או אלינו ב-<Email />, ואנו
            נמחק את פרטיה מהמערכת תוך 30 יום. ציינו את שם העסק ואת מספר הטלפון
            שאיתו נרשמתם, כדי שנוכל לאתר את הרשומה.
          </He>
          <En>
            A business owner can request full deletion of the account and all its
            data — email <Email /> from your registration address with the subject
            &quot;Account deletion&quot;. Deletion is completed and confirmed within
            30 days. A client of a business (including anyone who submitted a
            Facebook lead form) can contact the business directly, or us at{" "}
            <Email />, and we will delete their details within 30 days. Include the
            business name and the phone number you signed up with so we can locate
            the record.
          </En>
        </Section>

        <Section heHeading="זכויות המשתמש" enHeading="User Rights">
          <He>
            יש לך זכות לגשת למידע שלך, לתקנו, או לבקש את מחיקתו, בהתאם לחוק הגנת
            הפרטיות. לפניות: <Email />
          </He>
          <En>
            You have the right to access, correct, or request deletion of your data,
            in accordance with applicable privacy law. Contact: <Email />
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
  id,
  children,
}: {
  heHeading: string;
  enHeading: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={sectionStyle}>
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
