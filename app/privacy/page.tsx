// app/privacy/page.tsx
// Public Privacy Policy page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import { metaPixelId } from "@/lib/metaPixel";
import type { CSSProperties, ReactNode } from "react";
import PublicFooterLinks from "../PublicFooterLinks";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import KalmeaLegalFooter from "../KalmeaLegalFooter";
import AdConsentReset from "./AdConsentReset";

// Legal pages are Kalmea documents, not a tenant's: brand tier, never --pc-*.
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, DEEP_SHADOW, BRAND_WASH_SOFT } from '@/lib/brand';

export const metadata: Metadata = {
  title: "מדיניות פרטיות · Kalmea",
  description: "מדיניות הפרטיות של קלמיה: איזה מידע נשמר, למה, ואיך הוא מוגן.",
};

const CONTACT_EMAIL = "kalmea.app@gmail.com";

export default function PrivacyPage() {
  return (
    <div dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>מדיניות פרטיות</h1>
          <p style={enSubtitleStyle} dir="ltr">Privacy Policy</p>
        </header>

        <Section heHeading="מבוא" enHeading="Introduction">
          <He>
            קלמיה (&quot;השירות&quot;, &quot;אנחנו&quot;) מכבד את פרטיותך. מדיניות זו
            מסבירה איזה מידע אנו אוספים, כיצד אנו משתמשים בו, וכיצד אנו מגנים עליו.
            השימוש בשירות מהווה הסכמה למדיניות זו.
          </He>
          <En>
            Kalmea (&quot;the Service&quot;, &quot;we&quot;) respects your privacy.
            This policy explains what information we collect, how we use it, and how
            we protect it. Using the Service constitutes agreement to this policy.
          </En>
        </Section>

        <Section heHeading="איזה מידע אנחנו אוספים" enHeading="Information We Collect">
          <He>
            <strong>ממך, בעלת העסק:</strong> פרטי התחברות (אימייל), פרטי העסק (שם,
            טלפון, כתובת, מיתוג), ונתוני פעילות עסקית — יומן תורים, תשלומים, הכנסות,
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
            appointments, payments, revenue, treatment packages. About your clients,
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
            ספקי האחסון המאובטחים שמפעילים את המערכת. סריקת עור (כשהעסק מפעיל
            אותה): תמונת פנים שהלקוחה מצלמת בעצמה, אחרי שאישרה, נשלחת לניתוח AI
            אצל Anthropic, והדוח שמתקבל נשלח אליה בוואטסאפ ונשמר ביומן ההודעות
            של העסק.
          </He>
          <En>
            Allergies, medical conditions and health declarations are sensitive
            data. They are stored solely so you can treat safely, are shown only to
            you inside the client&apos;s card, and are never sent in messages, never
            used for marketing, and never shared with anyone — except the secure
            hosting providers that run the system. Skin scan (when the business
            turns it on): a face photo the client takes herself, after she
            consents, is sent for AI analysis to Anthropic, and the resulting
            report is sent to her on WhatsApp and kept in the business&apos;s
            message log.
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

        {/* Shown only while Kalmea's own Meta Pixel is on (NEXT_PUBLIC_META_PIXEL_ID, lib/metaPixel.ts): never copy for something that is off. */}
        {metaPixelId() && (
          <Section heHeading="מדידת מודעות באתר של קלמיה" enHeading="Ad Measurement on the Kalmea Site">
            <He>
              אתר השיווק של קלמיה (עמוד הבית ועמוד ההרשמה בלבד, לא דפי ההזמנה של העסקים) משתמש ב-Meta Pixel
              כדי למדוד אילו מודעות מביאות הרשמות. לא נשלחים למטא שם, טלפון, אימייל או כל פרט אישי אחר,
              ודפי ההזמנה, התשלום והטפסים של העסקים ושל הלקוחות שלהם לא נמדדים בכלל.
              הפיקסל נטען רק אחרי אישור בהודעה שבתחתית העמוד, ואפשר לחזור בך בכל רגע: <AdConsentReset />
            </He>
            <En>
              The Kalmea marketing site (the home page and the signup page only, not the businesses&apos; booking
              pages) uses Meta Pixel to measure which ads bring signups. No name, phone, email or other personal
              details are sent to Meta, and the businesses&apos; booking, payment and form pages, and their clients,
              are never measured. The pixel loads only after you accept the notice at the bottom of the page, and you can
              withdraw that at any time with the link above.
            </En>
          </Section>
        )}

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
            (Green API), הפקת קבלות וחשבוניות (Morning, רק כשהעסק מחבר את חשבון
            המורנינג שלו והמסמכים מונפקים בחשבון שלו), סליקת תשלומים (Grow, רק כשהעסק מחבר אותה), קבלת לידים (Meta), עיבוד AI (Anthropic), יצירת תמונות (OpenAI) וניטור שגיאות (Sentry). כל ספק מקבל רק את
            המידע הדרוש לתפקידו. מעבר לכך נשתף מידע רק על פי דרישת חוק.
          </He>
          <En>
            Every business in the system is isolated: you see only your own clients,
            appointments and leads, enforced at the database level. We use
            sub-processors for operations: storage and database (Supabase), hosting
            (Vercel), WhatsApp messaging (Green API), receipt and invoice issuing (Morning, only when the business connects its own Morning account; documents are issued in that account), card payments (Grow, only when the business connects it), lead delivery (Meta), AI
            processing (Anthropic), image generation (OpenAI) and error monitoring (Sentry). Each provider receives only what its role
            requires. Beyond that, we share data only when required by law.
          </En>
        </Section>

        {/* 2026-11-16 audit: where the data physically is. The database is AWS ap-southeast-1 (Singapore), the functions run in Vercel
            iad1 (US East; sin1 until 2026-11-18, which Grow refuses); the AI, image, error-monitoring and Meta services are run from abroad, mostly the United States. */}
        <Section id="abroad" heHeading="העברת מידע מחוץ לישראל" enHeading="Transfer of Data Outside Israel">
          <He>
            המידע במערכת נשמר ומעובד בשרתים מחוץ לישראל:
            בסיס הנתונים נמצא בסינגפור, השרתים שמריצים את המערכת נמצאים בארצות הברית, וחלק מספקי המשנה שלמעלה (עיבוד AI,
            יצירת תמונות, ניטור שגיאות ו-Meta) פועלים משרתים בחו&quot;ל, בעיקר
            בארצות הברית. אנו בוחרים ספקים שמחויבים לאבטחת המידע ולשימוש בו רק לצורך
            השירות שהם נותנים לנו, ומעבירים לכל אחד רק את מה שדרוש לתפקידו. השימוש
            במערכת כולל הסכמה להעברה הזו, בהתאם לתקנות הגנת הפרטיות (העברת מידע אל
            מאגרי מידע שמחוץ לגבולות המדינה), התשס&quot;א-2001.
          </He>
          <En>
            Data in the system is stored and processed on servers outside Israel: the
            database is in Singapore, the servers that run the system are in the United
            States, and some of
            the sub-processors above (AI processing, image generation, error monitoring
            and Meta) operate from servers abroad, mainly in the United States. We
            choose providers that are committed to securing the data and to using it
            only for the service they give us, and each receives only what its role
            requires. Using the system includes consent to this transfer, under the
            Privacy Protection (Transfer of Data to Databases Abroad) Regulations, 2001.
          </En>
        </Section>

        <Section heHeading="כמה זמן נשמר המידע" enHeading="Data Retention">
          <He>
            המידע נשמר כל עוד החשבון שלך קיים, כדי שההיסטוריה העסקית שלך תישאר
            זמינה לך. כשתקופת הניסיון מסתיימת בלי תשלום או כשהמנוי מושהה, המערכת
            נסגרת אבל שום דבר לא נמחק: הכול חוזר כשממשיכים, ואפשר להוריד את הנתונים
            גם בזמן שהמערכת סגורה. מחיקת חשבון נעשית לפי בקשה (ראי &quot;מחיקת מידע&quot;
            למטה) ומבוצעת תוך 30 יום. עותקי גיבוי נמחקים במחזור הגיבוי הרגיל, תוך
            שבועות ספורים. רשומות שאנו מחויבים לשמור על פי דין, כמו תיעוד התשלומים
            שלך לקלמיה, נשמרות 7 שנים. מסמכי מס רשמיים שהעסק מפיק דרך Morning נשמרים
            גם בחשבון ה-Morning של העסק, ונשארים שם גם אם החשבון בקלמיה נמחק.
          </He>
          <En>
            Data is kept while your account exists, so your business history remains
            available to you. When a trial ends without payment or a plan is paused,
            the system closes but nothing is deleted: everything returns when you
            continue, and you can download your data while it is closed. Account
            deletion is done on request (see &quot;Data Deletion&quot; below) and is completed
            within 30 days. Backup copies are deleted in the normal backup cycle,
            within a few weeks. Records we must keep by law, such as your payments to
            Kalmea, are kept for 7 years. Official tax documents a business issues through
            Morning are also kept in that business&apos;s own Morning account, and stay there
            even if the Kalmea account is deleted.
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
            הפרטיות, התשמ&quot;א-1981. לפניות: <Email /> או בוואטסאפ <SupportWhatsApp />.
            אם לא קיבלת מענה, או שנראה לך שהמידע שלך לא טופל כדין, אפשר להגיש תלונה
            לרשות להגנת הפרטיות במשרד המשפטים.
          </He>
          <En>
            You have the right to access, correct, or request deletion of your data,
            under the Privacy Protection Law, 5741-1981. Contact: <Email />. If you did
            not get an answer, or you believe your data was not handled lawfully, you
            may file a complaint with the Privacy Protection Authority at Israel&apos;s
            Ministry of Justice.
          </En>
        </Section>

        <Section heHeading="יצירת קשר" enHeading="Contact">
          <He>
            <Email />
          </He>
        </Section>

        <footer style={footerStyle}>
          עודכן לאחרונה: נובמבר 2026 / Last updated: November 2026
        </footer>
        <PublicFooterLinks style={{ padding: "6px 0 0" }} />
        <KalmeaLegalFooter style={{ marginTop: 8 }} />
      </article>
    </div>
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

/** Kalmea support is WhatsApp only (no calls): a wa.me link, never tel:. */
function SupportWhatsApp() {
  return (
    <a href={supportWhatsAppUrl("היי, יש לי שאלה על קלמיה") || undefined} target="_blank" rel="noopener noreferrer" style={emailStyle} dir="ltr" data-testid="support-whatsapp">
      WhatsApp {KALMEA_SUPPORT_WHATSAPP_DISPLAY}
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
  borderRadius:"var(--r-lg)",
  padding: "44px 40px",
  border: `1px solid ${ACCENT_LINE}`,
  boxShadow:"var(--shadow-accent)",
};

const brandStyle: CSSProperties = {
  fontSize:"var(--t-xs)",
  fontWeight: 600,
  letterSpacing: 2,
  color: MUTED,
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize:"var(--t-hero)",
  fontWeight: 600,
  color: DEEP,
  lineHeight: 1.2,
  marginBottom: 4,
};

const enSubtitleStyle: CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize:"var(--t-lg)",
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
  fontSize:"var(--t-2xl)",
  fontWeight: 600,
  color: DEEP,
  marginBottom: 2,
};

const enHeadingStyle: CSSProperties = {
  fontSize:"var(--t-sm)",
  fontWeight: 600,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: MUTED,
  marginBottom: 12,
};

const heBodyStyle: CSSProperties = {
  fontSize:"var(--t-md)",
  lineHeight: 1.9,
  color: DEEP,
  marginBottom: 10,
};

const enBodyStyle: CSSProperties = {
  fontSize:"var(--t-md)",
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
  fontSize:"var(--t-sm)",
  color: MUTED,
  textAlign: "center",
};
