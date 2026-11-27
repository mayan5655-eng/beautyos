// app/dashboard/protocol-book/page.tsx — "ספר הפרוטוקולים". 404 while NEXT_PUBLIC_PROTOCOL_BOOK is off.
// Access (free vs full, cosmetics vs nails) is decided here, on the server: only the protocols she may open are sent.
import { notFound, redirect } from 'next/navigation';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/adminGuard';
import { protocolBookEnabled } from '@/lib/protocolBook/book';
import { loadBookContext } from '@/lib/protocolBook/load';
import ProtocolBookView from './ProtocolBookView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ספר הפרוטוקולים' };

export default async function ProtocolBookPage() {
  if (!protocolBookEnabled()) notFound();
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect('/login');
  const admin = await requirePlatformAdmin();
  const ctx = await loadBookContext(session as never, admin.ok);
  if (!ctx) redirect('/dashboard');
  return (
    <ProtocolBookView
      protocols={ctx.protocols}
      fields={ctx.fields}
      services={ctx.services}
      links={ctx.links}
      initialLang={ctx.lang}
      certificate={ctx.certificate}
    />
  );
}
