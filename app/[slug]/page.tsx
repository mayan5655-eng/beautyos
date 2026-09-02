// app/[slug]/page.tsx
//
// THE CANONICAL PUBLIC PAGE. bloomos.app/dana-beauty, or in the alphabet most
// of these businesses actually use, bloomos.app/דנה-קוסמטיקס.
//
// It replaces the thin landing page that used to live here - a hero, a service
// list and a button that sent visitors on to /book?t=<uuid>. That was backwards
// in two ways at once: the readable URL led to the lesser page, and the rich
// one lived behind a raw UUID. Now the same component renders at both, and this
// is the address she gives people.
//
// ── Why this file is a SERVER component when the page is a client one ──────
//
// generateMetadata only runs in a server component, and metadata is the whole
// point of the move. Until now every public link previewed as
// "BloomOS — Beauty Business OS" with no image, because app/layout.tsx's static
// title was the only title any of these pages had - the same preview for every
// cosmetician on the platform, on the link that is supposed to be her shop
// window in someone else's WhatsApp.
//
// So: this resolves the tenant on the server, emits her metadata, and hands the
// tenant id to the client component that does the rest.

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { fetchPublicSettings, resolveBranding } from '@/lib/branding';
import { APP_URL } from '@/lib/appUrl';
import BookingPage from '../BookingPage';

type Props = { params: Promise<{ slug: string }> };

// A bare anon client, no cookies. Both functions it calls are SECURITY DEFINER
// and granted to anon, and nothing here depends on a session - so there is no
// reason to pull in the cookie-bound helper and opt the route out of static
// rendering for a request it never makes.
const publicClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

/**
 * slug -> { id, name }, through get_public_tenant_by_slug.
 *
 * Never a direct read of public.tenants: that table carries plan_status,
 * plan_price, trial dates and owner_id, and the RPC returns the two fields a
 * public page is entitled to. An unknown slug comes back empty rather than as
 * an error, so "no such business" stays distinguishable from "the lookup
 * failed" - and a failed lookup must not render as a missing business.
 */
async function resolveTenant(slug: string): Promise<{ id: string; name: string } | null> {
  try {
    const { data, error } = await publicClient().rpc('get_public_tenant_by_slug', { p_slug: slug });
    if (error) {
      console.error('[slug] tenant lookup failed:', error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  } catch (err) {
    console.error('[slug] tenant lookup threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return { title: 'BloomOS' };

  const brand = resolveBranding(await fetchPublicSettings(publicClient(), tenant.id));
  const title = brand.businessName || tenant.name || 'BloomOS';
  const description =
    brand.welcomeMessage ||
    brand.businessDescription ||
    `קביעת תור אונליין אצל ${title}`;

  // portraitOgUrl is the 1200x630 crop written at upload time, next to the
  // portrait itself. Absent when she has not uploaded a photo, and then the
  // link previews with NO image on purpose: our logo on her business is a
  // worse preview than none, and the gap is the prompt to add one.
  const image = brand.portraitOgUrl;

  return {
    metadataBase: new URL(APP_URL),
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${APP_URL}/${encodeURIComponent(slug)}`,
      locale: 'he_IL',
      siteName: title,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);

  // No tenant here. Rendered rather than notFound() because this is a consumer
  // surface in Hebrew and Next's default 404 is an English developer page - a
  // client who mistyped a link should be told something she can act on.
  if (!tenant) {
    return (
      <div
        dir="rtl"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100dvh', padding: '0 24px', textAlign: 'center',
          fontFamily: 'var(--font-assistant), sans-serif',
          background: 'var(--brand-cream, #FEFAF7)',
        }}
      >
        <p style={{ fontSize: 34, color: 'var(--brand-muted, #98879B)', marginBottom: 14 }}>✦</p>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink, #2A2233)', marginBottom: 10, lineHeight: 1.3 }}>
          לא מצאנו עסק בכתובת הזו
        </h1>
        <p style={{ fontSize: 16, color: 'var(--brand-muted, #98879B)', lineHeight: 1.7, maxWidth: 340 }}>
          ייתכן שהקישור השתנה או הוקלד עם שגיאה. כדאי לבקש מהעסק קישור מעודכן.
        </p>
      </div>
    );
  }

  return <BookingPage tenantId={tenant.id} />;
}
