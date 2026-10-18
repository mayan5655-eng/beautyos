// app/api/billing/card/route.ts
//
// POST -> opens the provider's HOSTED page where she saves her card, and returns its address. Card details are typed on the provider's page
// only; nothing in Kalmea ever sees them, and what comes back is a token reference (see /api/billing/mock-card for the mock page, and
// lib/billing/live.ts for the real provider's wiring).
import { NextResponse } from 'next/server';
import { isDemoTenantId } from '@/lib/demoTenants';
import { APP_URL } from '@/lib/appUrl';
import { billing, caller } from '../_shared';

export async function POST() {
  const c = await caller();
  if ('error' in c) return c.error;
  if (isDemoTenantId(c.tenantId)) return NextResponse.json({ success: false, error: 'זו תצוגה, אי אפשר להוסיף כרטיס בחשבון הדגמה' }, { status: 403 });

  const b = billing();
  if (!b.configured || !b.payments) {
    return NextResponse.json({ success: false, code: 'not-configured', error: 'התשלום בכרטיס אשראי עוד לא פעיל. נעדכן כשהוא זמין.' }, { status: 409 });
  }
  try {
    const session = await b.payments.createCardSession({ tenantId: c.tenantId, businessName: '', email: c.email, returnUrl: `${APP_URL}/dashboard?billing=card` });
    return NextResponse.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[billing] card session failed:', (e as Error)?.message);
    return NextResponse.json({ success: false, error: 'לא הצלחנו לפתוח את דף הכרטיס, נסי שוב בעוד רגע' }, { status: 502 });
  }
}
