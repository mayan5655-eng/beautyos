// app/c/[token]/page.tsx
//
// THE CLIENT'S PERSONAL RESULTS PAGE: kalmea.app/c/<token>. Public (the token is the authorisation), never indexed, never cached.
//
// A bad, revoked, expired or unknown link all answer the same neutral page with a 404 status - a visitor cannot tell which, so
// the page cannot be used to probe for tokens. Everything on the page comes from lib/clientPageData.loadPublicClientPage, which
// scopes every read by the tenant and client stored on the link's own row; nothing from the request but the token is used.
// The script this page ships is one small beacon (OpenBeacon); the rest is server-rendered HTML.

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { loadPublicClientPage } from '@/lib/clientPageData';
import { PublicPage, LineIcon } from '@/app/PublicChrome';
import { ICON_QUESTION } from '@/lib/brand';
import ClientPageView from './ClientPageView';
import OpenBeacon from './OpenBeacon';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export default async function ClientResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await loadPublicClientPage(admin(), decodeURIComponent(token));
  if (res.kind === 'gone') notFound();
  if (res.kind === 'error') {
    return (
      <PublicPage owner="kalmea">
        <div className="pub-card">
          <LineIcon src={ICON_QUESTION} />
          <h1 className="pub-h1">הדף לא נטען עכשיו</h1>
          <p className="pub-p">אפשר לנסות לרענן בעוד רגע.</p>
        </div>
      </PublicPage>
    );
  }
  return (
    <ClientPageView page={res.page}>
      <OpenBeacon token={token} />
    </ClientPageView>
  );
}
