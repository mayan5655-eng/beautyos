// /c/demo-fixture: the personal page drawn from made-up data, for looking at it (screenshots, phone profiles) on a preview
// deployment before the client_pages table exists. It reads nothing, takes no token, and does not exist on production:
// notFound() there. Stock pictures from public/defaults - no client, no real business.
import { notFound } from 'next/navigation';
import ClientPageView from '../[token]/ClientPageView';
import { normalizeLang } from '@/lib/i18n/core';
import { DocumentLang } from '@/lib/i18n/react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הדף האישי שלך', robots: { index: false, follow: false } };

// ?lang=ar / ?lang=en: the same page in the business's other languages (lib/i18n).
export default async function Fixture({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const lang = normalizeLang((await searchParams)?.lang);
  return (
    <>
    <DocumentLang lang={lang} />
    <ClientPageView
      page={{
        businessName: 'סטודיו דוגמה',
        logoUrl: '',
        accent: '#5B8A8A',
        clientName: 'רונית כהן',
        treatments: [
          { service: 'טיפול פנים קלאסי', count: 4, lastDate: '2026-10-12' },
          { service: 'פילינג עדין', count: 1, lastDate: '2026-09-02' },
        ],
        results: [
          { id: 'a', serviceName: 'טיפול פנים קלאסי', before: '/defaults/acne.jpg', after: '/defaults/facial-classic.jpg', caption: 'אחרי 4 טיפולים', sessions: 4 },
          { id: 'b', serviceName: 'גבות', before: '', after: '/defaults/brows.jpg', caption: '', sessions: null },
        ],
        aftercare: ['להימנע ממים חמים ומסאונה 24 שעות', 'קרם הגנה כל יום, גם בחורף', 'לשתות הרבה מים'],
        bookPath: '/demo',
        bookHref: '/demo?name=%D7%A8%D7%95%D7%A0%D7%99%D7%AA+%D7%9B%D7%94%D7%9F',
        pageId: 'fixture',
        lang,
        loyalty: { every: 10, filled: 7, remaining: 3, ready: false, reward: 'הטיפול העשירי במתנה', line: 'עוד 3 ביקורים למתנה' },
      }}
    />
    </>
  );
}
