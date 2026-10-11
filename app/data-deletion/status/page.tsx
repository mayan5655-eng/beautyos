// app/data-deletion/status/page.tsx
//
// Public status page for a Facebook data deletion request (the `url` returned by
// /api/facebook/data-deletion). The code is a signed token: only a request we actually handled verifies, and it
// carries no personal data. Server component, no session.
import type { Metadata } from 'next';
import { readDeletionCode } from '@/lib/facebook/signedRequest';

export const metadata: Metadata = {
  title: 'Data deletion status · Kalmea',
  robots: { index: false, follow: false },
};

export default async function DeletionStatus({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const hit = readDeletionCode(code, process.env.FACEBOOK_APP_SECRET);
  const when = hit ? hit.at.toISOString().slice(0, 10) : '';
  return (
    <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 20px', fontFamily: "'Assistant',sans-serif", color: '#2A2233', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Data deletion request</h1>
      {hit ? (
        <>
          <p dir="ltr" style={{ textAlign: 'left' }}>
            Your request was received on <b>{when}</b> and has been processed. Kalmea removed the Facebook Page connections
            and access tokens that were stored for your Facebook account.
          </p>
          <p dir="ltr" style={{ textAlign: 'left' }}>
            Lead form submissions belong to the business whose ad you answered. To have those removed, contact that
            business or write to us from the address in our <a href="/privacy#data-deletion">privacy policy</a>; we
            remove them within 30 days.
          </p>
          <div dir="rtl">
            <p>
              הבקשה שלך התקבלה בתאריך <b>{when}</b> ובוצעה. חיבורי הדפים והטוקנים ששמרנו עבור חשבון הפייסבוק שלך נמחקו.
              פניות שהושארו בטופס מודעה שייכות לעסק שפרסם אותה; כדי למחוק אותן, פני לעסק או אלינו, לפי{' '}
              <a href="/privacy#data-deletion">מדיניות הפרטיות</a>.
            </p>
          </div>
        </>
      ) : (
        <p dir="ltr" style={{ textAlign: 'left' }}>
          We could not verify this confirmation code. If you submitted a deletion request through Facebook and need help, see the{' '}
          <a href="/privacy#data-deletion">Data Deletion</a> section of our privacy policy.
        </p>
      )}
    </div>
  );
}
