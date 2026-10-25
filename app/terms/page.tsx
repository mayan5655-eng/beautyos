// app/terms/page.tsx
// Public Terms of Service page — no auth required (single top-level segment is
// treated as public by lib/supabase/middleware.ts). Server component: no
// session/tenant access, so Facebook reviewers and anyone can view it.

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import PublicFooterLinks from "../PublicFooterLinks";
import { supportWhatsAppUrl, KALMEA_SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import KalmeaLegalFooter from "../KalmeaLegalFooter";
import { footerBusinessLine } from "@/lib/kalmeaBusiness";

// Legal pages are Kalmea documents, not a tenant's: brand tier, never --pc-*.
import { ACCENT, DEEP, SURFACE, MUTED, ACCENT_LINE, DEEP_SHADOW, BRAND_WASH_SOFT } from '@/lib/brand';

export const metadata: Metadata = {
  title: "תנאי שימוש · Kalmea",
  description: "תנאי השימוש של קלמיה: מה את מקבלת, מה באחריותך, והמחיר.",
};

const CONTACT_EMAIL = "maayanfacebook1992@gmail.com";

export default function TermsPage() {
  return (
    <div dir="rtl" style={pageStyle}>
      <article style={cardStyle}>
        <header style={{ marginBottom: 10 }}>
          <p style={brandStyle}>Kalmea</p>
          <h1 style={titleStyle}>תנאי שימוש</h1>
          <p style={enSubtitleStyle} dir="ltr">Terms of Service</p>
        </header>

        <Section heHeading="כללי" enHeading="General">
          <He>השימוש ב-קלמיה כפוף לתנאים אלה. השימוש בשירות מהווה הסכמה להם.</He>
          <En>
            Use of Kalmea is subject to these terms. Using the Service constitutes
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
            המערכת שולחת הודעות שירות מסוימות (תזכורות, אישורי תור, אישורי תשלום)
            ב-WhatsApp בשמך באופן אוטומטי כשהחיבור המרכזי פעיל. הודעות שיווק
            ומעקב (הצעות תור, חזרה ללקוחות, הודעות לפניות) מוכנות על ידי המערכת
            ונשלחות בלחיצה שלך מהוואטסאפ האישי שלך — לא אוטומטית. בכל מקרה, את
            אחראית לתוכן ההודעות ולעמידה בדיני הספאם והפרטיות, כולל כיבוד בקשות
            הסרה. חיבור דף פייסבוק וקליטת לידים כפופים גם לתנאי Meta.
          </He>
          <En>
            The system automatically sends certain service messages (reminders,
            booking confirmations, payment confirmations) via WhatsApp on your
            behalf when the central connection is active. Marketing and
            follow-up messages (open-slot offers, win-back messages, lead
            replies) are prepared by the system and sent with a tap from your
            own WhatsApp — not automatically. Either way, you are responsible
            for their content and for compliance with spam and privacy laws,
            including honoring opt-out requests. Connecting a Facebook page
            and receiving leads is additionally subject to Meta&apos;s terms.
          </En>
        </Section>

        <Section heHeading="אחריות" enHeading="Liability">
          <He>
            השירות ניתן &quot;כפי שהוא&quot;. ככל שהדין מתיר, קלמיה ו/או מי מטעמה
            לא יהיו אחראים לנזק ישיר ו/או עקיף שייגרם כתוצאה משימוש בשירות או
            מהסתמכות עליו. אתה אחראי לגיבוי ולציות לחוקי המס והפרטיות החלים על עסקך.
          </He>
          <En>
            The Service is provided &quot;as is&quot;. To the extent permitted by law,
            Kalmea and anyone on its behalf are not liable for any direct or indirect
            damage arising from use of the Service or reliance on it. You are
            responsible for backups and compliance with tax and privacy laws
            applicable to your business.
          </En>
        </Section>

        <Section heHeading="קניין רוחני" enHeading="Intellectual Property">
          <He>כל הזכויות בשירות שמורות לנו. המידע שאתה מזין נשאר בבעלותך.</He>
          <En>
            All rights in the Service are reserved to us. The data you enter remains
            yours.
          </En>
        </Section>

        <Section heHeading="מחיר וחודש ראשון" enHeading="Price and First Month">
          <He>
            המחיר הרגיל הוא 499 ₪ לחודש. החודש הראשון חינם, בלי כרטיס אשראי.
          </He>
          <En>
            The regular price is NIS 499 per month. The first month is free, with
            no credit card.
          </En>
        </Section>

        <Section heHeading="מחיר השקה" enHeading="Launch Price">
          <He>
            מחיר ההשקה הוא 349 ₪ לחודש. מחיר ההשקה עשוי להשתנות בעתיד, ובמקרה
            כזה תישלח הודעה מראש למנויות הקיימות.
          </He>
          <En>
            The launch price is NIS 349 per month. The launch price may change
            in the future, in which case existing subscribers will be given
            advance notice.
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

        <Section heHeading="ביטול עסקה" enHeading="Cancelling a Purchase">
          <He>
            ביטול עסקה יתבצע על פי חוק הגנת הצרכן, התשמ&quot;א-1981 ותקנותיו. אפשר
            לבטל את המנוי בכל עת בהגדרות, או בהודעה במייל או בוואטסאפ. ביטול נכנס
            לתוקף בסוף החודש שכבר שולם, ומאותו רגע לא יבוצעו חיובים נוספים. ביטול
            בתוך 14 ימים מיום העסקה: יוחזר הסכום ששולם, בניכוי דמי ביטול של 5%
            מהסכום או 100 ₪, הנמוך מביניהם, תוך 14 ימים מקבלת הודעת הביטול.
          </He>
          <En>
            Cancellation is governed by the Israeli Consumer Protection Law,
            5741-1981, and its regulations. You may cancel the subscription at
            any time in Settings, or by email or WhatsApp. Cancellation takes
            effect at the end of the month already paid, and no further charges
            are made. Cancelling within 14 days of the purchase: the amount paid
            is refunded within 14 days, less a cancellation fee of 5% or NIS 100,
            whichever is lower.
          </En>
        </Section>

        <Section heHeading="אספקת השירות" enHeading="Delivery of the Service">
          <He>
            קלמיה היא שירות דיגיטלי ואין בו משלוח פיזי. הגישה למערכת ניתנת מיד עם
            ההרשמה, באתר kalmea.app מכל טלפון או מחשב. מנוי בתשלום מופעל מיד עם
            אישור החיוב, ולכל המאוחר תוך יום עסקים אחד. קבלה על כל חיוב נשלחת
            במייל. תמיכה ניתנת בוואטסאפ ובמייל, עם מענה תוך יום עסקים אחד.
          </He>
          <En>
            Kalmea is a digital service with no physical shipping. Access is given
            immediately on sign-up, at kalmea.app from any phone or computer. A paid
            subscription is activated as soon as the charge is approved, and at the
            latest within one business day. A receipt for every charge is sent by
            email. Support is by WhatsApp and email, answered within one business day.
          </En>
        </Section>

        <Section heHeading="הגבלת גיל" enHeading="Age Limit">
          <He>
            רכישה באתר (מנוי לקלמיה, וכן תשלום לעסק דרך דף תשלום של קלמיה) מותרת
            רק למי שמלאו לו 18 שנים, ובכרטיס אשראי שהוא רשאי להשתמש בו. ההגבלה
            חלה על ביצוע רכישה באשראי ולא על עצם השימוש באתר.
          </He>
          <En>
            Purchases on the site (a Kalmea subscription, or a payment to a business
            through a Kalmea payment page) are allowed only to persons aged 18 or
            over, with a credit card they are entitled to use. The limit applies to
            purchasing by credit card, not to using the site itself.
          </En>
        </Section>

        <Section heHeading="פרטיות" enHeading="Privacy">
          <He>
            אנו משתמשים בפרטים שנמסרים באתר רק לצורך מתן השירות, החיוב ומשלוח
            הקבלות, ולא מעבירים אותם לצד שלישי מלבד הספקים הדרושים לכך. פרטי כרטיס
            האשראי מוקלדים בדף המאובטח של חברת הסליקה Grow. כשמאשרים לשמור כרטיס
            לחיובים עתידיים, נשמר במערכת שלנו מזהה מאובטח (טוקן) של הכרטיס, ולא
            מספר הכרטיס עצמו. המידע נשמר בשרתים מאובטחים, כמפורט{" "}
            <a href="/privacy" style={{ color: "inherit" }}>במדיניות הפרטיות</a>.
          </He>
          <En>
            We use the details given on the site only to provide the Service, to
            charge and to send receipts, and do not pass them to third parties other
            than the providers needed for that. Card details are typed on the secure page
            of the payment company Grow. When a card is saved for future charges, our
            system keeps a secure reference to it (a token), never the card number itself. Data is kept on secure servers, as described in the{" "}
            <a href="/privacy" style={{ color: "inherit" }}>Privacy Policy</a>.
          </En>
        </Section>

        <Section id="payments" heHeading="תשלום לעסק דרך קלמיה" enHeading="Paying a Business Through Kalmea">
          <He>
            כשלקוחה משלמת לעסק דרך קישור תשלום או דף הזמנת תור של קלמיה, המוכר
            הוא העסק, וקלמיה מספקת לו את הטכנולוגיה בלבד. הסליקה מתבצעת בדף מאובטח
            של חברת Grow, והקבלה מונפקת על ידי העסק. השירות (הטיפול) ניתן על ידי
            העסק במועד התור שנקבע ובמקום העסק. ביטול וזיכוי: לפי מדיניות הביטולים
            של העסק שמוצגת לפני התשלום, ולפי חוק הגנת הצרכן, התשמ&quot;א-1981.
            שאלות על תשלום או על טיפול יש להפנות לעסק, ואפשר לפנות גם אלינו.
          </He>
          <En>
            When a client pays a business through a Kalmea payment link or booking
            page, the seller is the business; Kalmea only provides the technology.
            Payment is processed on Grow&apos;s secure page and the receipt is issued by
            the business. The service (the treatment) is given by the business at
            the booked time and at its premises. Cancellations and refunds follow the
            business&apos;s cancellation policy shown before payment, and the Consumer
            Protection Law, 5741-1981. Questions about a payment or a treatment go to
            the business, and you may also contact us.
          </En>
        </Section>

        <Section heHeading="יצירת קשר ופרטי העסק" enHeading="Contact and Business Details">
          <He>
            <Email /> · <SupportWhatsApp />
          </He>
          <He>{footerBusinessLine()}</He>
        </Section>

        <footer style={footerStyle}>
          עודכן לאחרונה: אוקטובר 2026 / Last updated: October 2026
        </footer>
        <PublicFooterLinks style={{ padding: "6px 0 0" }} />
        <KalmeaLegalFooter style={{ marginTop: 8 }} />
      </article>
    </div>
  );
}

// === Sub-components ===
function Section({
  id,
  heHeading,
  enHeading,
  children,
}: {
  id?: string;
  heHeading: string;
  enHeading: string;
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
