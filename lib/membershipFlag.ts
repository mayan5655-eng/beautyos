// lib/membershipFlag.ts
//
// The switch for client memberships ("מנויים ללקוחות", lib/memberships.ts). Safe for the browser: it reads one public variable.
// NEXT_PUBLIC_CLIENT_MEMBERSHIPS empty (the default) = nothing renders anywhere and every memberships route answers 404.
// "1" or "true" only turns the code on; a business still sees nothing until Grow is connected and the saved-card credentials are
// configured on the deployment (membershipsReady in lib/memberships.ts, decided on the server).

/** On only for "1" or "true". The variable is written out in full so Next inlines it into the browser bundle. */
export function clientMembershipsEnabled(
  env: Record<string, string | undefined> = { NEXT_PUBLIC_CLIENT_MEMBERSHIPS: process.env.NEXT_PUBLIC_CLIENT_MEMBERSHIPS },
): boolean {
  const v = String(env.NEXT_PUBLIC_CLIENT_MEMBERSHIPS || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** How a visit covered by a membership is written on the receipt (₪0: the money was counted when the month was charged). */
export const MEMBERSHIP_PAYMENT = 'מנוי';
