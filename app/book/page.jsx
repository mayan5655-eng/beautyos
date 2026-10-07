// app/book/page.jsx
//
// /book?t=<tenant uuid> — the ORIGINAL public booking URL.
//
// It is not the canonical one any more. /[slug] is: a cosmetician can say
// "bloomos.app/דנה-קוסמטיקס" out loud, and only a server component can carry
// per-tenant Open Graph tags, which is what makes a link she shares preview
// with her own face and her own business name instead of ours.
//
// This route stays, unchanged in behaviour, because every link she has already
// sent a client points at it. A public URL that has been shared is a promise;
// it does not get to stop working because a better one exists. The page reads
// ?t= for itself when no tenant is passed in, exactly as it always did.
//
// Those already-sent links used to preview as "Kalmea - Beauty Business OS" for every
// business. generateMetadata below gives them the same per-tenant title, description and
// image as /[slug] - the links in clients' WhatsApp are the ones that matter most.
//
// Deliberately NOT a redirect to /[slug]. That would need a tenant -> slug
// lookup, and the only public function in that direction goes slug -> tenant.
// Adding the reverse means another RPC and another hand-run migration to buy
// nothing a visitor can see: the page she lands on is the same page either way.

import { cache } from "react";
import { notFound } from "next/navigation";
import BookingPage from "../BookingPage";
import { APP_URL } from "@/lib/appUrl";
import { brandFor, ogVersion } from "@/lib/og/tenantOg";

// One lookup per request, shared by generateMetadata and the page.
const brandOnce = cache(brandFor);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ searchParams }) {
  const t = String((await searchParams)?.t || "");
  if (!UUID.test(t)) return {}; // no business named: the site-wide defaults, as before
  let found = null;
  try { found = await brandOnce(t); } catch { /* a failed lookup keeps the defaults rather than a wrong business */ }
  if (!found) return {};
  const { brand } = found;
  const title = brand.businessName || "Kalmea";
  const description = brand.welcomeMessage || brand.businessDescription || `קביעת תור אונליין אצל ${title}`;
  const image = `${APP_URL}/og/${t}?v=${ogVersion(brand, title)}`;
  return {
    metadataBase: new URL(APP_URL),
    title,
    description,
    openGraph: { type: "website", title, description, locale: "he_IL", siteName: title, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// A booking link that names no business, or names one that does not exist, is a 404 - not a 200 page that says "invalid link" (a soft 404:
// crawlers, link checkers and monitors read the status, not the words). The lookup is the one generateMetadata already makes (shared through
// brandOnce), so this adds no round trip. A lookup that FAILS keeps the page: the client explains, and a hiccup must not become a 404.
export default async function BookRoute({ searchParams }) {
  const t = String((await searchParams)?.t || "");
  if (!UUID.test(t)) notFound();
  let found;
  try { found = await brandOnce(t); } catch { found = undefined; }
  if (found === null) notFound();
  return <BookingPage />;
}
