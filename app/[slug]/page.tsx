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
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { fetchPublicSettings, resolveBranding } from '@/lib/branding';
import { APP_URL } from '@/lib/appUrl';
import { fetchPublicServices } from '@/lib/publicServices';
import BookingPage from '../BookingPage';
import { LOGO_COMPACT } from '@/lib/brand';
import { ogVersion } from '@/lib/og/tenantOg';
import BrandImage from '@/app/BrandImage';

type Props = { params: Promise<{ slug: string }> };

// One line per database call on this page, with the region the function ran in. Her public page is the one
// place a stranger on a phone waits for us, and the logs carry no durations of their own: this is how the
// cost of a call from the function (found 2026-10-06: 0.4-0.9 s each, three in series) is read instead of guessed.
async function timed<T>(label: string, p: PromiseLike<T>): Promise<T> {
  const t0 = Date.now();
  try { return await p; } finally { console.log(`[slug-timing] ${label} ${Date.now() - t0}ms region=${process.env.VERCEL_REGION || 'local'}`); }
}

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
 *
 * cache(): generateMetadata and the page both resolve the same slug in one
 * request; without it that was two identical round trips to Supabase, in series
 * with everything that depends on the tenant id, before a byte could be sent.
 */
const resolveTenant = cache(async (slug: string): Promise<{ id: string; name: string } | null> => {
  try {
    const { data, error } = await timed('tenant-by-slug', publicClient().rpc('get_public_tenant_by_slug', { p_slug: slug }));
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
});

// One read of her public settings per request, shared by generateMetadata and
// the page itself (React's cache() dedupes within a render) - the page now
// needs the same row to paint her hero on the server.
const loadPublicSettings = cache((tenantId: string) => timed('settings', fetchPublicSettings(publicClient(), tenantId)));

// Her active treatments, read the way the browser read them: the anon key, the
// same filter. Null on a failed read, so the client falls back to loading them
// itself instead of showing a business with an empty menu.
const loadServices = cache(async (tenantId: string) => {
  try {
    const { data, error } = await timed('services', fetchPublicServices(publicClient(), tenantId));
    return error ? null : data || [];
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return { title: 'Kalmea' };

  const brand = resolveBranding(await loadPublicSettings(tenant.id));
  const title = brand.businessName || tenant.name || 'Kalmea';
  // Her own words first. A short line gets her treatments after it, and with no words at all
  // the preview names the business and what it offers - never a generic Kalmea sentence.
  const services = ((await loadServices(tenant.id)) || [])
    .map((s: { name?: string }) => String(s?.name || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const own = brand.welcomeMessage || brand.businessDescription;
  const description = own
    ? own.length < 60 && services.length ? `${own} · ${services.join(', ')}` : own
    : services.length ? `קביעת תור אונליין אצל ${title}: ${services.join(', ')}` : `קביעת תור אונליין אצל ${title}`;

  // Every business has a preview image now, generated per tenant (app/og/[key]): her photo,
  // logo, name and accent colour, or the Kalmea banner with her name when she has uploaded
  // nothing. The hash makes a changed photo / name / colour a new URL, so WhatsApp and
  // Instagram - which cache an image by its URL - pick the change up.
  const image = `${APP_URL}/og/${encodeURIComponent(slug)}?v=${ogVersion(brand, title)}`;

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
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
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
          background: 'var(--brand-cream, #FDFBF9)',
        }}
      >
        <BrandImage src={LOGO_COMPACT} alt="Kalmea" width={150} height={44} style={{ width: 150, height: 'auto', marginBottom: 14 }} />
        <h1 style={{ fontSize:"var(--t-2xl)", fontWeight: 600, color: 'var(--ink, #2A2233)', marginBottom: 10, lineHeight: 1.3 }}>
          לא מצאנו עסק בכתובת הזו
        </h1>
        <p style={{ fontSize:"var(--t-lg)", color: 'var(--brand-muted, #7D8D87)', lineHeight: 1.7, maxWidth: 340 }}>
          ייתכן שהקישור השתנה או הוקלד עם שגיאה. כדאי לבקש מהעסק קישור מעודכן.
        </p>
      </div>
    );
  }

  // Both reads run together. If either fails the page gets null for it and
  // loads that part in the browser, as it did before this step existed.
  const [initialSettings, initialServices] = await Promise.all([
    loadPublicSettings(tenant.id),
    loadServices(tenant.id),
  ]);

  return (
    <BookingPage
      tenantId={tenant.id}
      initialSettings={initialSettings && initialServices ? initialSettings : null}
      initialServices={initialSettings && initialServices ? initialServices : null}
    />
  );
}
