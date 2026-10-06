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
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { fetchPublicSettings, resolveBranding } from '@/lib/branding';
import { APP_URL } from '@/lib/appUrl';
import { fetchPublicServices } from '@/lib/publicServices';
import { fetchPublicPage } from '@/lib/publicPage';
import BookingPage from '../BookingPage';
import { ogVersion } from '@/lib/og/tenantOg';

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
 * Everything this page needs, in ONE database call when get_public_page is installed
 * (supabase/migrations/pending/public-page-one-call.sql; lib/publicPage.js has the reasoning and the timings:
 * three calls in two serial stages cost 1.5-2.1 s of server time). 'unavailable' means the function is not
 * there yet and the three loaders below use the old reads. Throws on a real failure.
 */
const loadPage = cache((slug: string) => timed('page', fetchPublicPage(publicClient(), slug)));

/**
 * slug -> { id, name }.
 *
 * null = the lookup WORKED and there is no such business. A lookup that FAILED throws (a 500 the error page
 * handles): it must never read as a missing business, or a database hiccup becomes a 404 a crawler keeps.
 * Never a direct read of public.tenants: it carries plan, trial dates and owner_id; the RPCs return what a
 * public page is entitled to.
 *
 * cache(): generateMetadata and the page both resolve the same slug in one request.
 */
const resolveTenant = cache(async (slug: string): Promise<{ id: string; name: string } | null> => {
  try {
    const page = await loadPage(slug);
    if (page.kind === 'found') return page.tenant as { id: string; name: string };
    if (page.kind === 'none') return null;
    // not installed yet: the separate lookup, as before
    const { data, error } = await timed('tenant-by-slug', publicClient().rpc('get_public_tenant_by_slug', { p_slug: slug }));
    if (error) throw new Error(`tenant lookup failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  } catch (err) {
    console.error('[slug] tenant lookup failed:', err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error('tenant lookup failed');
  }
});

// One read of her public settings per request, shared by generateMetadata and the page itself (React's cache()
// dedupes within a render).
const loadPublicSettings = cache(async (slug: string, tenantId: string) => {
  const page = await loadPage(slug);
  if (page.kind === 'found') return page.settings;
  return timed('settings', fetchPublicSettings(publicClient(), tenantId));
});

// Her active treatments. Null on a failed read, so the client falls back to loading them itself instead of
// showing a business with an empty menu.
const loadServices = cache(async (slug: string, tenantId: string) => {
  try {
    const page = await loadPage(slug);
    if (page.kind === 'found') return page.services;
    const { data, error } = await timed('services', fetchPublicServices(publicClient(), tenantId));
    return error ? null : data || [];
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return { title: 'Kalmea', robots: { index: false, follow: false } };

  const brand = resolveBranding(await loadPublicSettings(slug, tenant.id));
  const title = brand.businessName || tenant.name || 'Kalmea';
  // Her own words first. A short line gets her treatments after it, and with no words at all
  // the preview names the business and what it offers - never a generic Kalmea sentence.
  const services = ((await loadServices(slug, tenant.id)) || [])
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

  // No such business: a real 404 (see not-found.tsx for the Hebrew page and why it is not a 200). A FAILED lookup
  // never gets here: resolveTenant throws for that, so a database hiccup is a 500, not a 404 a crawler would keep.
  if (!tenant) notFound();

  // Both reads run together. If either fails the page gets null for it and
  // loads that part in the browser, as it did before this step existed.
  const [initialSettings, initialServices] = await Promise.all([
    loadPublicSettings(slug, tenant.id),
    loadServices(slug, tenant.id),
  ]);

  return (
    <BookingPage
      tenantId={tenant.id}
      initialSettings={initialSettings && initialServices ? initialSettings : null}
      initialServices={initialSettings && initialServices ? initialServices : null}
    />
  );
}
