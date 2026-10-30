// app/page.tsx
//
// The public landing page, for every visitor. A Server Component, so an ad click and a crawler both get real HTML before anything paints.
// The app itself lives at /dashboard.

import { createClient } from "@/lib/supabase/server";
import { verifiedUserFromSession } from "@/lib/supabase/sessionGate";
import LandingPage from "./LandingPage";

// Only meaningfully seen by a crawler or a social-share unfurl, both of
// which hit this route with no session - so this describes the landing
// page, not the dashboard a real signed-in visit never exposes metadata
// for anyway (client components don't export it).
export const metadata = {
  title: "קלמיה: ניהול העסק לקוסמטיקאיות ולציפורניסטיות",
  description: "יומן תורים, לקוחות, תשלומים ותוכן שיווקי במקום אחד, לקוסמטיקאיות ולציפורניסטיות עצמאיות. חודש ראשון חינם.",
  openGraph: {
    title: "קלמיה: ניהול העסק לקוסמטיקאיות ולציפורניסטיות",
    description: "יומן, לקוחות, תשלומים ותוכן שיווקי במקום אחד. חודש ראשון חינם.",
    images: [{ url: "/og-1200x630.jpg", width: 1200, height: 630, alt: "קלמיה" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "קלמיה: ניהול העסק לקוסמטיקאיות ולציפורניסטיות",
    description: "יומן, לקוחות, תשלומים ותוכן שיווקי במקום אחד. חודש ראשון חינם.",
    images: ["/og-1200x630.jpg"],
  },
};

export default async function Page() {
  // The landing page for everyone, signed in or not (owner, 2026-10-30): each address is one thing, and the app lives at /dashboard.
  // The session only decides what the header link says. Page-level gate only: the token's signature is verified locally
  // (lib/supabase/sessionGate.ts) instead of a round trip to the Auth server.
  const supabase = await createClient();
  const user = await verifiedUserFromSession(supabase);
  return <LandingPage signedIn={!!user} />;
}
