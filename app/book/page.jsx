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
// Deliberately NOT a redirect to /[slug]. That would need a tenant -> slug
// lookup, and the only public function in that direction goes slug -> tenant.
// Adding the reverse means another RPC and another hand-run migration to buy
// nothing a visitor can see: the page she lands on is the same page either way.

import BookingPage from "../BookingPage";

export default function BookRoute() {
  return <BookingPage />;
}
